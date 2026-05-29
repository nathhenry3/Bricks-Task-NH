/**
 * Dynamic scenario event source for runtime event generation.
 *
 * Instead of consuming a pre-authored array of timed events, this source
 * generates events lazily on each tick using configurable per-subtask
 * rates, cooldowns, and cross-task blocking rules. Supports:
 *
 *  - Seeded RNG for reproducibility
 *  - Per-subtask event intervals with jitter
 *  - Minimum gaps (cooldowns) between events on the same subtask
 *  - Maximum concurrent active failures across all subtasks
 *  - Automation reliability: fraction of failures that auto-resolve
 *  - Warmup / cooldown quiet periods at session start/end
 *
 * Implements the ScenarioEventSource interface so it can be used
 * interchangeably with the static ScenarioScheduler.
 */

import type { ScenarioEvent, ScenarioEventSource, SubtaskAutomationState } from "./scenarioScheduler";

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

export interface DynamicSysmonConfig {
  /** Scale gauge ids available for failure injection. */
  scaleIds?: string[];
  /** Light ids available for failure injection. */
  lightIds?: string[];
  /** Mean interval between sysmon failure events (ms). */
  intervalMs?: number;
  /** Minimum gap after a failure before the next can fire (ms). */
  minGapMs?: number;
  /**
   * Reliability: probability (0–1) that a failure auto-resolves.
   * When a failure auto-resolves, a paired "resolve" event fires
   * after autoResolveDelayMs.
   */
  reliability?: number;
  /** Delay (ms) before an automated failure resolves. Default 4000. */
  autoResolveDelayMs?: number;
  /** When true, the subtask handles events automatically without participant input. */
  automated?: boolean;
}

export interface DynamicCommsConfig {
  ownCallsign?: string;
  otherCallsigns?: string[];
  radioIds?: string[];
  frequencyRange?: { minMhz: number; maxMhz: number; stepMhz: number };
  /** Mean interval between comms prompts (ms). */
  intervalMs?: number;
  /** Fraction of prompts that use the participant's own callsign (0–1). */
  ownRatio?: number;
  /** Minimum gap between prompts (ms). */
  minGapMs?: number;
  /** Min frequency variation from current (MHz). */
  minVariationMhz?: number;
  /** Max frequency variation from current (MHz). */
  maxVariationMhz?: number;
  /** Starting frequencies per radio id. */
  radioDefaultFreqsMhz?: Record<string, number>;
  /** When true, the subtask handles events automatically without participant input. */
  automated?: boolean;
}

export interface DynamicResmanConfig {
  /** Pump ids available for failure injection. */
  pumpIds?: string[];
  /** Mean interval between pump failure events (ms). */
  intervalMs?: number;
  /** How long a pump stays failed before being restored (ms). */
  failureDurationMs?: number;
  /** Minimum gap between pump failure start events (ms). */
  minGapMs?: number;
  /**
   * Reliability: probability (0–1) that a failure auto-resolves.
   * Auto-resolved failures restore the pump after failureDurationMs.
   */
  reliability?: number;
  /** When true, the subtask handles events automatically without participant input. */
  automated?: boolean;
}

export interface DynamicTrackingConfig {
  /**
   * When true, the automation system actively compensates for perturbation,
   * keeping the cursor near centre without requiring mouse input.
   */
  automated?: boolean;
  /** Compensation gain: 0 = no tracking, 1 = perfect. Default 0.95. */
  automationGain?: number;
}

export interface DynamicScenarioSourceConfig {
  /** Total session duration in ms (required for cooldown calculation). */
  durationMs: number;
  /** Integer seed for reproducible generation. Default 1. */
  seed?: number;
  /** Quiet period at session start before events fire (ms). Default 20000. */
  warmupMs?: number;
  /** Quiet period at session end where no new events start (ms). Default 15000. */
  cooldownMs?: number;
  /**
   * Maximum number of subtasks that may have active (unresolved) failures
   * simultaneously. 0 = unlimited. Default 0.
   */
  maxConcurrentFailures?: number;

  sysmon?: DynamicSysmonConfig;
  comms?: DynamicCommsConfig;
  resman?: DynamicResmanConfig;
  tracking?: DynamicTrackingConfig;
}

// ---------------------------------------------------------------------------
// Seeded PRNG (xorshift32 — matches scenarioGenerator.ts)
// ---------------------------------------------------------------------------

function makePrng(seed: number): () => number {
  let state = (seed >>> 0) || 1;
  return function (): number {
    state += 0x6d2b79f5;
    let v = state;
    v = Math.imul(v ^ (v >>> 15), v | 1);
    v ^= v + Math.imul(v ^ (v >>> 7), v | 61);
    return ((v ^ (v >>> 14)) >>> 0) / 4294967296;
  };
}

