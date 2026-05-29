# Task: Change Detection

This document describes the implementation and configuration of the Change Detection task adapter at `tasks/change_detection/src/index.ts`.

## 1. Implementation Details

The task uses a memory-array paradigm where participants encode a set of stimuli, wait for a delay, and then identify if an item has changed in a probe display.

The adapter is defined using the `createTaskAdapter` factory:

```typescript
export const changeDetectionAdapter = createTaskAdapter({
  manifest: { taskId: "change_detection", ... },
  run: runChangeDetectionTask,
  terminate: async () => { setCursorHidden(false); },
});
```

### Core Framework Enhancements

This task leverages several core utilities:
- **`SpatialLayoutManager`**: Handles non-overlapping programmatic positioning of stimuli.
- **`SceneRenderer`**: Provides standardized canvas rendering for structured scenes.
- **`runCustomRtTrial`**: Allows for dynamic, multi-phase trial structures (Fixation → Encoding → Delay → Probe).
- **`TaskOrchestrator`**: Manages the high-level task lifecycle, including instructions, blocks, event emission, CSV export, and JATOS finalization.
- **`createEventLogger`**: Emits structured lifecycle events (`task_start`, `block_start`, `block_end`, `task_end`).

## 2. Lifecycle and Events

The task emits the following lifecycle events via `createEventLogger`:
- `task_start`: emitted at task begin, includes `{ task: "change_detection", runner: "native_canvas" }`.
- `block_start`: emitted at each block start, includes block label.
- `block_end`: emitted at each block end, includes block label and `accuracy` (%).
- `task_end`: emitted at task end.

Events are collected via `getEvents` and included in the final session payload.

## 3. Configuration Schema

The task is configured via JSON. Below is the schema for the `taskConfig`:

### `timing`
- `fixationMs`: Duration of the fixation cross.
- `encodingMs`: Duration of the encoding stimulus display.
- `delayMs`: Duration of the blank delay interval.
- `probeMs`: Maximum duration of the probe display.

### `stimulus`
- `layout`:
    - `type`: `"circular"`, `"grid"`, or `"random"`.
    - `radius`: Radius for circular layout (default: 200).
    - `padding`: Minimum padding between items in random layout.
- `items`:
    - `shapes`: Array of allowed shapes (default: `["circle", "square"]`).
    - `colors`: Array of allowed colors (default: `["red", "blue", "green", "yellow", "black"]`).

### `mapping`
- `changeKey`: Key to press when the probe has changed (default: `"s"`).
- `noChangeKey`: Key to press when the probe is the same (default: `"d"`).

### `feedback`
Uses core shared feedback config:
- `enabled`
- `durationMs`
- `messages.*`
- `style.*`

### `display`
- `aperturePx`: Canvas aperture size in pixels (default: 560).

### `plan`
Defines the blocks and trial distributions.
- `blocks`: Array of block configurations.
    - `label` (optional block label)
    - `trials`: Total trials in block.
    - `changeProbability`: Probability of a "change" trial (default: 0.5).
    - `setSizes`: Array of set sizes to sample from (e.g., `[4, 6, 8]`).
    - `beforeBlockScreens` / `preBlockInstructions` (optional pre-block screens)
    - `afterBlockScreens` / `postBlockInstructions` (optional post-block screens)

### `instructions`
Change Detection uses shared core instruction-slot keys:
- intro: `pages|introPages|intro|screens`
- pre-block: `preBlockPages|beforeBlockPages|beforeBlockScreens`
- post-block: `postBlockPages|afterBlockPages|afterBlockScreens`
- end: `endPages|outroPages|end|outro`

Additional controls:
- `blockIntroTemplate` (supports `{blockLabel}` and `{nTrials}`)
- `showBlockLabel` (default `true`)
- `preBlockBeforeBlockIntro` (default `false`)

## 4. Data Output

### JSON Payload
Includes the full `sessionResult` with detailed trial-level metadata:
- `setSize`: Number of items in the trial.
- `isChange`: Boolean indicating if the trial was a change trial.
- `rtMs`: Response time in milliseconds.
- `key`: The key pressed by the participant.
- `responseCorrect`: `1` for correct, `0` for incorrect.
- `diff`: Details of the change (indices of changed items via `changedIndices`).

### CSV Output
A flattened version of the trial results, saved as `change_detection_trials` (CSV suffix). Columns include all trial-level fields, with `changedIndices` serialized as pipe-separated values.
