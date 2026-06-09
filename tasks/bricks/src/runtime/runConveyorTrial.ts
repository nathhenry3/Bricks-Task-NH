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
import { resolveEmbeddedTaskConfig, runEmbeddedTask } from './embedded_tasks.js';

export interface ConveyorTrialRunArgs {
  displayElement: HTMLElement;
  blockLabel: string;
  blockIndex: number;
  trialIndex: number;
  roundsRemaining?: number;
  config: Record<string, unknown>;
  drtRuntime?: ConveyorTrialDrtRuntime;
  hudBaseStats?: Partial<Record<'spawned' | 'cleared' | 'dropped' | 'points', number>>;
}

export interface ConveyorTrialData {
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
}

export interface ConveyorTrialDrtRuntimeBindings {
  displayElement?: HTMLElement | null;
  getElapsedMs: () => number;
  onEvent: (event: Record<string, unknown>) => void;
  onStimStart: (stimulus: Record<string, unknown>) => void;
  onStimEnd: (stimulus: Record<string, unknown>) => void;
}

export interface ConveyorTrialDrtRuntime {
  config: BricksScopedDrtConfig;
  controller: DrtController;
  stopOnCleanup?: boolean;
  attachBindings?: (bindings: ConveyorTrialDrtRuntimeBindings) => void;
  detachBindings?: () => void;
}

const randomUint32 = nextSecureUint32;

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