function jitter(base: number, factor: number, rng: () => number): number {
  return Math.round(base * (1 + (rng() * 2 - 1) * factor));
}

function pickRandom<T>(arr: T[], rng: () => number): T {
  return arr[Math.floor(rng() * arr.length)];
}

function roundToStep(value: number, step: number): number {
  return Math.round(value / step) * step;
}

// ---------------------------------------------------------------------------
// Per-subtask generator state
// ---------------------------------------------------------------------------

interface SubtaskGenState {
  /** Elapsed time at which the next event *could* fire (subject to blocking). */
  nextEligibleMs: number;
  /** Whether a failure is currently active on this subtask. */
  activeFailure: boolean;
  /** Whether the subtask is automated. */
  automated: boolean;
  /** Scheduled deferred events (e.g., auto-resolve after delay). */
  deferredEvents: ScenarioEvent[];
}

// ---------------------------------------------------------------------------
// DynamicScenarioSource
// ---------------------------------------------------------------------------

export class DynamicScenarioSource implements ScenarioEventSource {
  private readonly rng: () => number;
  private readonly cfg: Required<
    Pick<DynamicScenarioSourceConfig, "durationMs" | "warmupMs" | "cooldownMs" | "maxConcurrentFailures">
  >;
  private readonly sysmon: Required<DynamicSysmonConfig>;
  private readonly comms: Required<DynamicCommsConfig>;
  private readonly resman: Required<DynamicResmanConfig>;

  private readonly states: Record<string, SubtaskGenState>;
  private readonly activeEnd: number;

  /** Simulated per-radio current frequency (for realistic comms targets). */
  private readonly radioCurrentFreq: Record<string, number>;

  /** All events generated so far, for inspection / logging. */
  private readonly generatedEvents: ScenarioEvent[] = [];

  private lastTickMs = -1;

  constructor(config: DynamicScenarioSourceConfig) {
    this.rng = makePrng(config.seed ?? 1);

    const warmupMs = config.warmupMs ?? 20000;
    const cooldownMs = config.cooldownMs ?? 15000;

    this.cfg = {
      durationMs: config.durationMs,
      warmupMs,
      cooldownMs,
      maxConcurrentFailures: config.maxConcurrentFailures ?? 0,
    };

    this.activeEnd = config.durationMs - cooldownMs;

    // ── Sysmon defaults ──────────────────────────────────────────────
    const sc = config.sysmon ?? {};
    this.sysmon = {
      scaleIds:           sc.scaleIds ?? ["scale1", "scale2", "scale3", "scale4"],
      lightIds:           sc.lightIds ?? ["light1", "light2"],
      intervalMs:         sc.intervalMs ?? 30000,
      minGapMs:           sc.minGapMs ?? 8000,
      reliability:        sc.reliability ?? 0,
      autoResolveDelayMs: sc.autoResolveDelayMs ?? 4000,
      automated:          sc.automated ?? false,
    };

    // ── Comms defaults ───────────────────────────────────────────────
    const cc = config.comms ?? {};
    const freqRange = cc.frequencyRange ?? { minMhz: 108.0, maxMhz: 137.0, stepMhz: 0.1 };
    this.comms = {
      ownCallsign:        cc.ownCallsign ?? "NASA504",
      otherCallsigns:     cc.otherCallsigns ?? ["DELTA221", "ECHO775", "BRAVO312"],
      radioIds:           cc.radioIds ?? ["nav1", "nav2", "com1", "com2"],
      frequencyRange:     freqRange,
      intervalMs:         cc.intervalMs ?? 40000,
      ownRatio:           cc.ownRatio ?? 0.5,
      minGapMs:           cc.minGapMs ?? 15000,
      minVariationMhz:    cc.minVariationMhz ?? 5.0,
      maxVariationMhz:    cc.maxVariationMhz ?? 6.0,
      radioDefaultFreqsMhz: cc.radioDefaultFreqsMhz ?? {},
      automated:          cc.automated ?? false,
    };

    // ── Resman defaults ──────────────────────────────────────────────
    const rc = config.resman ?? {};
    this.resman = {
      pumpIds:           rc.pumpIds ?? ["1", "2", "3", "4", "5", "6"],
      intervalMs:        rc.intervalMs ?? 60000,
      failureDurationMs: rc.failureDurationMs ?? 30000,
      minGapMs:          rc.minGapMs ?? 15000,
      reliability:       rc.reliability ?? 0,
      automated:         rc.automated ?? false,
    };

    // ── Initial scheduling times ─────────────────────────────────────
    this.states = {
      sysmon: {
        nextEligibleMs: warmupMs + jitter(this.sysmon.intervalMs * 0.5, 0.4, this.rng),
        activeFailure: false,
        automated: false,
        deferredEvents: [],
      },
      comms: {
        nextEligibleMs: warmupMs + jitter(this.comms.intervalMs * 0.6, 0.3, this.rng),
        activeFailure: false,
        automated: false,
        deferredEvents: [],
      },
      resman: {
        nextEligibleMs: warmupMs + jitter(this.resman.intervalMs * 0.8, 0.3, this.rng),
        activeFailure: false,
        automated: false,
        deferredEvents: [],
      },
    };

    // ── Radio frequencies ────────────────────────────────────────────
    const midFreq = roundToStep(
      (freqRange.minMhz + freqRange.maxMhz) / 2,
      freqRange.stepMhz,
    );
    this.radioCurrentFreq = {};
    for (const id of this.comms.radioIds) {
      this.radioCurrentFreq[id] = this.comms.radioDefaultFreqsMhz[id] ?? midFreq;
    }
  }

