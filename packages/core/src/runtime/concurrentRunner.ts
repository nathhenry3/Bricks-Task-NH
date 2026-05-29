/**
 * Concurrent sub-task runner for multi-task paradigms (e.g., MATB).
 *
 * Manages a shared requestAnimationFrame loop that ticks multiple
 * sub-task handles simultaneously, routes input events, and
 * coordinates start/stop via a ScenarioScheduler.
 *
 * Usage:
 *   const runner = new ConcurrentTaskRunner(subtasks, {
 *     onEvent: (e) => eventLogger.emit(e.type, e),
 *   });
 *   runner.start();
 *   // ... later
 *   const results = runner.stop();
 */

import type { ScenarioEvent, ScenarioEventSource, ScenarioScheduler, SubtaskAutomationState } from "./scenarioScheduler";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * Interface that each sub-task must implement to participate in
 * the concurrent runner.
 */
export interface SubTaskHandle<TResult = unknown> {
  /** Unique identifier for this sub-task (e.g., "sysmon", "tracking"). */
  readonly id: string;

  /**
   * Called once when the scenario starts this sub-task.
   * The container is the DOM element to render into.
   */
  start(container: HTMLElement, config: Record<string, unknown>): void;

  /**
   * Called every animation frame while the sub-task is active.
   * @param now   - performance.now() timestamp
   * @param dt    - milliseconds since previous step
   */
  step(now: number, dt: number): void;

  /**
   * Called when a keyboard event occurs. Return true if the sub-task
   * consumed the event (prevents other sub-tasks from seeing it).
   */
  handleKeyDown?(key: string, now: number): boolean;

  /**
   * Called when the sub-task receives a scenario event.
   * Used for parameter changes, prompts, failure injections, etc.
   */
  handleScenarioEvent?(event: ScenarioEvent): void;

  /**
   * Called when the sub-task should stop. Returns its result data.
   */
  stop(): TResult;

  /**
   * Returns current performance metrics (for live gauge / logging).
   */
  getPerformance?(): SubTaskPerformance;
}

export interface SubTaskPerformance {
  /** 0-1 normalised score, where 1 = perfect. */
  score: number;
  /** Optional per-metric breakdown for logging. */
  metrics?: Record<string, number>;
}

export interface ConcurrentRunnerConfig {
  /** Optional callback for runner-level events (start, stop, pause, etc.). */
  onEvent?: (event: ConcurrentRunnerEvent) => void;
  /** Optional callback fired each frame with aggregated performance. */
  onPerformanceTick?: (performance: Map<string, SubTaskPerformance>) => void;
}

export interface ConcurrentRunnerEvent {
  type: string;
  elapsedMs: number;
  [key: string]: unknown;
}

// ---------------------------------------------------------------------------
// ScenarioClock
// ---------------------------------------------------------------------------

export class ScenarioClock {
  private startTime = 0;
  private pauseOffset = 0;
  private pauseStart = 0;
  private paused = false;
  private running = false;

  start(): void {
    this.startTime = performance.now();
    this.pauseOffset = 0;
    this.pauseStart = 0;
    this.paused = false;
    this.running = true;
  }

  pause(): void {
    if (!this.running || this.paused) return;
    this.paused = true;
    this.pauseStart = performance.now();
  }

  resume(): void {
    if (!this.running || !this.paused) return;
    this.pauseOffset += performance.now() - this.pauseStart;
    this.paused = false;
  }

  /** Elapsed scenario time in ms, excluding paused intervals. */
  elapsed(): number {
    if (!this.running) return 0;
    const now = performance.now();
    const currentPause = this.paused ? now - this.pauseStart : 0;
    return now - this.startTime - this.pauseOffset - currentPause;
  }

  isPaused(): boolean {
    return this.paused;
  }

  isRunning(): boolean {
    return this.running;
  }

  stop(): void {
    this.running = false;
  }
}

// ---------------------------------------------------------------------------
// ConcurrentTaskRunner
// ---------------------------------------------------------------------------

