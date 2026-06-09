// @ts-nocheck
import {
  nextSecureUint32,
  applyButtonStyleOverrides,
  createDrtPresentationBridge,
  createScaledCanvasHost,
  DrtController,
  getAutoResponderProfile,
  isAutoResponderEnabled,
  isSkipModeEnabled,
  normalizeKey,
  resolveScopedModuleConfig,
  resolveButtonStyleOverrides,
  sampleAutoHoldDurationMs,
  sampleAutoInteractionDelayMs,
} from '@experiments/core';
import { GameState } from './game_state.js';
import { ConveyorRenderer } from './renderer_pixi.js';
import { estimateTrialDifficulty } from './difficulty_estimator.js';
import { applyDisplayPreset, resolveDisplayPresetId } from './display_presets.js';
import type { BricksScopedDrtConfig } from './drtConfig.js';
import { resolveBricksDrtConfig } from './drtConfig.js';

export interface HoldDurationPracticeRunArgs {
  displayElement: HTMLElement;
  blockLabel: string;
  blockIndex: number;
  trialIndex: number;
  roundsRemaining?: number;
  config: Record<string, unknown>;
  drtRuntime?: HoldDurationPracticeDrtRuntime;
  hudBaseStats?: Partial<Record<'spawned' | 'cleared' | 'dropped' | 'points', number>>;
}

export interface HoldDurationPracticeData {
  block_label: string;
  block_index: number;
  trial_index: number;
  clockTime: string;
  clockTimeUnixMs: number;
  trial_duration_ms: number;
  end_reason: string;
  runtime_conveyor_lengths: number[];
  difficulty_estimate: unknown;
  resolved_display_preset_id: string | null;
  config_snapshot: Record<string, unknown>;
  game: unknown;
  drt: unknown;
  timeline_events: Array<Record<string, unknown>>;
  performance?: Record<string, unknown>;
  performance_deltas?: number[];
  practice_press_results?: boolean[];
  practice_press_count?: number;
  practice_correct_count?: number;
  practice_required_presses?: number | null;
  practice_replenish_delay_ms?: number;
}

export interface HoldDurationPracticeDrtRuntimeBindings {
  displayElement?: HTMLElement | null;
  getElapsedMs: () => number;
  onEvent: (event: Record<string, unknown>) => void;
  onStimStart: (stimulus: Record<string, unknown>) => void;
  onStimEnd: (stimulus: Record<string, unknown>) => void;
}

export interface HoldDurationPracticeDrtRuntime {
  config: BricksScopedDrtConfig;
  controller: DrtController;
  stopOnCleanup?: boolean;
  attachBindings?: (bindings: HoldDurationPracticeDrtRuntimeBindings) => void;
  detachBindings?: () => void;
}

const randomUint32 = nextSecureUint32;
const isContinueActivationKey = (key: string): boolean => ['enter', 'arrowright'].includes(normalizeKey(key));

const materializeSeed = (seedSpec: unknown) => {
  if (seedSpec === undefined || seedSpec === null) return randomUint32();
  if (typeof seedSpec === 'string') {
    const s = seedSpec.trim().toLowerCase();
    if (s === 'random' || s === 'auto') return randomUint32();
    const asNum = Number(s);
    if (Number.isFinite(asNum)) return asNum >>> 0;
    return randomUint32();
  }
  const n = Number(seedSpec);
  return Number.isFinite(n) ? (n >>> 0) : randomUint32();
};

const downloadJson = (filename: string, data: unknown) => {
  try {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  } catch (error) {
    console.warn('Failed to download trial debug log:', error);
  }
};

const asRecord = (value: unknown): Record<string, unknown> | null => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
};