  // ── ScenarioEventSource interface ──────────────────────────────────

  tick(elapsedMs: number): ScenarioEvent[] {
    if (elapsedMs <= this.lastTickMs) return [];
    this.lastTickMs = elapsedMs;

    const events: ScenarioEvent[] = [];

    // Flush any deferred events that are now due.
    for (const state of Object.values(this.states)) {
      const still: ScenarioEvent[] = [];
      for (const ev of state.deferredEvents) {
        if (ev.timeMs <= elapsedMs) {
          events.push(ev);
        } else {
          still.push(ev);
        }
      }
      state.deferredEvents = still;
    }

    // Don't generate new events in the cooldown period.
    if (elapsedMs >= this.activeEnd) {
      this.generatedEvents.push(...events);
      return events;
    }

    // Check cross-task concurrency limit.
    const activeFailureCount = Object.values(this.states)
      .filter((s) => s.activeFailure).length;
    const maxConc = this.cfg.maxConcurrentFailures;

    // ── Sysmon ───────────────────────────────────────────────────────
    if (this.tryGenerate("sysmon", elapsedMs, activeFailureCount, maxConc)) {
      const st = this.states.sysmon;
      const allGauges = [...this.sysmon.scaleIds, ...this.sysmon.lightIds];
      const gauge = pickRandom(allGauges, this.rng);
      const isScale = this.sysmon.scaleIds.includes(gauge);
      const failureValue = isScale ? (this.rng() < 0.5 ? "up" : "down") : true;
      const path = isScale ? `${gauge}.failure` : `${gauge}.on`;

      events.push({ timeMs: elapsedMs, targetId: "sysmon", command: "set", path, value: failureValue });
      st.activeFailure = true;

      // Auto-resolve based on reliability
      if (this.rng() < this.sysmon.reliability) {
        const resolveTime = elapsedMs + this.sysmon.autoResolveDelayMs;
        st.deferredEvents.push(
          { timeMs: resolveTime, targetId: "sysmon", command: "set", path, value: isScale ? false : false },
        );
      }

      st.nextEligibleMs = elapsedMs + Math.max(
        this.sysmon.minGapMs,
        jitter(this.sysmon.intervalMs, 0.3, this.rng),
      );
    }

    // ── Comms ────────────────────────────────────────────────────────
    if (this.tryGenerate("comms", elapsedMs, activeFailureCount, maxConc)) {
      const st = this.states.comms;
      const isOwn = this.rng() < this.comms.ownRatio;
      const callsign = isOwn ? this.comms.ownCallsign : pickRandom(this.comms.otherCallsigns, this.rng);
      const radio = pickRandom(this.comms.radioIds, this.rng);

      const variation = this.comms.minVariationMhz + this.rng() * (this.comms.maxVariationMhz - this.comms.minVariationMhz);
      const sign = this.rng() < 0.5 ? 1 : -1;
      const raw = this.radioCurrentFreq[radio] + sign * variation;
      const clamped = Math.max(this.comms.frequencyRange.minMhz, Math.min(this.comms.frequencyRange.maxMhz, raw));
      const freqMhz = roundToStep(clamped, this.comms.frequencyRange.stepMhz);

      events.push({
        timeMs: elapsedMs,
        targetId: "comms",
        command: "prompt",
        value: { callsign, radio, frequency: +freqMhz.toFixed(3) },
      });

      this.radioCurrentFreq[radio] = freqMhz;

      st.nextEligibleMs = elapsedMs + Math.max(
        this.comms.minGapMs,
        jitter(this.comms.intervalMs, 0.3, this.rng),
      );
    }

    // ── Resman ───────────────────────────────────────────────────────
    if (this.tryGenerate("resman", elapsedMs, activeFailureCount, maxConc)) {
      const st = this.states.resman;
      const pump = pickRandom(this.resman.pumpIds, this.rng);

      events.push({
        timeMs: elapsedMs,
        targetId: "resman",
        command: "set",
        path: `pump.${pump}.state`,
        value: "failed",
      });
      st.activeFailure = true;

      // Auto-resolve based on reliability
      if (this.rng() < this.resman.reliability) {
        const resolveTime = elapsedMs + this.resman.failureDurationMs;
        if (resolveTime < this.activeEnd) {
          st.deferredEvents.push({
            timeMs: resolveTime,
            targetId: "resman",
            command: "set",
            path: `pump.${pump}.state`,
            value: "off",
          });
        }
      }

      st.nextEligibleMs = elapsedMs + Math.max(
        this.resman.minGapMs,
        jitter(this.resman.intervalMs, 0.3, this.rng),
      );
    }

    this.generatedEvents.push(...events);
    return events;
  }