export class ConcurrentTaskRunner {
  private readonly subtasks: SubTaskHandle[];
  private readonly active = new Map<string, SubTaskHandle>();
  private readonly results = new Map<string, unknown>();
  private readonly config: ConcurrentRunnerConfig;
  private readonly clock = new ScenarioClock();

  /** Panel containers keyed by subtask id; set externally before start. */
  private panels = new Map<string, HTMLElement>();
  /** Sub-task configs keyed by subtask id. */
  private subtaskConfigs = new Map<string, Record<string, unknown>>();

  private scheduler: ScenarioEventSource | null = null;
  private rafId: number | null = null;
  private prevNow = 0;
  private keyListener: ((event: KeyboardEvent) => void) | null = null;

  /** Key-to-subtask routing map. Keys are normalised key strings. */
  private keyBindingMap = new Map<string, string>();

  constructor(subtasks: SubTaskHandle[], config?: ConcurrentRunnerConfig) {
    this.subtasks = subtasks;
    this.config = config ?? {};
  }

  // ── Configuration before start ───────────────────────────────────────

  /**
   * Register the DOM panel that a sub-task will render into.
   */
  setPanel(subtaskId: string, element: HTMLElement): void {
    this.panels.set(subtaskId, element);
  }

  /**
   * Register the configuration object for a sub-task.
   */
  setSubtaskConfig(subtaskId: string, config: Record<string, unknown>): void {
    this.subtaskConfigs.set(subtaskId, config);
  }

  /**
   * Map a keyboard key to a sub-task id for input routing.
   * Multiple keys can map to the same sub-task.
   */
  addKeyBinding(key: string, subtaskId: string): void {
    this.keyBindingMap.set(key.toLowerCase(), subtaskId);
  }

  /**
   * Bulk-set key bindings from a record.
   */
  setKeyBindings(bindings: Record<string, string>): void {
    for (const [key, id] of Object.entries(bindings)) {
      this.addKeyBinding(key, id);
    }
  }

  /**
   * Attach a scenario event source (static scheduler or dynamic source)
   * to drive timed events.
   */
  setScheduler(scheduler: ScenarioEventSource | ScenarioScheduler): void {
    this.scheduler = scheduler;
  }

  // ── Lifecycle ────────────────────────────────────────────────────────

  /**
   * Begin the concurrent run. Starts the rAF loop and scenario clock.
   * Sub-tasks are started via scenario "start" events (or call
   * startSubtask() directly for immediate start).
   */
  start(): void {
    this.installKeyListener();
    this.clock.start();
    this.prevNow = performance.now();
    this.emitEvent("concurrent_start");
    this.rafLoop();
  }

  /**
   * Manually start a specific sub-task (outside of scenario scheduling).
   */
  startSubtask(id: string): void {
    if (this.active.has(id)) return;
    const handle = this.subtasks.find((s) => s.id === id);
    if (!handle) {
      console.warn(`[ConcurrentTaskRunner] unknown subtask "${id}"`);
      return;
    }
    const panel = this.panels.get(id);
    if (!panel) {
      console.warn(`[ConcurrentTaskRunner] no panel registered for "${id}"`);
      return;
    }
    const config = this.subtaskConfigs.get(id) ?? {};
    handle.start(panel, config);
    this.active.set(id, handle);
    this.emitEvent("subtask_start", { subtaskId: id });
  }

  /**
   * Manually stop a specific sub-task.
   */
  stopSubtask(id: string): void {
    const handle = this.active.get(id);
    if (!handle) return;
    const result = handle.stop();
    this.results.set(id, result);
    this.active.delete(id);
    this.emitEvent("subtask_stop", { subtaskId: id });
  }

  /**
   * Pause the scenario clock and all sub-task updates.
   */
  pause(): void {
    this.clock.pause();
    this.emitEvent("concurrent_pause");
  }

  /**
   * Resume after a pause.
   */
  resume(): void {
    this.clock.resume();
    this.emitEvent("concurrent_resume");
  }