export async function runHoldDurationPractice(args: HoldDurationPracticeRunArgs): Promise<HoldDurationPracticeData> {
  const trial = args;
  const display_element = args.displayElement;
  const hudBaseStats = {
    spawned: Number(args.hudBaseStats?.spawned ?? 0),
    cleared: Number(args.hudBaseStats?.cleared ?? 0),
    dropped: Number(args.hudBaseStats?.dropped ?? 0),
    points: Number(args.hudBaseStats?.points ?? 0),
  };
  const cfg = trial.config as any;
  const baseSeed = materializeSeed(cfg.trial?.seed);
  const resolvedDisplayPresetId = resolveDisplayPresetId(cfg, {
    baseSeed,
    trialIndex: trial.trialIndex,
  });
  const resolvedCfg = applyDisplayPreset(cfg, resolvedDisplayPresetId);
  const trialNode = asRecord(resolvedCfg?.trial) ?? {};
  const practiceNode = asRecord(trialNode.holdDurationPractice) ?? asRecord((resolvedCfg as any)?.holdDurationPractice) ?? {};
  const forceFullWidth = practiceNode.fullWidthConveyor !== false;
  const forceCenteredBrick = practiceNode.centerBrick !== false;
  const requiredPressesRaw = Number(
    practiceNode.requiredPresses ??
    practiceNode.requiredTrials ??
    practiceNode.requiredHolds ??
    practiceNode.pressesRequired,
  );
  const requiredPresses = Number.isFinite(requiredPressesRaw) ? Math.max(1, Math.floor(requiredPressesRaw)) : null;
  const replenishDelayRaw = Number(
    practiceNode.replenishDelayMs ??
    practiceNode.trialTimeMs ??
    practiceNode.nextTrialDelayMs,
  );
  const replenishDelayMs = Number.isFinite(replenishDelayRaw) ? Math.max(0, Math.floor(replenishDelayRaw)) : 220;
  const useSpotlightWindow =
    practiceNode.spotlightWindow === true ||
    practiceNode.useSpotlightWindow === true;
  const hidePracticeHud = practiceNode.hideHud !== false;

  // Force single stationary conveyor and single brick for practice
  if (!resolvedCfg.conveyors) resolvedCfg.conveyors = {};
  resolvedCfg.conveyors.nConveyors = 1;
  resolvedCfg.conveyors.speedPxPerSec = 0;
  if (forceFullWidth) {
    const canvasWidth = Number(resolvedCfg?.display?.canvasWidth);
    if (Number.isFinite(canvasWidth)) {
      resolvedCfg.conveyors.lengthPx = Math.max(1, canvasWidth);
    }
  }
  if (!resolvedCfg.bricks) resolvedCfg.bricks = {};
  resolvedCfg.bricks.speedPxPerSec = 0;
  if (!resolvedCfg.bricks.spawn || typeof resolvedCfg.bricks.spawn !== 'object') {
    resolvedCfg.bricks.spawn = {};
  }
  resolvedCfg.bricks.spawn.mode = 'manual';
  if (resolvedCfg.bricks.forcedSetPlan && typeof resolvedCfg.bricks.forcedSetPlan === 'object') {
    resolvedCfg.bricks.forcedSetPlan = {
      ...(resolvedCfg.bricks.forcedSetPlan as Record<string, unknown>),
      enable: false,
    };
  }
  if (forceCenteredBrick) {
    resolvedCfg.bricks.forcedSet = [{ conveyorIndex: 0, xFraction: 0.5 }];
  }
  // Make sure it doesn't try to clear based on standard rules
  if (!resolvedCfg.bricks.completionParams) resolvedCfg.bricks.completionParams = {};
  if (!resolvedCfg.trial) resolvedCfg.trial = {};
  if (!resolvedCfg.display) resolvedCfg.display = {};
  if (!resolvedCfg.display.ui || typeof resolvedCfg.display.ui !== "object") {
    resolvedCfg.display.ui = {};
  }
  if (hidePracticeHud) {
    resolvedCfg.display.ui.showHUD = false;
  }
  resolvedCfg.trial.isPractice = true;
  if (useSpotlightWindow) {
    if (!resolvedCfg.trial.forcedOrder || typeof resolvedCfg.trial.forcedOrder !== "object") {
      resolvedCfg.trial.forcedOrder = {};
    }
    resolvedCfg.trial.forcedOrder.enable = true;
    resolvedCfg.trial.forcedOrder.switchMode = "on_clear";
    resolvedCfg.trial.forcedOrder.sequence = [0];
  }
  if (requiredPresses !== null) {
    resolvedCfg.trial.mode = 'max_bricks';
    resolvedCfg.bricks.maxBricksPerTrial = requiredPresses;
  }

  const injectedDrtRuntime = args.drtRuntime ?? null;
  const legacyDrtRaw = resolveScopedModuleConfig(resolvedCfg, "drt") ?? {};
  const resolvedDrtConfig =
    injectedDrtRuntime?.config ?? resolveBricksDrtConfig(legacyDrtRaw);
  const autoProfile = getAutoResponderProfile();
  const skipConveyor = isSkipModeEnabled();
  const shouldSimulateDataOnly = skipConveyor || (isAutoResponderEnabled() && autoProfile?.jsPsychSimulationMode === 'data-only');
  const drtController = injectedDrtRuntime?.controller ?? null;
  if (resolvedDrtConfig.enabled && !drtController) {
    throw new Error('Bricks DRT is enabled but no module-scoped DRT runtime was injected.');
  }

  const host = createScaledCanvasHost({
    displayElement: display_element,
    canvasWidth: Number(resolvedCfg.display.canvasWidth),
    canvasHeight: Number(resolvedCfg.display.canvasHeight),
    viewportPaddingPx: Number(resolvedCfg.display?.viewportPaddingPx ?? 24),
  });
  const container = host.container;

  const debugCfg = (resolvedCfg?.debug || {}) as Record<string, unknown>;
  const perfDebugCfg = (resolvedCfg?.display?.performance || {}) as Record<string, unknown>;
  const frameBudgetMs = Math.max(1, Number(debugCfg.performanceFrameBudgetMs ?? perfDebugCfg.frameBudgetMs ?? 16.67));
  const frameStats = {
    frames: 0,
    rawDtSumMs: 0,
    rawDtMinMs: Number.POSITIVE_INFINITY,
    rawDtMaxMs: 0,
    clampedFrames: 0,
    budgetOverrunFrames: 0,
    severeFrames: 0,
    tickCostSumMs: 0,
    tickCostMaxMs: 0
  };
  const timelineEvents: Array<Record<string, unknown>> = [];
  const logEvent = (event: Record<string, unknown>) => {
    timelineEvents.push(event);
    if (debugCfg.holdConsole && event?.type === 'brick_hold' && event?.valid === true) {
      const holdMs = Number(event.hold_ms ?? 0);
      const progressPct = Math.max(0, Math.min(100, Number(event.progress_total ?? 0) * 100));
      console.info(`[hold-debug] brick=${event.brick_id ?? '-'} hold_ms=${Math.round(holdMs)} clear_pct=${progressPct.toFixed(1)}`);
    }
  };

  const initialHudPoints = Number.isFinite(hudBaseStats.points) ? Number(hudBaseStats.points) : 0;
  const gameState = new GameState(resolvedCfg, { onEvent: logEvent, seed: baseSeed, initialPoints: initialHudPoints });
  if (forceCenteredBrick) {
    const conveyor = gameState.conveyors[0];
    const active = gameState.activeBricks[0];
    if (conveyor && active) {
      const centerX = Math.max(0, (Number(conveyor.length) - Number(active.width)) * 0.5);
      active.x = centerX;
    }
  }
  const runtimeConveyorLengths = gameState.conveyors.map((conveyor: any) => conveyor.length);
  const difficultyEstimate = estimateTrialDifficulty(gameState, resolvedCfg);

  const trialMode = resolvedCfg.trial?.mode ?? 'fixed_time';
  const brickQuota = Number.isFinite(resolvedCfg.bricks?.maxBricksPerTrial) ? resolvedCfg.bricks.maxBricksPerTrial : null;
  const enforceBrickQuota = trialMode === 'max_bricks' && brickQuota !== null;
  const drtEnabled = resolvedDrtConfig.enabled === true;
  const drtStatsSnapshot = {
    presented: 0,
    hits: 0,
    misses: 0,
    falseAlarms: 0,
  };
  const performanceDeltas: number[] = [];
  const practicePressResults: boolean[] = [];
  let pendingReplenish: { brickId: string; dueAtMs: number } | null = null;
  const hudTimerGranularityMs = Math.max(10, Number(resolvedCfg?.display?.ui?.hudTimerGranularityMs ?? 100));
  let lastHudSignature = '';
  const autoEnabled = isAutoResponderEnabled();
  const maxTimeSecRaw = resolvedCfg.trial?.maxTimeSec;
  const configuredMaxDuration =
    Number.isFinite(maxTimeSecRaw) && maxTimeSecRaw !== null ? Math.max(0, Math.floor(maxTimeSecRaw * 1000)) : null;
  const maxDuration = skipConveyor ? 500 : (configuredMaxDuration ?? (autoEnabled ? Math.max(5_000, Number(autoProfile?.maxTrialDurationMs ?? 90_000)) : null));
  const trialCfg = (resolvedCfg?.trial || {}) as Record<string, unknown>;
  const globalEndDelayMsRaw = Number(trialCfg.endDelayMs);
  const globalEndDelayMs = Number.isFinite(globalEndDelayMsRaw) ? Math.max(0, Math.floor(globalEndDelayMsRaw)) : 0;
  const brickQuotaEndDelayMsRaw = Number(trialCfg.brickQuotaEndDelayMs);
  const brickQuotaEndDelayMs = Number.isFinite(brickQuotaEndDelayMsRaw)
    ? Math.max(0, Math.floor(brickQuotaEndDelayMsRaw))
    : (globalEndDelayMs > 0 ? globalEndDelayMs : 3000);
  const stopDrtOnBrickQuotaMet =
    resolvedDrtConfig.scope === 'trial' &&
    (trialCfg.stopDrtOnBrickQuotaMet === true || trialCfg.endDrtOnBrickQuotaMet === true);

  // Fast headless path: skip renderer and run virtual-time loop.
  // Also entered when skip_conveyor=1 URL param is set (without auto mode, so JATOS/instruction flows remain human-driven).
  if ((autoEnabled && autoProfile?.jsPsychSimulationMode === 'data-only') || skipConveyor) {
    injectedDrtRuntime?.attachBindings?.({
      displayElement: null,
      getElapsedMs: () => gameState.elapsed,
      onEvent: (event) => { event.time = gameState.elapsed; logEvent(event); },
      onStimStart: () => {},
      onStimEnd: () => {},
    });
    const DATA_ONLY_STEP_MS = 16;
    const practicePerformanceDeltas: number[] = [];
    const practicePressResultsDataOnly: boolean[] = [];
    const interactionDelayFallbackMs = skipConveyor ? 40 : 900;
    let nextAutoActionAt = Math.max(40, sampleAutoInteractionDelayMs() ?? interactionDelayFallbackMs);
    let pendingReplenishDataOnly: { brickId: string; dueAtMs: number } | null = null;
    let pendingEnd: { reason: string; dueAtMs: number } | null = null;
    while (!pendingEnd || gameState.elapsed < pendingEnd.dueAtMs) {
      gameState.step(DATA_ONLY_STEP_MS);
      if (pendingReplenishDataOnly && gameState.elapsed >= pendingReplenishDataOnly.dueAtMs) {
        const brick = gameState.bricks.get(pendingReplenishDataOnly.brickId);
        if (brick) brick.clearProgress = 0;
        pendingReplenishDataOnly = null;
      }
      if (gameState.bricks.size === 0) {
        const conveyor = gameState.conveyors[0];
        const width = Math.max(8, Number(resolvedCfg?.display?.brickWidth ?? 80));
        const centerX = Math.max(0, ((Number(conveyor?.length ?? width) - width) * 0.5));
        gameState._spawnBrick(conveyor, { x: centerX, reason: 'practice_respawn', bypassSpacing: true });
      }
      if (!pendingEnd && !pendingReplenishDataOnly && gameState.elapsed >= nextAutoActionAt) {
        const activeBricks = gameState.activeBricks;
        if (activeBricks.length > 0) {
          const focusState = gameState.getFocusState();
          const focusId = focusState.enabled ? focusState.activeBrickId : null;
          const candidate = (focusId ? activeBricks.find((b) => b.id === focusId) : null)
            ?? activeBricks[Math.floor(gameState.rng.nextFloat() * activeBricks.length)]
            ?? activeBricks[0];
          const holdDurationMs = sampleAutoHoldDurationMs() ?? 500;
          const brickBefore = gameState.bricks.get(String(candidate.id));
          const holdsBefore = Number(brickBefore?.holds ?? -1);
          gameState.handleBrickHold(String(candidate.id), holdDurationMs, gameState.elapsed, { x: 0, y: 0 });
          const brickAfter = gameState.bricks.get(String(candidate.id));
          if (brickAfter && Number(brickAfter.holds ?? 0) > holdsBefore) {
            const params = resolvedCfg.bricks?.completionParams || {};
            const targetHoldMs = Math.max(50, Number(brickAfter.targetHoldMs ?? params.target_hold_ms ?? 700));
            const delta = (holdDurationMs - targetHoldMs) / targetHoldMs;
            const goodMin = Number(resolvedCfg?.display?.practiceFeedback?.goodThresholdMin ?? -0.2);
            const goodMax = Number(resolvedCfg?.display?.practiceFeedback?.goodThresholdMax ?? 0.2);
            practicePerformanceDeltas.push(delta);
            practicePressResultsDataOnly.push(delta >= goodMin && delta <= goodMax);
            pendingReplenishDataOnly = { brickId: String(candidate.id), dueAtMs: gameState.elapsed + replenishDelayMs };
          }
        }
        nextAutoActionAt = gameState.elapsed + Math.max(40, sampleAutoInteractionDelayMs() ?? interactionDelayFallbackMs);
      }
      if (!pendingEnd && enforceBrickQuota && practicePressResultsDataOnly.length >= (brickQuota ?? 0)) {
        pendingEnd = { reason: 'brick_quota_met', dueAtMs: gameState.elapsed + brickQuotaEndDelayMs };
      }
      if (!pendingEnd && maxDuration !== null && gameState.elapsed >= maxDuration) {
        pendingEnd = { reason: 'time_limit', dueAtMs: gameState.elapsed };
      }
      if (!pendingEnd && gameState.elapsed > 600_000) {
        pendingEnd = { reason: 'safety_limit', dueAtMs: gameState.elapsed };
      }
    }
    injectedDrtRuntime?.detachBindings?.();
    const drtData = drtController
      ? (injectedDrtRuntime?.stopOnCleanup === false ? drtController.exportData() : drtController.stop())
      : { enabled: false, stats: { presented: 0, hits: 0, misses: 0, falseAlarms: 0 }, events: [] };
    const gameData = gameState.exportData() as Record<string, any>;
    const clockTimeUnixMs = Date.now();
    return {
      block_label: trial.blockLabel,
      block_index: trial.blockIndex,
      trial_index: trial.trialIndex,
      clockTime: new Date(clockTimeUnixMs).toISOString(),
      clockTimeUnixMs,
      trial_duration_ms: gameState.elapsed,
      end_reason: pendingEnd?.reason ?? 'time_limit',
      runtime_conveyor_lengths: runtimeConveyorLengths,
      difficulty_estimate: difficultyEstimate,
      resolved_display_preset_id: resolvedDisplayPresetId,
      config_snapshot: resolvedCfg,
      game: gameData,
      drt: drtData,
      timeline_events: timelineEvents,
      performance_deltas: practicePerformanceDeltas,
      practice_press_results: practicePressResultsDataOnly,
      practice_press_count: practicePressResultsDataOnly.length,
      practice_correct_count: practicePressResultsDataOnly.filter(Boolean).length,
      practice_required_presses: requiredPresses,
      practice_replenish_delay_ms: replenishDelayMs,
    };
  }

  const processPracticeHold = (brickId: string, holdDurationMs: number, x: number, y: number) => {
    if (enforceBrickQuota && Number.isFinite(Number(brickQuota)) && practicePressResults.length >= Number(brickQuota)) {
      return;
    }
    if (pendingReplenish) {
      return;
    }
    const beforeBrick = gameState.bricks.get(brickId);
    const holdsBefore = Number(beforeBrick?.holds ?? -1);
    gameState.handleBrickHold(brickId, holdDurationMs, gameState.elapsed, { x, y });

    const brick = gameState.bricks.get(brickId);
    const holdRegistered = brick ? Number(brick.holds ?? 0) > holdsBefore : false;
    if (brick && holdRegistered) {
      // Queue practice feedback manually on every hold duration completion
      const params = resolvedCfg.bricks?.completionParams || {};
      const targetHoldMs = Math.max(50, Number(brick.targetHoldMs ?? params.target_hold_ms ?? 700));
      const scaledPerformanceDelta = (holdDurationMs - targetHoldMs) / targetHoldMs;
      const practiceUiCfg = asRecord(resolvedCfg?.display?.practiceFeedback) ?? {};
      const goodThresholdMin = Number(practiceUiCfg.goodThresholdMin ?? -0.2);
      const goodThresholdMax = Number(practiceUiCfg.goodThresholdMax ?? 0.2);
      const isGoodPress = scaledPerformanceDelta >= goodThresholdMin && scaledPerformanceDelta <= goodThresholdMax;

      logEvent({
        type: 'practice_feedback',
        brick_id: brick.id,
        conveyor_id: brick.conveyorId,
        hold_ms: holdDurationMs,
        target_hold_ms: targetHoldMs,
        scaled_performance_delta: scaledPerformanceDelta,
        abs_scaled_performance_delta: Math.abs(scaledPerformanceDelta),
        press_correct: isGoodPress,
        time: gameState.elapsed,
      });
      performanceDeltas.push(scaledPerformanceDelta);
      practicePressResults.push(isGoodPress);

      renderer.queuePracticeFeedback([{
        brickId: brick.id,
        conveyorId: brick.conveyorId,
        holdDurationMs: holdDurationMs,
        targetHoldMs: targetHoldMs,
        scaledPerformanceDelta: scaledPerformanceDelta,
        x: brick.x,
        y: brick.y,
        width: brick.width,
        height: brick.height,
      }]);

      // Actual visual replenish back to full is delayed (pendingReplenish) so users can learn from the clear state.
      pendingReplenish = {
        brickId: brick.id,
        dueAtMs: gameState.elapsed + replenishDelayMs,
      };
    }
  };

  const renderer = new ConveyorRenderer(resolvedCfg, {
    onBrickClick: (brickId: string, x: number, y: number) => {
      gameState.handleBrickInteraction(brickId, gameState.elapsed, { x, y });
    },
    onBrickHold: (brickId: string, holdDurationMs: number, x: number, y: number) => {
      processPracticeHold(brickId, holdDurationMs, x, y);
    },
    onBrickHoldState: (brickId: string, isHolding: boolean, x: number, y: number) => {
      gameState.handleBrickHoldState(brickId, isHolding, gameState.elapsed, { x, y });
    },
    onBrickHover: (brickId: string, isHovering: boolean, x: number, y: number) => {
      gameState.handleBrickHover(brickId, isHovering, gameState.elapsed, { x, y });
    },
    onPointerDebug: (event: Record<string, unknown>) => {
      logEvent({ ...event, type: 'pointer_debug', pointer_event: event.type, time: gameState.elapsed });
      if (resolvedCfg?.debug?.pointerConsole) {
        console.info('[pointer-debug]', event);
      }
    },
    runtimeLengths: runtimeConveyorLengths,
    seed: ((baseSeed >>> 0) + ((trial.trialIndex + 1) * 2654435761)) >>> 0,
  });

  await renderer.init(container);
  renderer.toggleVisualDRT(false, legacyDrtRaw?.stim_visual_config);

  let drtPresentation: ReturnType<typeof createDrtPresentationBridge> | null = null;
  let activeStimulusId: string | null = null;

  let animationFrameId: number | null = null;
  let ended = false;
  const activeAudioNodes = new Set<HTMLAudioElement>();
  const experimentCfg = (resolvedCfg?.experiment || {}) as Record<string, unknown>;
  const explicitStartMode = typeof experimentCfg.startTrialsOn === 'string'
    ? String(experimentCfg.startTrialsOn).trim().toLowerCase()
    : null;
  const startOnSpaceLegacy = Boolean(experimentCfg.startTrialsOnSpace);
  const startOnClickLegacy = Boolean(experimentCfg.startTrialsOnClick);
  const startTrigger: 'immediate' | 'space' | 'click' =
    explicitStartMode === 'space' || explicitStartMode === 'click'
      ? (explicitStartMode as 'space' | 'click')
      : (startOnClickLegacy ? 'click' : (startOnSpaceLegacy ? 'space' : 'immediate'));
  let trialStarted = startTrigger === 'immediate';
  const startOverlayCfg = resolvedCfg?.experiment?.startOverlay || {};

  let startOverlay: HTMLElement | null = null;
  let startButton: HTMLButtonElement | null = null;
  let clickStartHandler: (() => void) | null = null;
  if (drtController && resolvedDrtConfig.scope === 'trial' && drtController.isRunning()) {
    drtController.stop();
  }
  if (!trialStarted) {
    startOverlay = document.createElement('div');
    startOverlay.className = 'trial-start-overlay';
    if (startTrigger === 'click') {
      startButton = document.createElement('button');
      startButton.type = 'button';
      startButton.className = 'exp-continue-btn';
      startButton.textContent = String(startOverlayCfg.text ?? 'Click to begin.');
      applyButtonStyleOverrides(
        startButton,
        resolveButtonStyleOverrides(
          asRecord(startOverlayCfg.buttonStyle) ?? {
            padding: startOverlayCfg.buttonPadding ?? startOverlayCfg.padding,
            fontSize: startOverlayCfg.buttonFontSize,
            fontWeight: startOverlayCfg.buttonFontWeight,
            border: startOverlayCfg.buttonBorder,
            borderRadius: startOverlayCfg.buttonBorderRadius,
            color: startOverlayCfg.buttonColor,
            background: startOverlayCfg.buttonBackground,
            minWidth: startOverlayCfg.buttonMinWidth,
            minHeight: startOverlayCfg.buttonMinHeight,
            outline: startOverlayCfg.buttonOutline,
            boxShadow: startOverlayCfg.buttonBoxShadow,
          },
        ),
      );
      startOverlay.appendChild(startButton);
      startOverlay.style.pointerEvents = 'auto';
    } else {
      startOverlay.textContent = String(startOverlayCfg.text ?? 'Press the space bar to begin.');
      startOverlay.style.pointerEvents = 'none';
    }
    const defaultOverlayPadding = startTrigger === 'click' ? '0' : '14px 18px';
    const defaultOverlayBackground = startTrigger === 'click' ? 'transparent' : 'rgba(255, 255, 255, 0.92)';
    const defaultOverlayBorder = startTrigger === 'click' ? 'none' : '1px solid #d1d5db';
    const defaultOverlayRadius = startTrigger === 'click' ? '0' : '8px';
    startOverlay.style.setProperty('--overlay-padding', String(startOverlayCfg.padding ?? defaultOverlayPadding));
    startOverlay.style.setProperty('--overlay-bg', String(startOverlayCfg.background ?? defaultOverlayBackground));
    startOverlay.style.setProperty('--overlay-border', String(startOverlayCfg.border ?? defaultOverlayBorder));
    startOverlay.style.setProperty('--overlay-radius', String(startOverlayCfg.borderRadius ?? defaultOverlayRadius));
    startOverlay.style.setProperty('--overlay-color', String(startOverlayCfg.color ?? '#111827'));
    startOverlay.style.setProperty('--overlay-font-size', String(startOverlayCfg.fontSize ?? '18px'));
    if (startOverlayCfg.boxShadow !== undefined) {
      startOverlay.style.boxShadow = String(startOverlayCfg.boxShadow);
    } else if (startTrigger === 'click') {
      startOverlay.style.boxShadow = 'none';
    }
    container.style.position = 'relative';
    container.appendChild(startOverlay);
  }

  // Create explicit stop button for self-paced mode
  const selfPacedMode = !enforceBrickQuota && resolvedCfg?.trial?.mode !== 'fixed_time';
  let stopButton: HTMLButtonElement | null = null;
  if (selfPacedMode) {
    stopButton = document.createElement('button');
    stopButton.type = 'button';
    stopButton.className = 'exp-continue-btn';
    stopButton.textContent = 'Continue';
    stopButton.style.position = 'absolute';
    stopButton.style.bottom = '20px';
    stopButton.style.right = '20px';
    stopButton.style.zIndex = '1000';
    // Initially hidden until trial starts
    stopButton.style.display = 'none';

    stopButton.addEventListener('click', (e) => {
      e.stopPropagation();
      scheduleEnd('self_paced_advance');
    });

    container.style.position = 'relative';
    container.appendChild(stopButton);
  }

  const playDRTAudio = () => {
    const url = legacyDrtRaw?.stim_file_audio;
    if (!url) return;
    const audio = new Audio(url);
    audio.preload = 'auto';
    const configuredVolume = Number(resolvedDrtConfig.audio?.volume ?? 0.6);
    audio.volume = Number.isFinite(configuredVolume) ? Math.max(0, Math.min(1, configuredVolume)) : 0.6;
    activeAudioNodes.add(audio);
    audio.addEventListener('ended', () => activeAudioNodes.delete(audio));
    audio.addEventListener('error', () => activeAudioNodes.delete(audio));
    audio.play().catch((error) => {
      console.warn('DRT audio play failed:', error);
      activeAudioNodes.delete(audio);
    });
  };
  drtPresentation = createDrtPresentationBridge(resolvedDrtConfig, {
    showVisual: () => renderer.toggleVisualDRT(true, legacyDrtRaw?.stim_visual_config),
    hideVisual: () => renderer.toggleVisualDRT(false, legacyDrtRaw?.stim_visual_config),
    playAuditory: () => playDRTAudio(),
  });
  injectedDrtRuntime?.attachBindings?.({
    displayElement: container,
    getElapsedMs: () => gameState.elapsed,
    onEvent: (event) => {
      event.time = gameState.elapsed;
      logEvent(event);
      if (drtEnabled) {
        const type = String(event.type ?? '');
        if (type === 'drt_stimulus_presented') {
          drtStatsSnapshot.presented += 1;
          const stimId = typeof event.stim_id === 'string' ? event.stim_id : `drt_${gameState.elapsed}`;
          activeStimulusId = stimId;
          drtPresentation?.onStimStart({ id: stimId, start: gameState.elapsed, responded: false });
        } else if (type === 'drt_hit') {
          drtStatsSnapshot.hits += 1;
          drtPresentation?.onResponseHandled();
          const stimId = typeof event.stim_id === 'string' ? event.stim_id : activeStimulusId ?? `drt_${gameState.elapsed}`;
          drtPresentation?.onStimEnd({ id: stimId, start: gameState.elapsed, responded: true });
          activeStimulusId = null;
        } else if (type === 'drt_miss') {
          drtStatsSnapshot.misses += 1;
          const stimId = typeof event.stim_id === 'string' ? event.stim_id : activeStimulusId ?? `drt_${gameState.elapsed}`;
          drtPresentation?.onStimEnd({ id: stimId, start: gameState.elapsed, responded: false });
          activeStimulusId = null;
        } else if (type === 'drt_false_alarm') {
          drtStatsSnapshot.falseAlarms += 1;
        } else if (type === 'drt_forced_end') {
          const stimId = typeof event.stim_id === 'string' ? event.stim_id : activeStimulusId ?? `drt_${gameState.elapsed}`;
          drtPresentation?.onStimEnd({ id: stimId, start: gameState.elapsed, responded: false });
          activeStimulusId = null;
        }
      }
    },
    onStimStart: (stimulus) => drtPresentation?.onStimStart(stimulus),
    onStimEnd: (stimulus) => drtPresentation?.onStimEnd(stimulus),
  });

  let lastFrame: number | null = null;
  let nextAutoActionAt = 0;
  let finalizedDrtData: unknown | null = null;
  const emptyDrtData = {
    enabled: false,
    stats: { presented: 0, hits: 0, misses: 0, falseAlarms: 0 },
    events: [],
  };

  const finalizePracticeDrt = (durationMs: number): void => {
    if (!drtController || finalizedDrtData !== null) return;
    if (shouldSimulateDataOnly && injectedDrtRuntime?.stopOnCleanup !== false) {
      drtController.simulateDataOnlyWindow(durationMs);
    }
    finalizedDrtData = drtController.stop();
  };

  const cleanup = (keyHandler: (e: KeyboardEvent) => void) => {
    ended = true;
    window.removeEventListener('keydown', keyHandler);
    if (startButton && clickStartHandler) {
      startButton.removeEventListener('click', clickStartHandler);
    }
    if (animationFrameId !== null) {
      cancelAnimationFrame(animationFrameId);
      animationFrameId = null;
    }
    if (finalizedDrtData === null) {
      if (drtController) {
        if (injectedDrtRuntime?.stopOnCleanup === false) {
          finalizedDrtData = drtController.exportData();
        } else {
          finalizePracticeDrt(gameState.elapsed);
        }
      } else {
        finalizedDrtData = emptyDrtData;
      }
    }
    injectedDrtRuntime?.detachBindings?.();
    drtPresentation?.hideAll();
    activeAudioNodes.forEach((audio) => audio.pause());
    activeAudioNodes.clear();
    renderer.destroy();
    host.dispose();
  };

  return await new Promise<HoldDurationPracticeData>((resolve) => {
    let pendingEnd: { reason: string; dueAtMs: number } | null = null;
    const endTrial = (reason: string, keyHandler: (e: KeyboardEvent) => void) => {
      if (ended) return;
      cleanup(keyHandler);
      const gameData = gameState.exportData() as Record<string, any>;
      const drtData = finalizedDrtData ?? drtController?.exportData() ?? emptyDrtData;
      const frameCount = Math.max(1, frameStats.frames);
      const avgRawDtMs = frameStats.rawDtSumMs / frameCount;
      const avgFps = avgRawDtMs > 0 ? (1000 / avgRawDtMs) : 0;
      const avgTickCostMs = frameStats.tickCostSumMs / frameCount;
      const rendererPerf = renderer.getPerformanceSnapshot();
      const perfSummary = {
        frame_budget_ms: frameBudgetMs,
        frame_count: frameStats.frames,
        avg_fps: avgFps,
        raw_dt_avg_ms: avgRawDtMs,
        raw_dt_min_ms: Number.isFinite(frameStats.rawDtMinMs) ? frameStats.rawDtMinMs : 0,
        raw_dt_max_ms: frameStats.rawDtMaxMs,
        clamped_frames: frameStats.clampedFrames,
        budget_overrun_frames: frameStats.budgetOverrunFrames,
        severe_frames: frameStats.severeFrames,
        tick_cost_avg_ms: avgTickCostMs,
        tick_cost_max_ms: frameStats.tickCostMaxMs,
        budget_overrun_ratio: frameStats.frames > 0 ? (frameStats.budgetOverrunFrames / frameStats.frames) : 0,
        severe_ratio: frameStats.frames > 0 ? (frameStats.severeFrames / frameStats.frames) : 0,
        renderer: rendererPerf,
      };
      const clockTimeUnixMs = Date.now();
      const trialData: HoldDurationPracticeData = {
        block_label: trial.blockLabel,
        block_index: trial.blockIndex,
        trial_index: trial.trialIndex,
        clockTime: new Date(clockTimeUnixMs).toISOString(),
        clockTimeUnixMs,
        trial_duration_ms: gameState.elapsed,
        end_reason: reason,
        runtime_conveyor_lengths: runtimeConveyorLengths,
        difficulty_estimate: difficultyEstimate,
        resolved_display_preset_id: resolvedDisplayPresetId,
        config_snapshot: resolvedCfg,
        game: gameData,
        drt: drtData,
        timeline_events: timelineEvents,
        performance: perfSummary,
        performance_deltas: performanceDeltas,
        practice_press_results: practicePressResults,
        practice_press_count: practicePressResults.length,
        practice_correct_count: practicePressResults.filter(Boolean).length,
        practice_required_presses: requiredPresses,
        practice_replenish_delay_ms: replenishDelayMs,
      };
      if (debugCfg.performanceConsole) {
        console.info('[bricks-performance]', perfSummary);
      }
      if (resolvedCfg?.debug?.saveTrialLog) {
        const prefix = String(resolvedCfg?.debug?.trialLogPrefix || 'trial_debug_log');
        const stamp = Date.now();
        const filename = `${prefix}_b${trial.blockIndex}_t${trial.trialIndex}_${stamp}.json`;
        downloadJson(filename, trialData);
      }
      if (resolvedCfg?.debug?.printTrialLog) {
        console.info('[trial-debug-log]', trialData);
      }
      resolve(trialData);
    };
    const stopDrtForPendingEnd = () => {
      if (finalizedDrtData !== null || !drtController) return;
      finalizePracticeDrt(gameState.elapsed);
      drtPresentation?.hideAll();
      activeStimulusId = null;
    };

    const scheduleEnd = (reason: string) => {
      if (ended || pendingEnd) return;
      if (reason === 'brick_quota_met' && stopDrtOnBrickQuotaMet) {
        stopDrtForPendingEnd();
      }
      const delayMs = reason === 'brick_quota_met' ? brickQuotaEndDelayMs : globalEndDelayMs;
      pendingEnd = {
        reason,
        dueAtMs: gameState.elapsed + Math.max(0, delayMs),
      };
    };

    const tick = (timestamp: number) => {
      if (ended) return;
      const tickStartTs = performance.now();
      if (lastFrame === null) {
        lastFrame = timestamp;
      }
      const rawDt = timestamp - lastFrame;
      lastFrame = timestamp;
      const dt = renderer.clampFrameDelta(rawDt);
      frameStats.frames += 1;
      frameStats.rawDtSumMs += rawDt;
      frameStats.rawDtMinMs = Math.min(frameStats.rawDtMinMs, rawDt);
      frameStats.rawDtMaxMs = Math.max(frameStats.rawDtMaxMs, rawDt);
      if (dt !== rawDt) {
        frameStats.clampedFrames += 1;
      }
      if (rawDt > frameBudgetMs) {
        frameStats.budgetOverrunFrames += 1;
      }
      if (rawDt > frameBudgetMs * 2) {
        frameStats.severeFrames += 1;
      }

      gameState.step(dt);
      if (autoEnabled && trialStarted) {
        if (pendingEnd?.reason === 'brick_quota_met') {
          renderer.updateBackground(dt);
          renderer.updateBelts(gameState.conveyors, dt);
          renderer.updateFurnaces(dt);
          const clearedVisualsA = gameState.consumeClearedVisuals();
          const droppedVisualsA = gameState.consumeDroppedVisuals();
          // TODO: Clear effects are prioritized over drop effects if visuals budget is reached.
          renderer.updateCharacter(dt, clearedVisualsA.length, droppedVisualsA.length);
          renderer.updateEffects(dt);
          const focusState = gameState.getFocusState();
          renderer.syncBricks(gameState.bricks.values(), resolvedCfg.bricks.completionMode, resolvedCfg.bricks.completionParams, focusState);
          const remainingMs = maxDuration !== null ? Math.max(0, maxDuration - gameState.elapsed) : null;
          const hudStats = gameState.getHUDStats();
          const hudDisplayStats = {
            ...hudStats,
            spawned: Number(hudStats.spawned ?? 0) + (Number.isFinite(hudBaseStats.spawned) ? Number(hudBaseStats.spawned) : 0),
            cleared: Number(hudStats.cleared ?? 0) + (Number.isFinite(hudBaseStats.cleared) ? Number(hudBaseStats.cleared) : 0),
            dropped: Number(hudStats.dropped ?? 0) + (Number.isFinite(hudBaseStats.dropped) ? Number(hudBaseStats.dropped) : 0),
            points: Number(hudStats.points ?? 0) + (Number.isFinite(hudBaseStats.points) ? Number(hudBaseStats.points) : 0),
          };

          const hudUiCfg = ((resolvedCfg?.display?.ui ?? resolvedCfg?.ui) || {}) as Record<string, unknown>;
          const hudShowTimer = hudUiCfg.showTimer !== false;
          const hudShowDrt = drtEnabled && hudUiCfg.showDRT !== false;
          const remainingBucket = remainingMs === null ? 'none' : String(Math.floor(remainingMs / hudTimerGranularityMs));
          const hudSignature = [
            hudShowTimer ? String(hudStats.timeElapsedMs) : 'timer_hidden',
            String(hudStats.bricksActive),
            String(hudDisplayStats.spawned),
            String(hudDisplayStats.cleared),
            String(hudDisplayStats.dropped),
            String(hudDisplayStats.points),
            String(hudStats.focusBrickId ?? ''),
            String(hudStats.focusBrickValue ?? ''),
            String(focusState?.activeBrickId ?? ''),
            hudShowTimer ? remainingBucket : 'timer_hidden',
            hudShowDrt ? String(drtStatsSnapshot.presented) : 'drt_hidden',
            hudShowDrt ? String(drtStatsSnapshot.hits) : 'drt_hidden',
            hudShowDrt ? String(drtStatsSnapshot.misses) : 'drt_hidden',
            hudShowDrt ? String(drtStatsSnapshot.falseAlarms) : 'drt_hidden',
          ].join('|');
          if (hudSignature !== lastHudSignature) {
            lastHudSignature = hudSignature;
            renderer.updateHUD(hudDisplayStats, remainingMs, {
              label: args.blockLabel,
              drtStats: drtEnabled ? drtStatsSnapshot : undefined,
              focusInfo: null,
              drtEnabled,
              roundsRemaining: args.roundsRemaining,
            });
          }
          if (pendingEnd && gameState.elapsed >= pendingEnd.dueAtMs) {
            endTrial(pendingEnd.reason, keyHandler);
          }
          animationFrameId = requestAnimationFrame(tick);
          return;
        }
        if (gameState.elapsed >= nextAutoActionAt) {
          const activeBricks = gameState.activeBricks;
          if (activeBricks.length > 0) {
            const focusState = gameState.getFocusState();
            const focusId = focusState.enabled ? focusState.activeBrickId : null;
            const candidate = (focusId ? activeBricks.find((b) => b.id === focusId) : null)
              ?? activeBricks[Math.floor(gameState.rng.nextFloat() * activeBricks.length)]
              ?? activeBricks[0];
            const holdDurationMs = sampleAutoHoldDurationMs() ?? 500;
            const point = candidate?.sprite ?? { x: 0, y: 0 };
            processPracticeHold(String(candidate.id), holdDurationMs, Number(point.x ?? 0), Number(point.y ?? 0));
          }
          const interActionDelayMs = sampleAutoInteractionDelayMs() ?? 900;
          nextAutoActionAt = gameState.elapsed + Math.max(40, interActionDelayMs);
        }
      }
      renderer.updateBackground(dt);
      renderer.updateBelts(gameState.conveyors, dt);
      renderer.updateFurnaces(dt);
      // Ignore normal visual queues because we queue practice feedback on every hold release directly.
      const clearedVisualsB = gameState.consumeClearedVisuals();
      const droppedVisualsB = gameState.consumeDroppedVisuals();
      // TODO: Clear effects are prioritized over drop effects if visuals budget is reached.
      renderer.updateCharacter(dt, clearedVisualsB.length, droppedVisualsB.length);
      renderer.updateEffects(dt);

      const focusState = gameState.getFocusState();
      renderer.syncBricks(gameState.bricks.values(), resolvedCfg.bricks.completionMode, resolvedCfg.bricks.completionParams, focusState);
      const remainingMs = maxDuration !== null ? Math.max(0, maxDuration - gameState.elapsed) : null;
      const hudStats = gameState.getHUDStats();
      const hudDisplayStats = {
        ...hudStats,
        spawned: Number(hudStats.spawned ?? 0) + (Number.isFinite(hudBaseStats.spawned) ? Number(hudBaseStats.spawned) : 0),
        cleared: Number(hudStats.cleared ?? 0) + (Number.isFinite(hudBaseStats.cleared) ? Number(hudBaseStats.cleared) : 0),
        dropped: Number(hudStats.dropped ?? 0) + (Number.isFinite(hudBaseStats.dropped) ? Number(hudBaseStats.dropped) : 0),
        points: Number(hudStats.points ?? 0) + (Number.isFinite(hudBaseStats.points) ? Number(hudBaseStats.points) : 0),
      };

      const hudUiCfg = ((resolvedCfg?.display?.ui ?? resolvedCfg?.ui) || {}) as Record<string, unknown>;
      const hudShowTimer = hudUiCfg.showTimer !== false;
      const hudShowDrt = drtEnabled && hudUiCfg.showDRT !== false;
      const remainingBucket = remainingMs === null ? 'none' : String(Math.floor(remainingMs / hudTimerGranularityMs));
      const hudSignature = [
        hudShowTimer ? String(hudStats.timeElapsedMs) : 'timer_hidden',
        String(hudStats.bricksActive),
        String(hudDisplayStats.spawned),
        String(hudDisplayStats.cleared),
        String(hudDisplayStats.dropped),
        String(hudDisplayStats.points),
        String(hudStats.focusBrickId ?? ''),
        String(hudStats.focusBrickValue ?? ''),
        String(focusState?.activeBrickId ?? ''),
        hudShowTimer ? remainingBucket : 'timer_hidden',
        hudShowDrt ? String(drtStatsSnapshot.presented) : 'drt_hidden',
        hudShowDrt ? String(drtStatsSnapshot.hits) : 'drt_hidden',
        hudShowDrt ? String(drtStatsSnapshot.misses) : 'drt_hidden',
        hudShowDrt ? String(drtStatsSnapshot.falseAlarms) : 'drt_hidden',
      ].join('|');
      if (hudSignature !== lastHudSignature) {
        lastHudSignature = hudSignature;
        renderer.updateHUD(hudDisplayStats, remainingMs, {
          label: args.blockLabel,
          drtStats: drtEnabled ? drtStatsSnapshot : undefined,
          focusInfo: null,
          drtEnabled,
          roundsRemaining: args.roundsRemaining,
        });
      }

      if (!pendingEnd && enforceBrickQuota) {
        const completed = practicePressResults.length;
        if (completed >= brickQuota) {
          scheduleEnd('brick_quota_met');
        }
      }

      if (pendingReplenish && gameState.elapsed >= pendingReplenish.dueAtMs) {
        const brick = gameState.bricks.get(pendingReplenish.brickId);
        if (brick) {
          brick.clearProgress = 0;
        }
        pendingReplenish = null;
      }

      // Re-spawn immediately when cleared to keep it looping
      if (gameState.bricks.size === 0) {
        const conveyor = gameState.conveyors[0];
        const width = Math.max(8, Number(resolvedCfg?.display?.brickWidth ?? 80));
        const centerX = Math.max(0, ((Number(conveyor?.length ?? width) - width) * 0.5));
        gameState._spawnBrick(conveyor, { x: centerX, reason: 'practice_respawn', bypassSpacing: true });
      }

      if (!pendingEnd && maxDuration !== null && gameState.elapsed >= maxDuration) {
        scheduleEnd('time_limit');
      }

      if (pendingEnd && gameState.elapsed >= pendingEnd.dueAtMs) {
        const tickCostMs = performance.now() - tickStartTs;
        frameStats.tickCostSumMs += tickCostMs;
        frameStats.tickCostMaxMs = Math.max(frameStats.tickCostMaxMs, tickCostMs);
        endTrial(pendingEnd.reason, keyHandler);
        return;
      }
      const tickCostMs = performance.now() - tickStartTs;
      frameStats.tickCostSumMs += tickCostMs;
      frameStats.tickCostMaxMs = Math.max(frameStats.tickCostMaxMs, tickCostMs);

      animationFrameId = requestAnimationFrame(tick);
    };

    const startLoop = () => {
      if (animationFrameId === null) {
        lastFrame = null;
        animationFrameId = requestAnimationFrame(tick);
      }
    };

    const beginTrial = () => {
      if (trialStarted) return;
      trialStarted = true;
      if (startOverlay && startOverlay.parentNode) {
        startOverlay.parentNode.removeChild(startOverlay);
      }
      if (stopButton) {
        stopButton.style.display = 'block';
      }
      if (!shouldSimulateDataOnly) {
        drtController?.start(0);
      }
      nextAutoActionAt = sampleAutoInteractionDelayMs() ?? 900;
      startLoop();
    };

    if (trialStarted) {
      if (!shouldSimulateDataOnly) {
        drtController?.start(0);
      }
      nextAutoActionAt = sampleAutoInteractionDelayMs() ?? 900;
      startLoop();
    }

    const keyHandler = (e: KeyboardEvent) => {
      const key = e.key;
      if (!trialStarted && startTrigger === 'space' && key === ' ') {
        e.preventDefault();
        beginTrial();
        return;
      }
      if (!trialStarted && startTrigger === 'click' && isContinueActivationKey(key)) {
        e.preventDefault();
        beginTrial();
        return;
      }
      if (normalizeKey(key) === normalizeKey(resolvedDrtConfig.key)) {
        e.preventDefault();
      }
    };

    window.addEventListener('keydown', keyHandler);
    clickStartHandler = () => {
      if (trialStarted) return;
      beginTrial();
    };
    if (startButton) {
      startButton.addEventListener('click', clickStartHandler);
      if (startOverlayCfg.buttonAutoFocus !== false) {
        startButton.focus();
      }
    }

    if (autoEnabled && !trialStarted) {
      const autoStartDelayMs = Math.max(100, sampleAutoInteractionDelayMs() ?? 800);
      window.setTimeout(() => {
        if (startTrigger === 'click') {
          startButton?.click();
        } else if (startTrigger === 'space') {
          const event = new KeyboardEvent('keydown', { key: ' ' });
          window.dispatchEvent(event);
        } else {
          beginTrial();
        }
      }, autoStartDelayMs);
    }

    if (maxDuration !== null) {
      window.setTimeout(() => {
        scheduleEnd('time_limit');
      }, maxDuration + 20);
    }
  });
}