export async function runConveyorTrial(args: ConveyorTrialRunArgs): Promise<ConveyorTrialData> {
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
    const interactionDelayFallbackMs = skipConveyor ? 40 : 900;
    let nextAutoActionAt = Math.max(40, sampleAutoInteractionDelayMs() ?? interactionDelayFallbackMs);
    let pendingEnd: { reason: string; dueAtMs: number } | null = null;
    while (!pendingEnd || gameState.elapsed < pendingEnd.dueAtMs) {
      gameState.step(DATA_ONLY_STEP_MS);
      if (gameState.elapsed >= nextAutoActionAt) {
        const activeBricks = gameState.activeBricks;
        if (activeBricks.length > 0) {
          const focusState = gameState.getFocusState();
          const focusId = focusState.enabled ? focusState.activeBrickId : null;
          const candidate = (focusId ? activeBricks.find((b) => b.id === focusId) : null)
            ?? activeBricks[Math.floor(gameState.rng.nextFloat() * activeBricks.length)]
            ?? activeBricks[0];
          if (resolvedCfg.bricks?.completionMode === 'task_sequence') {
            const { taskId, taskConfig } = resolveEmbeddedTaskConfig(resolvedCfg);
            const started = gameState.startBrickTaskSequence(String(candidate.id), taskId, String(taskConfig.type ?? 'sternberg'), gameState.elapsed, { x: 0, y: 0 });
            if (started?.ok) {
              gameState.handleBrickTaskCompletion(String(candidate.id), {
                taskId,
                taskType: String(taskConfig.type ?? 'sternberg'),
                correct: true,
                response: 'ArrowRight',
                expectedResponse: 'ArrowRight',
                reactionTimeMs: 0,
                payload: {
                  task_id: taskId,
                  task_type: String(taskConfig.type ?? 'sternberg'),
                  response: 'ArrowRight',
                  expected_response: 'ArrowRight',
                  correct: true,
                  autoresponder: true,
                }
              }, gameState.elapsed);
            }
          } else {
            const holdDurationMs = sampleAutoHoldDurationMs() ?? 500;
            gameState.handleBrickHold(String(candidate.id), holdDurationMs, gameState.elapsed, { x: 0, y: 0 });
          }
        }
        nextAutoActionAt = gameState.elapsed + Math.max(40, sampleAutoInteractionDelayMs() ?? interactionDelayFallbackMs);
      }
      if (!pendingEnd && enforceBrickQuota) {
        const completed = gameState.stats.cleared + gameState.stats.dropped;
        if (completed >= brickQuota && gameState.bricks.size === 0) {
          pendingEnd = { reason: 'brick_quota_met', dueAtMs: gameState.elapsed + brickQuotaEndDelayMs };
        }
      }
      if (!pendingEnd && maxDuration !== null && gameState.elapsed >= maxDuration) {
        pendingEnd = { reason: 'time_limit', dueAtMs: gameState.elapsed };
      }
      // Safety valve: prevent infinite loop if maxDuration is null and quota never met
      if (!pendingEnd && gameState.elapsed > 600_000) {
        pendingEnd = { reason: 'safety_limit', dueAtMs: gameState.elapsed };
      }
    }
    injectedDrtRuntime?.detachBindings?.();
    const drtData = drtController
      ? (() => {
          if (shouldSimulateDataOnly && injectedDrtRuntime?.stopOnCleanup !== false) {
            drtController.simulateDataOnlyWindow(gameState.elapsed);
          }
          return injectedDrtRuntime?.stopOnCleanup === false ? drtController.exportData() : drtController.stop();
        })()
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
    };
  }


  let activeEmbeddedTask = false;
  const launchEmbeddedTaskForBrick = (brickId: string, x: number, y: number) => {
    if (activeEmbeddedTask || ended) return;
    const { taskId, taskConfig } = resolveEmbeddedTaskConfig(resolvedCfg);
    const taskType = String(taskConfig.type ?? 'sternberg');
    const started = gameState.startBrickTaskSequence(brickId, taskId, taskType, gameState.elapsed, { x, y });
    if (!started?.ok) return;
    activeEmbeddedTask = true;
    runEmbeddedTask({
      container,
      taskId,
      taskConfig,
      rng: gameState.rng,
      autoRespond: autoEnabled,
      autoResponder: {
        ...(resolvedCfg?.autoresponder || {}),
        ...(autoProfile || {}),
      },
      now: () => gameState.elapsed,
    }).then((result) => {
      if (!ended) {
        gameState.handleBrickTaskCompletion(brickId, result, gameState.elapsed);
      }
    }).catch((error) => {
      console.warn('Embedded Bricks task failed:', error);
    }).finally(() => {
      activeEmbeddedTask = false;
    });
  };

  const renderer = new ConveyorRenderer(resolvedCfg, {
    onBrickClick: (brickId: string, x: number, y: number) => {
      if (resolvedCfg.bricks?.completionMode === 'task_sequence') {
        launchEmbeddedTaskForBrick(brickId, x, y);
        return;
      }
      gameState.handleBrickInteraction(brickId, gameState.elapsed, { x, y });
    },
    onBrickHold: (brickId: string, holdDurationMs: number, x: number, y: number) => {
      const brickBefore = gameState.bricks.get(brickId);
      if (!brickBefore) return;

      const holdsBefore = brickBefore.holds ?? 0;
      gameState.handleBrickHold(brickId, holdDurationMs, gameState.elapsed, { x, y });
      
      const brickAfter = gameState.bricks.get(brickId);
      const showHoldFeedback = (resolvedCfg?.ui?.showHoldFeedback === true) || (resolvedCfg?.display?.ui?.showHoldFeedback === true);

      // Only show feedback if the brick STILL exists (wasn't cleared) 
      // This prevents the feedback label from overlapping with the "coin" animation.
      if (showHoldFeedback && brickAfter && (brickAfter.holds ?? 0) > holdsBefore) {
        const params = resolvedCfg.bricks?.completionParams || {};
        const targetHoldMs = Math.max(50, Number(brickAfter.targetHoldMs ?? params.target_hold_ms ?? 700));
        const scaledPerformanceDelta = (holdDurationMs - targetHoldMs) / targetHoldMs;
        
        renderer.queuePracticeFeedback([{
          brickId: brickAfter.id,
          conveyorId: brickAfter.conveyorId,
          hold_ms: holdDurationMs,
          scaledPerformanceDelta,
          x: brickAfter.x,
          y: brickAfter.y,
          width: brickAfter.width,
          height: brickAfter.height,
        }]);
      }
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

  // Prime the first frame so spotlight hit-area is interactive before the first RAF tick.
  const initialFocusState = gameState.getFocusState();
  renderer.syncBricks(gameState.bricks.values(), resolvedCfg.bricks.completionMode, resolvedCfg.bricks.completionParams, initialFocusState);

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

  const finalizeTrialDrt = (durationMs: number): void => {
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
          finalizeTrialDrt(gameState.elapsed);
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

  return await new Promise<ConveyorTrialData>((resolve) => {
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
        renderer: rendererPerf
      };
      const clockTimeUnixMs = Date.now();
      const trialData: ConveyorTrialData = {
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
      finalizeTrialDrt(gameState.elapsed);
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
        if (gameState.elapsed >= nextAutoActionAt) {
          const activeBricks = gameState.activeBricks;
          if (activeBricks.length > 0) {
            const focusState = gameState.getFocusState();
            const focusId = focusState.enabled ? focusState.activeBrickId : null;
            const candidate = (focusId ? activeBricks.find((b) => b.id === focusId) : null)
              ?? activeBricks[Math.floor(gameState.rng.nextFloat() * activeBricks.length)]
              ?? activeBricks[0];
            const point = candidate?.sprite ?? { x: 0, y: 0 };
            if (resolvedCfg.bricks?.completionMode === 'task_sequence') {
              launchEmbeddedTaskForBrick(String(candidate.id), Number(point.x ?? 0), Number(point.y ?? 0));
            } else {
              const holdDurationMs = sampleAutoHoldDurationMs() ?? 500;
              gameState.handleBrickHold(String(candidate.id), holdDurationMs, gameState.elapsed, {
                x: Number(point.x ?? 0),
                y: Number(point.y ?? 0),
              });
            }
          }
          const interActionDelayMs = sampleAutoInteractionDelayMs() ?? 900;
          nextAutoActionAt = gameState.elapsed + Math.max(40, interActionDelayMs);
        }
      }
      renderer.updateBackground(dt);
      renderer.updateBelts(gameState.conveyors, dt);
      renderer.updateFurnaces(dt);
      const clearedVisuals = gameState.consumeClearedVisuals();
      const droppedVisuals = gameState.consumeDroppedVisuals();
      // TODO: Clear effects are prioritized over drop effects if visuals budget is reached.
      renderer.queueClearEffects(clearedVisuals);
      renderer.queueDropEffects(droppedVisuals);
      renderer.updateCharacter(dt, clearedVisuals.length, droppedVisuals.length);
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
          label: trial.blockLabel,
          drtStats: drtEnabled ? drtStatsSnapshot : undefined,
          focusInfo: focusState,
          drtEnabled,
          roundsRemaining: trial.roundsRemaining,
        });
      }

      if (!pendingEnd && enforceBrickQuota) {
        const completed = gameState.stats.cleared + gameState.stats.dropped;
        if (completed >= brickQuota && gameState.bricks.size === 0) {
          scheduleEnd('brick_quota_met');
        }
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
