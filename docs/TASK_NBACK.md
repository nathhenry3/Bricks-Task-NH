# Task: NBack (N-Back)

This document describes the unified `tasks/nback` implementation, which serves as the host for both standard N-Back and modular Prospective Memory (PM) experiments.

## 1. Implementation Overview

The NBack task is built on the core `TaskOrchestrator` and `createTaskAdapter` factory. It uses **jsPsych** as its primary runner.

- **Adapter Path:** `tasks/nback/src/index.ts`
- **Canonical PM Path:** NBack task + `task.modules.injector`

## 1.1 Variants

| Variant ID | Config Path | Description |
| :--- | :--- | :--- |
| `default` | `nback/default` | Standard N-Back |
| `drt_block_demo` | `nback/drt_block_demo` | N-Back with block-scoped DRT |
| `pm_module_demo` | `nback/pm_module_demo` | N-Back + PM injector demo |
| `pm_module_export_demo` | `nback/pm_module_export_demo` | PM injector with stimulus export |
| `annikaHons` | `nback/annikaHons` | Custom Honours study config |
| `nirvanaExp1` | `nback/nirvanaExp1` | Nirvana Experiment 1 config |
| `modern` | `nback/nirvanaExp1` | Legacy URL-compat entry pointing to `nirvanaExp1` config; kept so old `?variant=modern` links still resolve |

## 2. Configuration Schema

The task configuration is resolved through the core `VariableResolver`, allowing for dynamic participant-level and block-level overrides using the `$var`, `$sample`, and `$namespace` syntax.

### 2.1 Top-Level Configuration

