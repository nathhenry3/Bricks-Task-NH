# Task: Bricks (Conveyor) Implementation & Config

This document describes the current Bricks adapter at `tasks/bricks/src/index.ts`.

## 1. Implementation Details

The Bricks task is implemented using the `createTaskAdapter` factory:

```typescript
export const bricksAdapter = createTaskAdapter({
  manifest: { taskId: "bricks", ... },
  run: runBricksTask,
  terminate: async () => { /* module cleanup */ },
});
```

- **`run(context)`**: Runs Bricks through core `TaskOrchestrator`; instruction flow and module lifecycle are orchestrator-managed.
- **`terminate()`**: Stops all active task modules.

## 2. Runtime model

Bricks runs as a `native` task via the `LifecycleManager`.

## 2. Planning schema consumed by adapter

Top-level planning keys:
- `blocks[]` (required; `plan.blocks[]` is also accepted)
- `manipulations[]` (optional but typically present; `plan.manipulations[]` is also accepted)
- `manipulationPools` (optional; `plan.manipulationPools` is also accepted)

`blocks[*]`:
- `label`
- `trials`
- `manipulation` (single id)
- `manipulations` (ordered list of ids)
- `manipulationPool` (draws id bundle from top-level `manipulationPools`)
- `overrides`

`manipulations[*]`:
- `id`
- `label`
- `overrides`
- `trialPlan.schedule` or `trial_plan.schedule`
- `trialPlan.variants[]` or `trial_plan.variants[]` (`id`, `label`, `weight`, `overrides`)

Per-trial config is deep-merged in this order:
1. full base config clone
2. selected manipulation overrides (for all resolved ids, in order)
3. block overrides
4. scheduled variant overrides

Top-level optional:
- `manipulationPools`:
  - `poolId: [ [manipA, manipB], [manipC], ... ]`
  - blocks with `manipulationPool: "poolId"` draw one bundle
  - draws are participant-seeded and shuffled without replacement, then recycled
- `surveys`:
  - `surveys.postTrial[]` supports preset surveys (`"atwit"`, `"nasa_tlx"`)
  - use `showQuestionNumbers: false` to hide `Q1`/`1.` labels when rendering survey items
  - use `showRequiredAsterisk: false` to hide required `*` markers while keeping required validation
  - use `questionBorder: "none"` to remove per-question border boxes
  - optional `questionBorderRadius` sets per-question border radius (for example `"0"` or `"8px"`)

## 3. Runtime config sections

The merged per-trial config is passed to conveyor runtime. Common sections:
- `display`
- `conveyors`
- `bricks`
- `drt`
- `trial`
- `experiment`
- `experiment.statsPresentation` (optional HUD stats scoping + reset rules)
- `debug`
- `difficultyModel`
- `selfReport`
- `instructions`

### DRT config (Bricks)

Bricks reads DRT from `task.modules.drt` (and per-trial/per-block overrides via `modules.drt` on merged trial config).

For block-scoped DRT:
- You only need to configure `scope: "block"` at task-level or trial-level module config.
- Bricks now auto-projects block-scoped trial config into orchestrator block module config; no task-local scope wrapper config is required.

Key fields:
- `enabled`: boolean
- `scope`: `"trial"` or `"block"`
- `parameterTransforms`: array of transform configs (for example `[{ "type": "wald_conjugate" }]`)
- `transformPersistence`: `"scope"` (default) or `"session"`

`wald_conjugate` transform options:
- `t0Mode`: `"fixed"` (default) or `"min_rt_multiplier"` (aliases: `t0_mode`, `t0mod`)
- `t0`: fixed non-decision time in ms when `t0Mode = "fixed"`
- `t0Multiplier`: multiplier for minimum observed finite DRT RT when `t0Mode = "min_rt_multiplier"` (aliases: `t0_multiplier`, `t0mult`)

`transformPersistence` controls moving-window/prior continuity for online transforms:
- `"scope"`: reset transform window/priors when each DRT scope ends.
- `"session"`: keep transform window/priors across all DRT scopes in the task run.

How to get per-block vs per-experiment transform history:
- Per-block moving window: set `scope: "block"` and `transformPersistence: "scope"`.
- Per-experiment moving window: set `transformPersistence: "session"` (with either `scope: "block"` or `"trial"`).

Important: `parameterTransforms` must be an array of objects. A string value like `"wald_conjugate"` is ignored by coercion.

`instructions` supports either simple strings or rich page objects:
- string page: `"Read this"`
- object page: `{ "title": "How To Process", "html": "<p>...</p>" }`
- shared slots: `pages|introPages|intro|screens`, `preBlockPages|beforeBlockPages|beforeBlockScreens`, `postBlockPages|afterBlockPages|afterBlockScreens`, `endPages|outroPages|end|outro`
- block flow controls: `blockIntroTemplate`, `showBlockLabel`, `preBlockBeforeBlockIntro`
- optional: `showBlockIntro` (default `true`) to include/skip the automatic block-intro continue card
- block-level pre-screen aliases in `blocks[]`: `beforeBlockScreens` and `preBlockScreens` (legacy: `preBlockInstructions`)

