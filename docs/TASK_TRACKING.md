# Task: Tracking

This document describes the current tracking adapter at `tasks/tracking/src/index.ts`.

## 1. Implementation Details

The Tracking task is implemented using the `createTaskAdapter` factory:

```typescript
export const trackingAdapter = createTaskAdapter({
  manifest: { taskId: "tracking", ... },
  run: runTrackingTask,
  terminate: async () => { /* module + cursor cleanup */ },
});
```

- **`run(context)`**: Runs the main Tracking task logic (pursuit or MOT) using a native animation loop, managing DRT scopes via `TaskModuleRunner`.
- **`terminate()`**: Stops all active task modules and resets the cursor.

## 2. Purpose

`tracking` is a continuous mouse-tracking task for long trials.

Primary output is binned performance for each trial:
- inside vs outside sample counts per bin
- mean absolute cursor distance from target boundary per bin (inside = `0`)

## 2. Variant Configs

- `tracking/default`
- `tracking/drt_demo`
- `tracking/mot_demo`

## 3. Runtime Model

The task runs natively (not a jsPsych plugin trial), with:
- intro / block / end instruction screens via core `waitForContinue`
- per-trial animation loop (`requestAnimationFrame`) in a centered display frame
- optional DRT embeds using core `DrtController` with `scope: "block" | "trial"`
- renderer backend selection via `display.rendererBackend` (`"canvas"` or `"pixi"`)

Cursor behavior:
- `pursuit` (mouse-tracking): cursor is visible (crosshair).
- `mot` visual tracking: cursor is hidden during cue/tracking and shown again for response selection.

## 4. Config Surface (Current)

### 4.1 `task`

- `task.title`
- `task.drt` (or `task.embeds.drt`): base DRT config for all blocks

### 4.2 `instructions`

- `instructions.pages` (preferred): string or string[]
  - aliases: `introPages`, `intro`, `screens`
- `instructions.preBlockPages`: string or string[]
- `instructions.postBlockPages`: string or string[]
- `instructions.endPages`: string or string[]
- `instructions.blockIntroTemplate`: supports `{nTrials}` and `{phase}`

Setting a slot to `""` (or arrays containing only blank strings) clears that slot.

Example:
```json
{
  "instructions": {
    "pages": [
      "Welcome.",
      "Track the target continuously."
    ],
    "preBlockPages": "Keep your cursor active throughout the block.",
    "postBlockPages": "Block complete. Brief pause.",
    "endPages": "Tracking task complete."
  }
}
```

### 4.3 `display`

- `aperturePx`
- `frameBackground`
- `frameBorder`
- `canvasBackground`
- `showCrosshair`
- `rendererBackend`: `"canvas" | "pixi"` (defaults to `"canvas"`)

### 4.4 `trialDefaults`

- `mode`: `"pursuit" | "mot"` (defaults to `"pursuit"`)
- `durationMs`
- `sampleIntervalMs`
- `binMs`
- `storeRawSamples`
- `target`
  - `shape`: `"circle" | "square"`
  - `sizePx`
  - `colorOn`
  - `colorOff`
  - `borderColor`
  - `borderWidthPx`
- `motion`
  - `mode`: `"waypoint" | "chaotic"`
  - waypoint fields: `speedPxPerSec`, `minSegmentPx`, `arriveThresholdPx`
  - chaotic fields: `speedPxPerSec`, `directionJitterRadPerSec`
- `mot`
  - `objectCount`, `targetCount`, `objectRadiusPx`
  - `cueDurationMs`
  - `responseMaxDurationMs` (`0` = no timeout)
  - `responseFinishKey`
  - `cueTargetColor`, `cueDistractorColor`, `trackingColor`
  - `responseSelectedColor`, `responseUnselectedColor`
  - `objectBorderColor`, `objectBorderWidthPx`
  - `responsePromptText`

### 4.5 `plan.blocks[]`

- `label`
- `phase`
- `trials`
- `manipulation` (optional single manipulation id)
- `manipulations` (optional ordered manipulation id list)
- `manipulationPool` (optional pool id; draws one manipulation bundle from `plan.manipulationPools`)
- `trialDurationMs` (block override for `trialDefaults.durationMs`)
- `sampleIntervalMs`
- `binMs`
- `storeRawSamples`
- `target` (block override)
- `motion` (block override)
- `mode` (block override)
- `mot` (block override)
- `beforeBlockScreens` (alias: `preBlockInstructions`)
- `afterBlockScreens` (alias: `postBlockInstructions`)
- `drt` (or `embeds.drt`) block-level DRT override

### 4.6 `plan.manipulations[]` and `plan.manipulationPools`

- `plan.manipulations[]` entries support:
  - `id` (required)
  - `overrides` (deep-merged into block config when selected)
- `plan.manipulationPools` entries support participant-seeded shuffled bundle draws:
  - `poolId: [ [\"manipA\"], [\"manipB\", \"manipC\"], ... ]`
- Unknown manipulation ids fail fast during config parsing.
- Resolved manipulation ids are emitted as a joined `manipulationId` string on block/trial outputs.

## 5. Output

Saved JSON payload includes:
- `records`: one row per trial
- `trialBins`: one row per trial-bin
- `rawSamples`: optional high-frequency samples when enabled
- `drt.scopeRecords`: DRT runtime exports per active scope
- `drtTransformEstimates`: flattened transform estimates from DRT events
- `eventLog`

CSV export (`tracking_trials`) contains trial-level summary rows.

## 6. MOT Runtime Behavior

When `mode` is `"mot"`:
- dots move continuously during cue and tracking phases
- cue phase marks targets with a distinct color
- tracking phase removes cue distinction (all dots share a color)
- response phase freezes motion, allows click toggles, and confirms via `responseFinishKey`
- trial rows include `motHits`, `motMisses`, `motFalseAlarms`, `motCorrectRejections`, and `motAccuracy`