| Field | Type | Description |
| :--- | :--- | :--- |
| `task.title` | string | Title shown on the task intro card. |
| `task.rtTask` | object | Global RT phase configuration (see [RT Task](#rt-task)). |
| `task.modules` | object | Active modules (e.g., `drt`, `injector`). |
| `mapping.targetKey` | string | Required. Key for N-Back matches (e.g., `"m"`). |
| `mapping.nonTargetKey`| string | Optional. Key for non-matches. If omitted or `"withhold"`, non-targets require no response. |
| `timing` | object | Legacy timing shortcuts (mapped to `rtTask` defaults). |
| `display` | object | Visual presentation settings (see [Display](#display)). |
| `plan` | object | Block structure and manipulation definitions (see [Plan](#plan)). |
| `stimuli` | object | Inline stimulus pools (category map). |
| `stimuliCsv` | object | CSV-based stimulus pool loader. |
| `stimulusPools` | object | Global draw mode settings (e.g., `nbackDraw`). |
| `variables` | object | Participant-scoped variable definitions. |
| `instructions` | object | Task-level instruction screens and templates (see [Instructions](#instructions)). |
| `feedback` | object | Global trial feedback settings (see [Feedback](#feedback)). |

### 2.2 RT Task (Timing & Response Policy)

Configured under `task.rtTask` (global) or `plan.blocks[].rtTask` (block override).

- `enabled`: boolean (default `false`). If `true`, uses the RT phase engine.
- `responseTerminatesTrial`: boolean (default `false`). If `true`, the trial ends immediately upon any valid response.
- `timing`:
  - `trialDurationMs`: Total trial length (default `5000`).
  - `fixationDurationMs`: Duration of the fixation cross (default `500`).
  - `stimulusOnsetMs`: Offset from trial start when stimulus appears (default `1000`).
  - `responseWindowStartMs`: When key logging begins (default `1000`).
  - `responseWindowEndMs`: When key logging ends (default `5000`).

### 2.3 Display Settings

Configured under the top-level `display` object.

- `aperturePx`: Width/Height of the square stimulus frame (default `250`).
- `paddingYPx`: Vertical padding within the frame (default `16`).
- `cueHeightPx`: Height reserved above the stimulus for a rule cue label (default `0`; set > 0 when using PM cue labels).
- `cueMarginBottomPx`: Margin between the cue area and the stimulus (default `0`).
- `frameBackground`: CSS color for the stimulus frame (default `"#ffffff"`).
- `frameBorder`: CSS border string for the frame (default `"2px solid #d1d5db"`).
- `textColor`: CSS color for text stimuli and fixation (default `"#111827"`).
- `fixationFontSizePx`: Font size for the `+` fixation (default `28`).
- `fixationFontWeight`: Font weight for the fixation cross (default `500`).
- `stimulusFontSizePx`: Font size for text stimuli (default `48`).
- `stimulusScale`: Multiplier for image/text size relative to frame (default `0.82`).
- `imageWidthPx` / `imageHeightPx`: Optional fixed dimensions for image stimuli.
- `imageUpscale`: boolean (default `false`). If `false`, images won't scale above native size.

### 2.4 Plan (Blocks & Manipulations)

The `plan` object defines the sequence of trials and condition assignments.

#### Block Fields (`plan.blocks[]`)
Each block can override global settings or use tokenized variables.

- `label`: String identifier for the block (used in output and intros).
- `phase`: `"practice"` or `"main"` (also sets `isPractice` if not specified explicitly).
- `isPractice`: boolean override for practice status.
- `nLevel`: The "N" in N-Back (e.g., `1`, `2`, `3`).
- `trials`: Total trials in the block (default `20` for practice, `54` for main).
- `targetCount`: Number of N-Back matches to insert (default `6` for practice, `18` for main).
- `lureCount`: Number of N-Back lures (near-matches at other lags) to insert (default `3` for practice, `18` for main).
- `nbackSourceCategories`: Array of stimulus categories to draw from for this block (default `["other"]`).
- `stimulusVariant`: Optional integer selecting a numbered stimulus variant (used with `imageAssets`).
- `manipulation` / `manipulations`: Manipulation IDs to apply.
- `variables`: Block-scoped variable overrides.
- `feedback`: Block-level feedback override.
- `rtTask`: Block-level timing override.
- `beforeBlockScreens` / `afterBlockScreens`: Array of instruction pages for this block.
- `repeatUntil`: Block-level retry criteria (e.g., `minAccuracy: 0.8`).
- `repeatAfterBlockScreens`: Pages shown if the `repeatUntil` check fails.

#### Manipulations (`plan.manipulations[]`)
Define reusable sets of overrides:
```json
{
  "id": "high_load",
  "overrides": {
    "nLevel": 3,
    "targetCount": 20,
    "rtTask": { "timing": { "trialDurationMs": 2000 } }
  }
}
```

### 2.5 Instructions & Screens

Configured under `instructions`.

- `introPages` (alias `pages`): Array of strings or page objects shown at task start.
- `blockIntroTemplate`: Template string for block start (e.g., `"This is a {nLevel}-back block."`).
- `preBlockPages` / `postBlockPages`: Screens shown before/after every block.
- `endPages`: Screens shown after all blocks are complete.
- `showBlockLabel`: boolean (default `true`).
- `preBlockBeforeBlockIntro`: boolean (default `false`).
- `skipBeforeBlockScreensOnRepeat`: boolean (default `false`); skips block-level `beforeBlockScreens` on retry attempts.
- `insertions`: Array of generic page insertions at specific lifecycle points.
- `blockSummary`: Configuration for a computed performance summary screen (see example below).

#### Block Summary Example
```json
"blockSummary": {
  "enabled": true,
  "at": "before_post",
  "title": "Block Feedback",
  "lines": [
    { "text": "Target accuracy: {accuracyPct}%", "where": { "trialType": ["N"] } },
    { "text": "Non-target accuracy: {accuracyPct}%", "where": { "trialType": ["F", "L*"] } }
  ],
  "when": { "isPractice": true }
}
```

## 3. Modular Integrations (PM, DRT, Injector)

NBack supports additive functionality via the `task.modules` system. These modules are task-independent and can be plugged into other adapters.

- [**Module: Detection Response Task (DRT)**](./MODULE_DRT.md): Concurrent detection task (ISO-standard).
- [**Module: Stimulus Injector**](./MODULE_INJECTOR.md): Low-level trial injection for custom PM and control trials.

NBack applies PM-like injections (`trialType: "PM"` or `responseCategory: "pm"`) in an early pass before target/lure sampling. Those PM trials are locked so later N-back target/lure placement will not use them as either source or target positions.

## 4. Stimulus Management

- **CSV Loading:** Use `stimuliCsv` to load large pools. Path templates like `{runtime.assetsBase}` are supported.
- **Pool Drawing:** `stimulusPools.nbackDraw` controls how filler items are drawn.
  - `mode`: `"without_replacement"`, `"with_replacement"`, or `"ordered"`.
  - `scope`: `"block"` or `"participant"`.
  - `shuffle`: boolean.
- **Image Assets:** If `imageAssets.enabled: true`, the task resolves item IDs to image file paths.
  - `imageAssets.basePath`: Base directory for image files.
  - `imageAssets.filenameTemplate`: Template string for filenames (default `"{id}"`). The `{id}` token is replaced with the item identifier.
  - `imageAssets.practiceVariant`: Integer variant number used for practice blocks (default `1`).
  - `imageAssets.mainVariants`: Array of integer variant numbers available for main blocks (default `[1]`).
  - `imageAssets.mainMode`: How main variants are selected — `"with_replacement"` (random, default) or `"cycle"` (sequential cycle through `mainVariants`).

### N-Back Rule (`nbackRule`)

Controls how targets and lures are inserted into the trial sequence.

- `nbackRule.lureLagPasses`: Array of lag arrays defining which non-target lags count as lures. Each entry is one injection pass. Default produces standard N±1 lures.
  - Example: `[[1], [2]]` — first inject 1-back lures, then 2-back lures.
- `nbackRule.maxInsertionAttempts`: Maximum retries used for target insertion attempts within one generated block (default `10`).

## 5. Output Data

The NBack task produces a consolidated CSV/JSON payload with suffix `nback_trials`.

- **Trial Records:** Every N-Back, PM, and Injector trial is exported as a primary row.
- **Fields:** `trialType` (`N`, `F`, `PM`, `L<lag>`), `correctResponse`, `responseKey`, `responseRtMs`, `responseCorrect`, etc.
- **Module Results:** Detailed DRT and injector module outputs (e.g., transform estimates, raw module logs) are included in the `moduleResults` object in the final JSON payload.
- **Raw jsPsych Rows (optional):** Full `jsPsychData` is excluded by default to keep JATOS payloads compact. Enable it only when needed with `data.includeJsPsychData: true` (or `task.includeJsPsychData: true`).

## 6. Stimulus Export Mode

To export the planned stimulus list without running the task, launch with the URL parameter:
`?task=nback&variant=<id>&exportStimuli=true`

This saves a CSV with the planned sequence, including `block_type`, `trial_type`, and `item` identifiers.