  notifyState(subtaskId: string, state: SubtaskAutomationState): void {
    const gen = this.states[subtaskId];
    if (!gen) return;
    gen.automated = state.automated;
    gen.activeFailure = state.activeFailure;
    if (!state.activeFailure && state.lastEventEndMs > 0) {
      // Ensure cooldown from resolution time.
      const subtaskCfg = this.getSubtaskMinGap(subtaskId);
      gen.nextEligibleMs = Math.max(gen.nextEligibleMs, state.lastEventEndMs + subtaskCfg);
    }
  }

  reset(): void {
    this.lastTickMs = -1;
    this.generatedEvents.length = 0;
    for (const state of Object.values(this.states)) {
      state.deferredEvents = [];
      state.activeFailure = false;
    }
    // Re-seed would require storing original seed; for now reset just
    // clears state. The RNG continues from its current position.
  }

  // ── Runtime parameter adjustment (for adaptive controller) ─────────

  /**
   * Adjust event generation parameters at runtime. Only the provided
   * fields are updated; everything else remains unchanged.
   */
  adjustParams(params: {
    sysmon?: Partial<Pick<DynamicSysmonConfig, "intervalMs" | "minGapMs" | "reliability" | "autoResolveDelayMs">>;
    comms?: Partial<Pick<DynamicCommsConfig, "intervalMs" | "minGapMs">>;
    resman?: Partial<Pick<DynamicResmanConfig, "intervalMs" | "minGapMs" | "reliability" | "failureDurationMs">>;
    maxConcurrentFailures?: number;
  }): void {
    if (params.sysmon) Object.assign(this.sysmon, params.sysmon);
    if (params.comms) Object.assign(this.comms, params.comms);
    if (params.resman) Object.assign(this.resman, params.resman);
    if (params.maxConcurrentFailures !== undefined) {
      (this.cfg as { maxConcurrentFailures: number }).maxConcurrentFailures = params.maxConcurrentFailures;
    }
  }

  /** Returns a snapshot of current generation parameters (for logging). */
  getParams(): {
    sysmon: { intervalMs: number; reliability: number };
    comms: { intervalMs: number };
    resman: { intervalMs: number; reliability: number };
    maxConcurrentFailures: number;
  } {
    return {
      sysmon: { intervalMs: this.sysmon.intervalMs, reliability: this.sysmon.reliability },
      comms: { intervalMs: this.comms.intervalMs },
      resman: { intervalMs: this.resman.intervalMs, reliability: this.resman.reliability },
      maxConcurrentFailures: this.cfg.maxConcurrentFailures,
    };
  }

  /** All events generated so far, for inspection or CSV export. */
  allGeneratedEvents(): ScenarioEvent[] {
    return [...this.generatedEvents];
  }

  // ── Internals ──────────────────────────────────────────────────────

  /**
   * Check whether a subtask is eligible to fire a new event right now.
   */
  private tryGenerate(
    subtaskId: string,
    elapsedMs: number,
    activeFailureCount: number,
    maxConc: number,
  ): boolean {
    const st = this.states[subtaskId];
    if (!st) return false;

    // Not yet time for this subtask.
    if (elapsedMs < st.nextEligibleMs) return false;

    // Subtask already has an active failure — wait for resolution.
    if (st.activeFailure) return false;

    // Cross-task concurrency limit (0 = unlimited).
    if (maxConc > 0 && activeFailureCount >= maxConc) return false;

    return true;
  }

  private getSubtaskMinGap(subtaskId: string): number {
    switch (subtaskId) {
      case "sysmon": return this.sysmon.minGapMs;
      case "comms": return this.comms.minGapMs;
      case "resman": return this.resman.minGapMs;
      default: return 10000;
    }
  }
}
