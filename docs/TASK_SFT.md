# Task: SFT (DotsExp) Implementation & Config

This document describes the current SFT adapter at `tasks/sft/src/index.ts`.

## 1. Implementation Details

The SFT task is implemented using the `createTaskAdapter` factory:

```typescript
export const sftAdapter = createTaskAdapter({
  manifest: { taskId: "sft", ... },
  run: runSftTask,
  terminate: async () => { sftEnvironment.cleanup(); },
});
```

- **`run(context)`**: Parses configuration, runs optional QUEST+ staircase calibration, then executes main trials via `TaskOrchestrator`.
- **`terminate()`**: Calls `sftEnvironment.cleanup()` (a `TaskEnvironmentGuard`) to reset the cursor and remove keyboard scroll blockers.

## 2. Runner behavior

SFT currently runs `jspsych` via the `LifecycleManager`.

## 2. Config schema currently parsed

Top-level sections consumed:
- `task`
- `instructions`
- `design`
- `timing`
- `display`
- `responses`
- `stimulus`
- `staircase`
- `feedback`

### 2.1 `task`

- `title`
- `instructions` (legacy intro fallback)

Note:
- SFT now uses shared instruction-slot parsing from `instructions`:
  - intro: `pages|introPages|intro|screens`
  - pre-block: `preBlockPages|beforeBlockPages|beforeBlockScreens`
  - post-block: `postBlockPages|afterBlockPages|afterBlockScreens`
  - end: `endPages|outroPages|end|outro`
- `task.instructions` remains a fallback default intro page.
- SFT now supports `instructions.blockSummary` (core-level) for block-end computed summary cards.
- SFT also supports:
  - `instructions.blockIntroTemplate` (default `"Rule: {blockRule}. Trials: {nTrials}."`)
  - `instructions.showBlockLabel` (default `true`)
  - `instructions.preBlockBeforeBlockIntro` (default `false`)

### 2.2 `design`

Required:
- `design.manipulations[]`
- `design.blocks[]`

Manipulation parsing supports:
- `id`
- `rule` (`OR|AND|XOR|ID|MIXED`)
- optional `trialPlan.variants[]` or `trial_plan.variants[]`
- optional `trialPlan.schedule` or `trial_plan.schedule`

`MIXED` without explicit variants expands into OR/AND/XOR variants.

Block parsing supports:
- `id` or `block_id`
- `label`
- `nTrials` or `n_trials`
- `manipulation` (single id)
- `manipulations` (must resolve to exactly one final id for SFT)
- `manipulationPool` (draws from `design.manipulationPools`)
- `feedback` (per-block feedback override)
- `beforeBlockScreens` (optional string or string[]; extra continue screens before block trials)
- `afterBlockScreens` (optional string or string[]; extra continue screens after block-end summary)

Legacy aliases still accepted:
- `preBlockInstructions` -> `beforeBlockScreens`
- `postBlockInstructions` -> `afterBlockScreens`

Optional:
- `design.manipulationPools`:
  - `poolId: [ ["manipA"], ["manipB"], ... ]` or bundles
  - each block using `manipulationPool` draws participant-seeded without replacement

Variant-level trial plan fields:
- `trialPlan/trial_plan.variants[].id`
- `trialPlan/trial_plan.variants[].rule`
- `trialPlan/trial_plan.variants[].weight`
- `trialPlan/trial_plan.variants[].trial_pool`
- `trialPlan/trial_plan.variants[].trial_pool_schedule`
- `trialPlan/trial_plan.variants[].layout`
- `trialPlan/trial_plan.variants[].show_rule_cue`
- `trialPlan/trial_plan.variants[].rule_cue_label`

Schedule modes (`trial_plan.schedule` and `trial_pool_schedule`) are powered by core `buildScheduledItems`:
- `weighted` (default)
- `sequence`
- `quota_shuffle` (and alias `block_quota_shuffle`)
- optional `withoutReplacement` / `without_replacement`

### 2.3 `timing`

- `timing.fixation_truncexp.mean` (default `500`)
- `timing.blank_ms` (default `66`)
- `timing.stimulus_ms` (default `100`)
- `timing.response_deadline_ms` (default `3000`)
- `timing.response_terminates_trial` (default `true`)

### 2.4 `display`