Instruction text/html supports `{dot.path}` interpolation against the merged Bricks config (and resolver-backed variables), for example:
- `{bricks.completionParams.target_hold_ms}`

For detailed runtime field definitions, use:
- [bricks-runtime-config-schema.md](./bricks-runtime-config-schema.md)

Completion-mode note (`hover_to_clear`):
- Hover processing is rate-based.
- Bricks keep moving while hovered, and visible width is depleted from the right edge at a processing rate (`completionParams.hover_process_rate_px_s`).
- If that config key is omitted, the runtime default is the brick/conveyor progress-rate variable `brick.speed` (not a fixed constant).

Completion-mode note (`hold_to_clear`):
- Hold processing is rate-based while the pointer is held down.
- Bricks keep moving while held, and visible width is depleted at `completionParams.hold_process_rate_px_s`.
- Supports all interaction targeting areas (`brick`, `conveyor`, `spotlight`).
- If that key is omitted, runtime falls back to `brick.speed`.

Completion-mode note (`hold_duration`):
- Optional `completionParams.hold_floor_ms` applies a low-end floor.
- Holds shorter than this floor contribute zero progress, while overshoot still respects `completionParams.overshoot_tolerance_ms`.

Completion-mode note (`task_sequence`):
- A valid brick click launches the configured embedded task (`completionParams.taskId`) as a modal overlay above the conveyor.
- The conveyor clock and belt motion continue while the modal is active, but another embedded task cannot be launched until the active one resolves.
- Correct embedded-task responses add `completionParams.progress_per_correct` progress, with the same optional width scaling fields used by progress-based modes (`width_scaling`, `width_reference_px`, `width_scaling_exponent`). Incorrect responses are logged and receive brief feedback but add no progress.
- Embedded tasks are configured under `bricks.embeddedTasks`; the first built-in type is `sternberg`, which displays letter memory sets and supports configurable response keys, memory duration, retention delay, and feedback duration.
- The progress pathway is mode-neutral: replacing the Sternberg entry with another embedded task type should only require a new embedded-task runner that returns a `{ correct }` result, not new brick scoring code.

Interaction targeting note:
- Default targeting is direct brick hit-testing.
- Preferred selector is `bricks.interaction.targetingArea`:
  - `"brick"` (default)
  - `"conveyor"` (click/hover anywhere on a lane targets the front-most brick on that lane)
  - `"spotlight"` (click/hover anywhere in spotlight area targets the currently spotlighted brick)
- Legacy aliases remain supported:
  - `bricks.interaction.conveyorWideHitArea: true` -> `"conveyor"`
  - `bricks.interaction.spotlightWideHitArea: true` -> `"spotlight"`
- Cursor/hover reconciliation runs each frame using tracked pointer position, so cursor/hover state updates when moving bricks/spotlight enter a stationary pointer.

Conveyor speed note:
- `conveyors.speedPxPerSec` remains the baseline speed sampler (sampled once at trial init per conveyor).
- Optional `conveyors.dynamicSpeed` adds runtime speed changes (off by default):
  - each conveyor gets an independent interval timer and speed sampler
  - supports per-conveyor overrides (`perConveyor.c0`, `perConveyor.c1`, etc.)
  - when disabled, no runtime speed resampling logic is executed

Spotlight rendering note:
- `display.spotlight.snapMode` controls spotlight geometry snapping (`"screen"` default, `"pixel"`, `"none"`).
- Use `"screen"` to reduce visible spotlight judder while keeping crisp edges; use `"none"` for fully subpixel motion.

## 4. Event/data outputs

Per-trial conveyor output (`ConveyorTrialData`) is appended to `records`.

Session finalization is handled internally by `TaskOrchestrator` (via the core data sink and JATOS submission pipeline). Task adapters do not call `finalizeTaskRun` directly.

Final payload shape:

```json
{
  "selection": {},
  "records": [],
  "drt_rows": [],
  "events": []
}
```

Notes on `drt` outputs:
- Trial-scoped DRT: `record.drt` reflects that trial scope snapshot (including `transform_latest` when available); response-level DRT rows are attached as `drt_response_rows`.
- Block-scoped DRT: `record.drt.stats` is converted to per-trial deltas for accurate trial/block summaries, and cumulative snapshots are preserved in `record.drt_cumulative`.
- For trial-scoped DRT, Bricks gates DRT onset to the active trial run window only (from trial start trigger to trial end), so post-trial survey screens are outside DRT scope.
- Optional trial config `trial.stopDrtOnBrickQuotaMet: true` (alias `trial.endDrtOnBrickQuotaMet`) stops trial-scoped DRT immediately when `brick_quota_met` is reached, even if a post-end delay is configured.
- Bricks does not manually start/stop DRT modules; it consumes active DRT handles exposed by core module orchestration.