  /**
   * Stop everything. Returns collected results from all sub-tasks.
   */
  stop(): Map<string, unknown> {
    if (this.rafId != null) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
    this.removeKeyListener();
    this.clock.stop();

    // Stop any still-active sub-tasks.
    for (const [id, handle] of this.active) {
      const result = handle.stop();
      this.results.set(id, result);
    }
    this.active.clear();

    this.emitEvent("concurrent_stop");
    return new Map(this.results);
  }

  /**
   * Whether the runner is currently active (started and not stopped).
   */
  isRunning(): boolean {
    return this.clock.isRunning();
  }

  /**
   * Current scenario elapsed time in ms.
   */
  elapsedMs(): number {
    return this.clock.elapsed();
  }

  /**
   * Forward subtask automation/failure state to the event source.
   * Call this from external code (e.g., adapter) when a subtask's
   * automation or active-failure state changes.
   */
  notifySubtaskState(subtaskId: string, state: SubtaskAutomationState): void {
    this.scheduler?.notifyState?.(subtaskId, state);
  }

  // ── rAF loop ─────────────────────────────────────────────────────────

  private rafLoop = (): void => {
    if (!this.clock.isRunning()) return;
    this.rafId = requestAnimationFrame(this.rafLoop);

    const now = performance.now();
    const dt = now - this.prevNow;
    this.prevNow = now;

    if (this.clock.isPaused()) return;

    const elapsed = this.clock.elapsed();

    // Process due scenario events.
    if (this.scheduler) {
      const due = this.scheduler.tick(elapsed);
      for (const event of due) {
        this.routeScenarioEvent(event);
      }
    }

    // Step all active sub-tasks.
    for (const handle of this.active.values()) {
      handle.step(now, dt);
    }

    // Optional performance aggregation.
    if (this.config.onPerformanceTick) {
      const perfMap = new Map<string, SubTaskPerformance>();
      for (const [id, handle] of this.active) {
        if (handle.getPerformance) {
          perfMap.set(id, handle.getPerformance());
        }
      }
      this.config.onPerformanceTick(perfMap);
    }
  };

  // ── Event routing ────────────────────────────────────────────────────

  private routeScenarioEvent(event: ScenarioEvent): void {
    if (event.command === "start") {
      if (event.targetId === "*") {
        for (const st of this.subtasks) this.startSubtask(st.id);
      } else {
        this.startSubtask(event.targetId);
      }
      return;
    }

    if (event.command === "stop") {
      if (event.targetId === "*") {
        for (const id of [...this.active.keys()]) this.stopSubtask(id);
      } else {
        this.stopSubtask(event.targetId);
      }
      return;
    }

    // Route other events to the targeted sub-task(s).
    if (event.targetId === "*") {
      for (const handle of this.active.values()) {
        handle.handleScenarioEvent?.(event);
      }
    } else {
      const handle = this.active.get(event.targetId);
      handle?.handleScenarioEvent?.(event);
    }
  }

  // ── Keyboard routing ─────────────────────────────────────────────────

  private installKeyListener(): void {
    if (this.keyListener) return;
    this.keyListener = (event: KeyboardEvent) => {
      const key = event.key.toLowerCase();
      const now = performance.now();

      // Try explicit binding first.
      const boundId = this.keyBindingMap.get(key);
      if (boundId) {
        const handle = this.active.get(boundId);
        if (handle?.handleKeyDown?.(key, now)) {
          event.preventDefault();
          return;
        }
      }

      // Fallback: offer to all active sub-tasks (first consumer wins).
      for (const handle of this.active.values()) {
        if (handle.handleKeyDown?.(key, now)) {
          event.preventDefault();
          return;
        }
      }
    };
    window.addEventListener("keydown", this.keyListener);
  }

  private removeKeyListener(): void {
    if (this.keyListener) {
      window.removeEventListener("keydown", this.keyListener);
      this.keyListener = null;
    }
  }

  // ── Helpers ──────────────────────────────────────────────────────────

  private emitEvent(type: string, extra?: Record<string, unknown>): void {
    this.config.onEvent?.({
      type,
      elapsedMs: this.clock.elapsed(),
      ...extra,
    });
  }
}