- `aperture_px` (default `250`)
- `dot_offset_px` (default `44`)
- `dot_radius_px` (default `7`)
- `canvas_background` (default `#000000`)
- `canvas_border` (default `2px solid #444`)
- `cue_color` (default `#0f172a`)
- `dot_positions_mode` (fallback layout source for variants when unspecified)

### 2.5 `responses`

Key mappings:
- `keys.OR.yes`, `keys.OR.no`
- `keys.AND.yes`, `keys.AND.no`
- `keys.XOR.yes`, `keys.XOR.no`
- `keys.ID.AB`, `keys.ID.AN`, `keys.ID.NB`, `keys.ID.NN`

### 2.6 `stimulus`

- `salience_levels.high/low`
- `condition_codes[]`

### 2.7 `staircase`

If enabled:
- runs QUEST+ calibration phase
- updates global low/high salience for subsequent main trials

Parsed fields:
- `enabled`
- `n_trials`
- `stim_db_min`, `stim_db_max`, `stim_db_step`
- `slope_samples`, `lapse_samples`, `guess_rate`
- `low_scale`, `high_scale`
- `clamp_luminance`

### 2.8 `feedback`

SFT uses the shared core feedback module.

Global and per-block feedback config supports:
- `enabled`
- `durationMs` / `duration_ms`
- `messages.correct|incorrect|timeout|invalid`
- `messages.byResponseCategory` / `messages.by_response_category`
- `style.correctColor|incorrectColor|timeoutColor|invalidColor` (snake_case accepted)
- `style.byResponseCategoryColors` / `style.by_response_category_colors`
- `style.fontSizePx|fontWeight|canvasBackground|canvasBorder` (snake_case accepted)

## 3. Rendering and response flow

Each trial timeline can include:
- fixation
- blank
- response window (jsPsych keyboard response)
- optional post-stimulus hold phase

Key handling:
- allowed keys are mapped with `toJsPsychChoices`
- jsPsych responses are normalized with `normalizeKey`

Main trials are scored through `evaluateTrialOutcome`.

## 4. Final payload contract

SFT session finalization is handled internally by `TaskOrchestrator` (via the core data sink and JATOS submission pipeline). Task adapters do not call `finalizeTaskRun` directly.

CSV export uses the suffix `sft_trials`.

The session payload includes:
- `records`: main-trial rows with participant/block/trial metadata, `rule`, `layout`, `stimCode`, channels, stimulus category, expected/observed response categories and keys, RT and correctness.
- `staircaseRecords`: staircase-phase calibration rows (when staircase is enabled).
- `events`: lifecycle event log (`task_start`, `block_start`, `block_end`, `task_end`).

## 5. Quick composition recipes

### 5.1 Define two trial types and mix within each block

```json
{
  "design": {
    "manipulations": [
      {
        "id": "logic_mix",
        "trial_plan": {
          "schedule": { "mode": "quota_shuffle" },
          "variants": [
            {
              "id": "or_dense",
              "rule": "OR",
              "weight": 2,
              "trial_pool": ["HH", "Hx", "xH"],
              "trial_pool_schedule": { "mode": "quota_shuffle" }
            },
            {
              "id": "and_sparse",
              "rule": "AND",
              "weight": 1,
              "trial_pool": ["LL", "Lx", "xL"],
              "trial_pool_schedule": { "mode": "sequence", "sequence": ["LL", "Lx", "xL"] }
            }
          ]
        }
      }
    ],
    "blocks": [
      { "id": "B1", "label": "Mix 1", "nTrials": 24, "manipulation": "logic_mix" },
      { "id": "B2", "label": "Mix 2", "nTrials": 24, "manipulation": "logic_mix" }
    ]
  }
}
```

### 5.2 Quickly alternate manipulations across blocks

```json
{
  "design": {
    "manipulations": [
      { "id": "or_only", "rule": "OR" },
      { "id": "xor_only", "rule": "XOR" }
    ],
    "manipulationPools": {
      "alt_or_xor": [["or_only"], ["xor_only"]]
    },
    "blocks": [
      { "id": "B1", "nTrials": 20, "manipulationPool": "alt_or_xor" },
      { "id": "B2", "nTrials": 20, "manipulationPool": "alt_or_xor" }
    ]
  }
}
```

Notes:
- SFT currently requires each block to resolve to exactly one manipulation id.
- Use `trial_plan.variants` for within-block trial-type mixing, and `manipulationPool` for across-block assignment.