`drt_response_rows` now carries per-response transform data directly:
- `estimate`: primary transform estimate for that response (or `null`)
- `transformColumns`: flattened scalar columns for analysis-ready long format (for example `drift_rate`, `threshold`, `t0`, and CI bounds like `drift_rate_ci_lower`/`drift_rate_ci_upper`)

Notes on runtime performance outputs:
- Each trial record now includes `record.performance` with frame pacing summary (`avg_fps`, frame overrun ratios, tick cost) and renderer counters (active/peak effects, skipped effects at cap, clear-point effects queued, active/peak brick sprites).
- Hold-duration practice records also include `practice_press_results` (boolean per registered hold), `practice_press_count`, `practice_correct_count`, and `practice_required_presses`.

Hold-duration practice helper config (`trial.holdDurationPractice`):
- `requiredPresses`: force press-count quota by switching practice run logic to `max_bricks`.
- `fullWidthConveyor`: when true (default), practice conveyor uses full canvas width.
- `centerBrick`: when true (default), practice brick is placed at conveyor midpoint.
- `replenishDelayMs` (aliases: `trialTimeMs`, `nextTrialDelayMs`): after each hold release, keep the visible clear-progress state for this many ms, then refill to full to start the next practice press-trial.
- `useSpotlightWindow` (alias: `spotlightWindow`): enable the spotlight window / forced-order focus frame in hold-duration practice.
- `hideHud`: when true (default), hides HUD counters/timer during hold-duration practice.

Quota note:
- Hold-duration `requiredPresses` now uses the internal count of registered practice hold trials (same source as `practice_press_results`), not `game.stats.cleared`.

Demo variant:
- `bricks/drt_block_demo` sets `drt.scope = "block"` for quick validation of continuous block-level DRT.

CSV export now uses long-format event records (`bricks_events`) as the primary CSV output.
- one row per timeline event/click/hold with shared trial identifiers (`participant_id`, block/trial fields, manipulation/plan columns)
- event payload flattened into direct columns (no `event_` prefix)
- null/undefined event fields are omitted from export so config-unused dimensions do not create empty CSV columns

Additional CSV outputs:
- `bricks_brick_outcomes`: one row per brick per trial, including end state (`brick_final_status`: `cleared`/`dropped`/`active_at_trial_end`)
  - includes hold metrics (`brick_hold_count`, `brick_hold_duration_ms_avg`)
  - `brick_click_count` is only emitted for non-hold completion modes
- `bricks_drt_rows`: one row per DRT response, with spotlight linkage at response time
- `bricks_surveys`: one row per completed survey response, with trial linkage columns and flattened `survey_answers_*` / `survey_scores_*`

DRT long-format rows remain available via task metadata (`drt_rows`) and include:
- Bricks trial linkage metadata (`participant_id`, block/trial ids/labels/phase, `block_static_manipulation_count`, `block_static_manipulation_label`, `block_static_manipulation_speed_px_per_sec`, `plan_variant_id`, `plan_variant_label`)
- spotlight context at response time (`spotlight_brick_id`, `spotlight_conveyor_id`) when available
- all flattened columns from each `drt_response_rows` entry (including dynamic transform fields in `transformColumns`)

## 5. HUD stats scope/reset

Bricks supports config-driven HUD stat scoping via `experiment.statsPresentation`:

- scopes: `trial`, `block`, `experiment`
- per-metric override: `scopeByMetric.spawned|cleared|dropped|points`
- optional reset rules (`reset[]`):
  - `at: "block_start" | "block_end"`
  - target `scope: "block" | "experiment"`
  - optional metric subset (`metrics[]`)
  - optional conditions (`when.isPractice`, `when.phaseIn`, `when.labelIn`, `when.manipulationIdIn`)

Example pattern:
- show `cleared`/`dropped` per trial
- show `points` cumulative across experiment
- then reset only experiment points after practice blocks

## 6. Embedded task response reminders

Embedded Sternberg key reminders preserve whitespace so configs can separate left/right response labels horizontally in the conveyor overlay.

## 7. Trial start trigger

`experiment` supports click/space start trigger configuration:
- `startTrialsOn: "space" | "click"` (preferred)
- legacy aliases remain supported:
  - `startTrialsOnSpace: true` -> `"space"`
  - `startTrialsOnClick: true` -> `"click"`
- click-start button styling can be set in `experiment.startOverlay.buttonStyle` (same style fields as core continue buttons).
- click-start overlays can be dismissed by clicking the button, pressing `Enter`, or pressing `ArrowRight`; this mirrors core continue-screen activation for keyboard-first flows.

## 8. Pixi stimulus PNG capture (instructions assets)

Use the capture script to export brick stimuli exactly as rendered by the Bricks Pixi runtime.

Command:

```bash
npm run render:stimuli -w @experiments/task-bricks -- \
  --styles present,crate,target_present \
  --mode brick \
  --output-dir apps/web/public/assets/bricks-stimuli
```

Notes:
- `--mode brick` exports a crop around the brick (default), `--mode scene` exports the full canvas scene.
- Script starts `@experiments/web` dev server automatically if needed.
- Output filenames are `<style>.<mode>.png` (for example `present.brick.png`).
