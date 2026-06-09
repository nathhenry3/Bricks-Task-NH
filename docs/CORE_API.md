# Core Framework API Reference

This reference tracks current exported behavior of `@experiments/core` in this repo.

## 1. Task Lifecycle and Adapters

The framework uses a standardized adapter pattern to manage the execution of diverse experimental tasks.

### `TaskAdapter` (Interface)

All task adapters must implement this interface to be compatible with the unified shell and core lifecycle.

- `readonly manifest: TaskManifest`: Metadata about the task (ID, label, available variants).
- `initialize(context: TaskAdapterContext): Promise<void>`: (Optional) Called to set up the task, parse configuration, and prepare resources.
- `execute(): Promise<unknown>`: (Optional) Called to run the main task logic. Should return the task results.
- `terminate(): Promise<void>`: (Optional) Called after execution (success or failure) to clean up resources like global listeners or timers.

### `createTaskAdapter(options)` (Factory)

Preferred way to define task adapters without per-task wrapper classes.

- `manifest: TaskManifest`: Task metadata.
- `run(context: TaskAdapterContext): Promise<unknown> | unknown`: Main task entrypoint.
- `initialize?(context)`: Optional setup hook.
- `terminate?(context)`: Optional cleanup hook.

The factory returns a `TaskAdapter` compatible with `LifecycleManager` and keeps task context management centralized in core.

### `TaskAdapterContext` (Interface)

Context provided to task adapters during initialization and execution.

- `container: HTMLElement`: The root element for the task UI.
- `selection: SelectionContext`: Metadata about the current task, variant, and participant.
- `coreConfig: CoreConfig`: The full core framework configuration.
- `taskConfig: JSONObject`: The task-specific configuration (automatically resolved at participant scope).
- `resolver: VariableResolver`: A pre-configured resolver for handling block and trial scoped variables.

### `LifecycleManager` (Class)

Orchestrates the execution of a `TaskAdapter`.

- `constructor(adapter: TaskAdapter)`
- `run(context: TaskAdapterContext): Promise<unknown>`: Executes the full lifecycle: `initialize` -> `execute` (or legacy `launch`) -> `terminate`.
- **Note:** `run()` automatically performs high-level variable resolution on `context.taskConfig` before calling `initialize`. Only `participant` scoped variables are resolved at this stage; `block` and `trial` scoped variables remain as tokens for the adapter to handle.

### `runCustomRtTrial(args): Promise<MultiPhaseTrialResult>`

A generalized RT trial runner that supports arbitrary phase sequences. Each phase can have a custom render function.

### `SpatialLayoutManager` (Class)

Provides utilities for generating non-overlapping spatial slots for stimuli.
- `generateSlots(args): Point[]`: Supports `"circular"`, `"grid"`, and `"random"` templates.

### `SceneRenderer` (Class)

Standardized canvas renderer for `SceneStimulus` models. Handles rendering of shapes and supports slot-based positioning.

### `diffScenes(s1, s2): SceneDiff`

Utility to identify identity changes between two structured scenes.

## 2. Selection and configuration

### `ConfigurationManager` (Class)

Manages the loading, merging, and validation of experiment configurations.

- `load(path: string): Promise<JSONObject>`: Fetches and parses a JSON config file.
- `merge(base, taskDefault, variantOverride, runtimeOverride?): JSONObject`: Sequentially deep-merges configuration levels.
- `resolve(config: JSONObject, resolver: VariableResolver): JSONObject`: Recursively resolves variable tokens in the configuration using the provided resolver.

### `resolveSelection(coreConfig: CoreConfig): SelectionContext`

Resolves task/variant/configPath/overrides/participant metadata from URL + JATOS.

When running under JATOS, URL-style parameters are resolved from:
1. `window.location.search` (if present)
2. `jatos.urlQueryParameters` (fallback, preserves launch params across Publix redirects)

Task/variant precedence:
1. JATOS (`taskId`, `variantId`)
2. URL (`task`, `variant`)
3. `coreConfig.selection`

JATOS config-path precedence:
1. JATOS component input `config`
2. JATOS component input aliases `configID` / `configId`
3. URL `config`

Overrides precedence:
1. JATOS `overrides`
2. URL `overrides`

Accepted URL keys:
- `task`, `variant`, `config`, `overrides`, `cc`
- participant keys: `PROLIFIC_PID`, `STUDY_ID`, `SESSION_ID`, `SONA_ID`, `participant`, `survey_code`
- `participantId` is the canonical participant identifier after resolution; `sonaId` is only populated from the raw `SONA_ID` parameter when present
- auto-responder toggle: `auto`
- auto-responder jsPsych mode: `auto_mode` (`visual` or `data-only`)

### `resolveSelectionWithJatosRetry(coreConfig, maxWaitMs?): Promise<SelectionContext>`

Retries selection resolution for JATOS launches where selection payloads may arrive slightly after app boot.
- Default max wait: `10000ms`
- Stops early when JATOS selection becomes available
- Skips retry when URL already provides `task`

### `loadJatosScriptCandidates(candidates?): Promise<{ loaded, loadedFrom, attempts }>`

Attempts to load JATOS runtime script from a candidate list (in order), returning:
- `loaded`: whether a candidate succeeded
- `loadedFrom`: source URL used when loaded
- `attempts`: all attempted candidate URLs

### `waitForJatosReady(timeoutMs?): Promise<void>`

Waits for JATOS readiness via `jatos.onLoad(...)` when available, with polling fallback for
`componentJsonInput` / `studySessionData`.

### `resolveRuntimePath(path: string): string`

Normalizes relative-vs-absolute launch paths for local/dev and JATOS:
- preserves absolute URLs (`https://...`, `data:...`, etc.)
- rewrites leading-slash app paths to component-relative paths under JATOS
- keeps local paths local-friendly outside JATOS

Runtime path tokens supported by templated stimulus/config helpers:
- `{runtime.assetsBase}`
- `{runtime.configsBase}`

### `ensureEegBridgeReady(coreConfig, taskConfig?): Promise<void>`

Performs optional EEG bridge preflight:
- resolves effective EEG config from `coreConfig.eeg` + `taskConfig.eeg`
- if `enabled=true` and `requireBridge=true`, checks `{bridgeUrl}/health`
- throws on failure (caller can block experiment launch)

### `resolveEegBridgeConfig(coreConfig, taskConfig?): ResolvedEegBridgeConfig`

Resolves effective EEG bridge settings (`enabled`, `bridgeUrl`, `requireBridge`, event forwarding controls).

### `buildMergedConfig(base, taskDefault, variantOverride, runtimeOverride?)`

Deep merge order:
1. `base`
2. `taskDefault`
3. `variantOverride`
4. `runtimeOverride`

### `loadJsonFile(path: string): Promise<JSONObject>`

Fetches JSON and enforces object-only payload.

## 3. Experiment orchestration

### `runPromptScreens(container, screens): Promise<void>`

Renders each prompt and waits for continue (`button click` or `space`).

### `runBlockTrialLoop(args): Promise<BlockTrialLoopResult>`

Handles block envelopes and trial iteration.

Key behavior:
- Uses `getTrials(block)` when provided, else `block.trials`.
- `renderBlockStart`/`renderBlockEnd` returning non-null HTML triggers continue gates.
- Cursor policy is configurable:
  - default hides cursor during each trial
  - set `hideCursorDuringTrial: false` (or function) for mouse-first tasks.

### `runTrialTimeline(args): Promise<TrialTimelineResult>`

Linear timed stage runner with optional timed response capture.

Returns:
- `key`, `rtMs`
- `totalDurationMs`
- `stageTimings[]`

## 4. UI, keyboard, and jsPsych bridge helpers

### `normalizeKey(key): string`

Lowercases and normalizes `" " | "spacebar" | "space"` -> `"space"`.

### `captureTimedResponse(args): Promise<TimedResponse>`

Captures first valid key in `[startMs, endMs]` window over `totalDurationMs`.

### `waitForContinue(container, html, options?): Promise<void>`

Displays HTML screen with continue button and `space`, `Enter`, or `ArrowRight` keyboard shortcuts.

### `toJsPsychKey(key): string`

Maps canonical keys to jsPsych choices (`"space"` -> `" "`).

### `toJsPsychChoices(keys): string[]`

Maps and deduplicates keys for jsPsych plugin `choices`.

### `resolveJsPsychContentHost(container): HTMLElement`

Returns `.jspsych-content` host if present, else container.

### `pushJsPsychContinueScreen(...)`

Pushes a jsPsych call-function timeline node that renders a continue screen through core `waitForContinue`.

### `shouldHideCursorForPhase(phase: unknown): boolean`

Returns `true` when the given phase label indicates a trial execution phase where the cursor should be hidden (matches `fixation`, `blank`, `stimulus`, `response`, or `feedback`). Safe to call inside jsPsych `on_trial_start` callbacks — never applies during instruction or continue screens.

### `extractJsPsychTrialResponse(data: Record<string, unknown>): { key: string | null; rtMs: number | null }`

Normalizes the `response` and `rt` fields from a jsPsych trial data object into canonical form. Returns `null` for each field when the raw value is absent or non-finite.

### `TaskEnvironmentGuard` (Class)

Encapsulates environment cleanup for tasks that install keyboard/scroll blockers or hide the cursor. Replaces the pattern of storing disposer references as module-level variables.

- `installKeyScrollBlocker(allowedKeys: string[]): void` — installs a key scroll blocker and registers its disposer.
- `installPageScrollLock(): void` — locks page scroll and registers its disposer.
- `addDisposer(fn: () => void): void` — registers an arbitrary cleanup function.
- `cleanup(): void` — shows the cursor (`setCursorHidden(false)`) and runs all registered disposers.

Typical usage:

```typescript
const taskEnvironment = new TaskEnvironmentGuard();
// in onTaskStart:
taskEnvironment.installKeyScrollBlocker(allowedKeys);
// in terminate:
taskEnvironment.cleanup();
```

### `resolvePageBackground({ coreConfig?, taskConfig? }): string | null`

Resolves outer shell background with precedence:
1. `taskConfig.ui.pageBackground`
2. `coreConfig.ui.pageBackground`
3. `null` (caller may use CSS default)

### `resolveInstructionPageSlots(instructions, defaults?): InstructionPageSlots`

Shared instruction-slot coercion used by task adapters.

Returned shape:
- `intro: string[]`
- `preBlock: string[]`
- `postBlock: string[]`
- `end: string[]`

Accepted intro aliases (first key present wins):
- `pages` (preferred)
- `introPages`
- `intro`
- `screens`

Accepted pre/post/end aliases:
- pre: `preBlockPages`, `beforeBlockPages`, `beforeBlockScreens`
- post: `postBlockPages`, `afterBlockPages`, `afterBlockScreens`
- end: `endPages`, `outroPages`, `end`, `outro`

Behavior note:
- If a chosen key is explicitly present but blank (for example `""` or `[""]`), the slot resolves to `[]` (intentional clear) and does not fall back to defaults.
- Blank entries inside arrays are ignored.

### `resolveWithVariables(value, resolver?, context?)`

Shared helper that applies variable expansion across nested arrays/objects via `resolver.resolveInValue(...)` when a resolver is provided.

Useful for config fields that may be arrays/objects containing tokens (for example `beforeBlockScreens: ["$between.preScreen"]`).

### `createDrtPresentationBridge(config, adapter): DrtPresentationBridge`

Mode-aware callback bridge for local renderer/audio DRT presentation without embedding renderer logic into core.

Returns:
- `hasVisualMode`
- `hasAuditoryMode`
- `hasBorderMode`
- `onStimStart(stimulus)`
- `onStimEnd(stimulus)`
- `onResponseHandled()`
- `hideAll()`

Typical usage:
- task-local DRT loop calls `onStimStart`/`onStimEnd` from engine/controller hooks
- task-local key handler calls `onResponseHandled` after a handled DRT response
- task cleanup calls `hideAll`

### Task Modules and Extensions

The framework supports modular extensions that can be attached to specific scopes (task, block, or trial).

#### `TaskModule` (Interface)

- `id: string`: Unique identifier for the module.
- `start(config, address, context): TaskModuleHandle`: Called when a scope starts.

#### `TaskModuleHandle` (Interface)

- `stop(): TResult`: Called when the scope ends.
- `step?(now: number)`: (Optional) Animation frame tick.
- `handleKey?(key, now)`: (Optional) Keyboard event handler.
- `getData?(): TResult`: (Optional) Snapshot current active module data.
- `controller?: unknown`: (Optional) Runtime controller exposed for advanced task integrations.

#### `TaskModuleRunner` (Class)

Manages the lifecycle of active modules.

- `constructor(modules?: TaskModule[])`
- `setOptions(options: { onEvent?: (event) => void })`
- `start({ module, address, config, context })`: Starts a new module instance at the specified address.
- `stop(address)`: Stops the module instance at the specified address and records the result.
- `stopAll()`: Stops all active modules.
- `getResults(): TaskModuleResult[]`: Returns all results from stopped modules.
- `getActiveData(criteria?)`: Returns live data snapshots from active modules.
- `getActiveHandle(criteria)`: Returns the active handle at an exact scope address.

### Shared task helpers

- `resolveScopedModuleConfig(raw, moduleId)`: read module overrides from either `modules.<id>` or `task.modules.<id>` with local precedence.
- `maybeExportStimulusRows({ context, rows, suffix })`: centralized `exportStimuliOnly` gate and export finalization path.
- `parseSurveyDefinitions(entries)`: parse mixed survey configs (preset or inline `questions[]`) into `SurveyDefinition[]`.
- `collectSurveyEntries(config, { arrayKey, singletonKey })`: collect survey candidate entries from `surveys` arrays/scoped arrays and optional singleton aliases.
- `runSurveySequence(container, surveys, buttonIdPrefix)`: run sequential surveys with standardized button id handling.
- `attachSurveyResults(record, surveys)`: attach survey run payloads onto a trial/result record.
- `findFirstSurveyScore(surveys, scoreKey)`: read first finite numeric score for a key across survey runs.
- `renderSimpleInstructionScreenHtml(ctx, options)`: simple standardized instruction renderer for intro append + optional block label behavior.
- `createInstructionRenderer(options)`: renderer factory for common task instruction patterns (intro append, block-label policy, optional summary-card section rendering, page resolver hook).
- `buildTaskInstructionConfig(args)`: build standardized task instruction config (`intro/pre/post/end`, block intro template, block label policy) from raw task instructions + defaults.
- `applyTaskInstructionConfig(taskConfig, instructions)`: apply standardized instruction config onto task instruction surfaces for orchestrator flows.

### DRT as a Task Module

The `DrtController` provides a static helper to use the DRT engine as a task module:

- `DrtController.asTaskModule(config)`: Returns a `TaskModule` instance configured for DRT.

### Canvas helpers

Common display helpers used by tasks:
- `computeCanvasFrameLayout`
- `drawCanvasTrialFrame`
- `drawCanvasFramedScene`
- `drawCanvasCenteredText`
- `drawCenteredCanvasMessage`
- `createScaledCanvasHost`
- `mountCanvasElement`
- `ensureJsPsychCanvasCentered`
- `renderCenteredNotice`

## 5. Scheduling and randomization

### `buildScheduledItems(args): T[]`

Supports:
- `weighted` (default)
- `sequence`
- `quota_shuffle`
- `block_quota_shuffle` (alias)

Schedule options include `withoutReplacement` and `without_replacement`.

### Manipulation planning helpers

Core also exports generic helpers used by task adapters for block-level manipulation assignment:
- `createManipulationOverrideMap(value)`:
  - converts `[{ id, overrides }]` into an id -> overrides map.
- `createManipulationPoolAllocator(value, seedParts)`:
  - creates a participant-seeded pool allocator from a config object like:
  - `{ "poolA": [ ["manipA"], ["manipB"] ] }`
- `resolveBlockManipulationIds(blockLike, allocator?)`:
  - resolves `manipulationPool`, `manipulation`, and `manipulations` into an ordered id list.
- `applyManipulationOverridesToBlock(blockLike, manipulationIds, overrideMap, errorContext)`:
  - deep-merges referenced manipulation overrides into a block object.

These are intentionally task-neutral primitives. Whether a task allows one manipulation per block vs multiple is controlled by the task adapter.

### RNG utilities

- `hashSeed(...parts): number`
- `createMulberry32(seed): () => number`
- `SeededRandom` (`next`, `int`, `shuffle`)

### Stimulus pool helpers

Core now exports task-neutral stimulus pool primitives:

- Source loading:
  - `coerceCsvStimulusConfig(value)`
  - `loadCategorizedStimulusPools({ inlinePools, csvConfig, resolver?, context? })`
  - `loadTokenPool({ inline?, csv?, normalize?, dedupe? })`
- Draw planning:
  - `collectPoolCandidates(pools, categories, excludedCategories?)`
  - `createPoolDrawer(candidates, rng, drawConfig?)`
  - `createCategoryPoolDrawer(pools, categories, rng, options?)`
- Config coercion:
  - `coercePoolDrawConfig(value, defaults?)`
  - `coerceCategoryDrawConfig(value, defaults?)`

Supported draw modes:
- `ordered` (source order, loops)
- `with_replacement` (independent random draw)
- `without_replacement` (shuffle/consume/recycle)
- category drawers also support `round_robin`

These helpers are used by PM/NBack for participant-seeded deterministic pool behavior.

### Prospective memory helpers

Core now exports additive PM utilities in `prospectiveMemory.ts`:
- `generateProspectiveMemoryPositions(rng, { count, minSeparation, maxSeparation })`
- `resolveProspectiveMemoryCueMatch(context, rules)`

Cue-rule primitives support:
- `category_in`
- `text_starts_with`
- `stimulus_color`
- `flag_equals`

## Keyboard Arbitration Policy

Current shared policy for concurrent keyboard modules (primary task + DRT):
1. Primary task keys remain task-owned and are handled in task runtime order.
2. DRT uses controller-level capture listeners and only consumes configured DRT response key.
3. DRT ignores repeated `keydown` events for its response key until a `keyup` is observed.
4. If keys overlap by configuration, overlap is allowed and task adapters must explicitly prevent default/propagation where needed.
5. Recommended practice is non-overlapping key maps per task/module pair.

## 6. Staircase API

### `QuestBinaryStaircase`

Methods:
- `nextStimulus()`
- `update(response: 0 | 1)`
- `estimateMode()`
- `exportPosterior()`

Helpers:
- `buildLinearRange`
- `luminanceToDb`
- `dbToLuminance`

## 7. Data and lifecycle

### `recordsToCsv(records)`

Converts object rows to CSV with escaping.
- primitive cells are written directly
- object/array cells are JSON-serialized (instead of `[object Object]`)

### `finalizeTaskRun(args): Promise<{ submittedToJatos: boolean; redirected: boolean }>`

> **Note:** Task adapters do not call `finalizeTaskRun` directly. It is invoked internally by `TaskOrchestrator` as part of the session completion flow. This function is documented here for core reference only.

Behavior:
1. Local save when `coreConfig.data.localSave !== false`, using `coreConfig.data.localSaveFormat`:
   - default: `"csv"` (CSV only)
   - `"json"`: JSON only
   - `"both"`: CSV + JSON
   CSV uses explicit `args.csv.contents` when provided, else inferred tabular rows from payload where possible.
   Optional `args.extraCsvs` allows downloading additional CSV files in the same finalize pass.
2. Submit to JATOS when available.
   - When a core data sink handles JATOS incrementally, finalization does not overwrite streamed result data with a second full-payload submit.
3. `endStudy()` unless `endJatosOnSubmit === false`.
4. Resolve and apply redirect template if enabled.

### Core Data Sinks

`TaskOrchestrator` can emit task/session data through a core-level `TaskDataSink`.

- Default behavior now installs a JATOS JSON-lines sink when JATOS is available.
- Session lifecycle events and trial results are emitted incrementally as envelopes.
- Local CSV/JSON save remains available for testing and debugging.
- Task adapters should not implement JATOS submission directly.

### TaskOrchestrator Instruction Defaults

`TaskOrchestrator.run(args)` now auto-derives instruction UI from config unless explicitly overridden:
- task-level pages: `instructions.introPages`, `instructions.endPages`
- block-level defaults: `instructions.preBlockPages`, `instructions.postBlockPages`
- block intro template: `instructions.blockIntroTemplate`
- block flags: `instructions.showBlockLabel`, `instructions.preBlockBeforeBlockIntro`
- repeat behavior flag: `instructions.skipBeforeBlockScreensOnRepeat` (skip block-level `beforeBlockScreens` on retry attempts)
- block page merging: global pre/post pages are merged with `block.beforeBlockScreens` / `block.afterBlockScreens`

For adapters that parse/normalize instructions before orchestration, use `args.instructionDefaults` to provide the same surfaces once (instead of manually wiring `introPages`, `endPages`, and `getBlockUi` per task).

To avoid per-task orchestrator wiring, core also exposes:
- `applyResolvedTaskInstructionSurfaces(taskConfig, surfaces)`

This hydrates normalized instruction surfaces back onto `taskConfig.instructions`, so `TaskOrchestrator` can consume them without adapter-level `instructionDefaults`.

### TaskOrchestrator Staircase Phase

`TaskOrchestrator.run(args)` supports a standardized pre-main staircase phase:

- `args.staircase.run`: async callback executed after intro flow and before block/session execution
- `args.staircase.enabled` (optional): explicit enable/disable override
- if `args.staircase.enabled` is omitted, orchestrator runs staircase only when `taskConfig.staircase.enabled === true`

This keeps staircase as a core lifecycle slot (instead of task-specific intro hooks), so any task can use the same orchestration surface.

### TaskOrchestrator Module Auto-Start Filter

`TaskOrchestrator.run(args)` supports:
- `args.shouldAutoStartModule(ctx)`
- `args.resolveModuleContext(ctx)`

This predicate is evaluated for each configured task module at block/trial scope before `startScopedModules` is invoked. It enables selective opt-out of orchestrator auto-start for specific modules without task-level raw config mutation.

Module config resolution is now layered centrally:
1. `rawTaskConfig.task.modules` (task-level baseline)
2. `block.modules` / `block.task.modules` (block-level override)
3. `trial.modules` / `trial.task.modules` (trial-level override)

Merging is deep and scope-aware (`config.scope` still determines whether a module starts at block or trial boundaries).

## 8. Events, outcomes, feedback

### `createEventLogger(selection)`

Provides `.emit(eventType, eventData?, meta?)` and accumulated `.events`.

### DRT runtime

- `DrtEngine`: pure timing/scoring engine for DRT probes (`presented/hit/miss/false_alarm`, event log export).
- `DrtController`: browser runtime wrapper over `DrtEngine` with:
  - scoped `start()`/`stop()`
  - keyboard listener lifecycle
  - `requestAnimationFrame` stepping
  - sampler-based ISI generation via shared core `createSampler` specs.
  - independent probe `displayDurationMs` and `responseWindowMs`
  - `responseTerminatesStimulus` control
  - optional online parameter transforms (`parameterTransforms`) that consume `drt_response` events and emit per-update estimates via `onTransformEstimate`.
  - transform persistence control (`transformPersistence`):
    - `"scope"`: reset transform state at each DRT scope boundary (default)
    - `"session"`: persist transform state across all DRT scopes within one task run/session
  - row-level export linking each `drt_response` to transform output (`exportResponseRows()`), including:
    - `estimate`: primary estimate object for the response (or `null`)
    - `transformColumns`: flattened scalar columns for long-format analysis (`drift_rate`, `threshold`, `t0`, CI bounds, etc.)
    - `estimates`: full estimate list (kept for backward compatibility)
  - built-in presentation modes:
    - `visual` (default: top-center red square anchored to task display area when available; otherwise viewport)
    - `auditory` (WebAudio tone)
    - `border` (flash outline around target display element only; does not fall back to full-screen viewport border when target bounds are unavailable)

### Continuous tracking helpers

Core now exports reusable tracking primitives (`tracking.ts`):
- `TrackingMotionController`:
  - `waypoint` motion (sampled destinations + linear traversal)
  - `chaotic` motion (heading jitter + wall reflections)
- `TrackingBinSummarizer`:
  - accumulates per-window sample counts
  - stores `insideCount`, `outsideCount`, and boundary-distance moments for weighted aggregation
- geometry helpers:
  - `computeTrackingDistance(point, target)` for circle/square boundary distance with inside=0 convention.

### Online parameter transforms

- `OnlineParameterTransformRunner`: generic runtime for event-driven, online parameter estimation modules.
- `OnlineParameterTransform`: minimal interface (`observe`, `reset`, `exportState`) for reusable model adapters.
- Included first transform type: `wald_conjugate`:
  - Moving-window analytic shifted-Wald fit from RT observations.
  - Configurable priors (`mu0`, `precision0`, `kappa0`, `beta0`), window sizes, and credible interval bounds.
  - Non-decision-time (`t0`) supports:
    - `t0Mode: "mix"` (default): averages three robust estimators (method-of-moments, conservative min-RT fallback, and Gauss-Legendre MAP node selection over feasible `t0` values).
    - `t0Mode: "fixed"`: uses `t0` as constant milliseconds.
    - `t0Mode: "min_rt_multiplier"`: uses `t0 = t0Multiplier * minObservedRtMs`, where `minObservedRtMs` is tracked across all finite observed RTs for that transform instance (not just the moving fit window).
  - Drift posterior now uses the Gamma-Normal conjugate node moments directly (TMSA), replacing the earlier student-`t`-based approximation.
  - With `transformPersistence: "session"`, that min-RT tracking persists across DRT scope boundaries in a run; with `"scope"`, it resets each scope.
  - Optional trial-varying prior mean shift mode (`priorUpdate.mode: "shift_means"`) matching the provided R/Python pattern.
  - Transform configs are object entries in `parameterTransforms[]` (for example `{ "type": "wald_conjugate" }`), not string shorthands.

### `evaluateTrialOutcome(args): TrialOutcome`

Standardized correctness evaluation output used by task adapters.

### Trial feedback module

Core exports shared feedback helpers used by task adapters:
- `parseTrialFeedbackConfig(value, fallback, defaults?)`
- `resolveTrialFeedbackView({ feedback, responseCategory, correct, vars?, resolver?, resolverContext? })`
- `drawTrialFeedbackOnCanvas(ctx, layout, feedback, view)`

Supported feedback config fields:
- `enabled`
- `durationMs` / `duration_ms`
- `messages.correct|incorrect|timeout|invalid`
- `messages.byResponseCategory` / `messages.by_response_category`
- `style.correctColor|incorrectColor|timeoutColor|invalidColor` (snake_case variants also accepted)
- `style.byResponseCategoryColors` / `style.by_response_category_colors`
- `style.fontSizePx|fontWeight|canvasBackground|canvasBorder` (snake_case variants also accepted)

`resolveTrialFeedbackView` supports `{placeholder}` interpolation from `vars` and core variable resolver context.

## 9. Generic condition planning

### `enumerateConditionCells(factors): ConditionCell[]`

Builds full-factorial cells from named factors and levels.

### `buildConditionSequence(args): ConditionCell[]`

Builds an exact-quota condition sequence using full-factorial cells + optional weights + optional adjacency constraints:
- `maxRunLengthByFactor`
- `maxRunLengthByCell`
- `noImmediateRepeatFactors`

Useful for balanced block construction in any trial task.

## 10. Semantic indexing helpers

### `buildSemanticIndex(labelsToTerms, options?): Map<string, string>`

Creates normalized term -> label mappings from grouped vocabularies.

### `createSemanticResolver(indexLike, options?): SemanticResolver`

Resolver API for normalized semantic label lookup:
- `resolve(term): string | null`
- `has(term): boolean`

### CSV dictionary helpers

- `parseCsvDictionary(csvText, keyColumn, valueColumn, options?)`
- `loadCsvDictionary(spec)`
- `loadSemanticIndexFromCsvColumns(csvPath, keyColumn, labelColumns, args?)`
- `loadTokenListFromCsvColumn(path, column, args?)`

These support generic dictionary/lexicon ingestion from CSV-backed assets.

## 11. Response semantics

### `createResponseSemantics(categoryToKeys, options?): ResponseSemantics`

Creates a normalized key-to-category resolver for RT tasks where physical keys map to abstract response categories.

Capabilities:
- `allowedKeys(categories?)` for scoped key sets (for example block-specific key availability)
- `responseCategoryFromKey(key)` with built-in `timeout` and `invalid` categories
- `expectedCategoryFromKey(key, fallback?)` for key-coded expected responses
- `expectedCategoryFromSpec(spec, fallback?)` for expected responses that may be either:
  - a physical key (mapped to category), or
  - a category label directly (including omission categories like `timeout`)
- `keyForCategory(category)` to resolve canonical key output for a category

This is used by current tasks (PM, Stroop, SFT) to avoid task-local key classification logic.

## 12. Color token registry

### `createColorRegistry(tokenToColor, options?): ColorRegistry`

Creates a normalized token -> CSS color registry with validation and fallback support:
- `resolve(token): string | null`
- `has(token): boolean`
- `entries()`

### Helpers

- `normalizeColorToken(token)`

## 13. Task Hooks (Extension Hooks)

Core now exposes a generic extension hook runtime intended for cross-task overlays
(for example embedding an auxiliary N-back stream into another primary task).

### Registration and state

- `prepareTaskHooks(hooks, options?)`
  - filters disabled hooks (`enabled: false`)
  - resolves stable IDs
  - orders hooks by `priority` then declaration order
- `createHookStateStore(initial?)`
  - shared mutable state map for hook instances (`get`, `set`, `update`, `delete`, `entries`)

### Lifecycle and event channels

- `runTaskHookLifecycle(args)`
  - async lifecycle fanout for `task_start | task_end | block_start | block_end | trial_start | trial_end`
- `emitTaskHookEvent(args)`
  - async custom event fanout (`TaskHookEvent`) for task-specific signals
  - suitable for per-trial/per-stage side channels (audio onset, cursor stream ticks, etc.)

### Trial planning

- `applyTrialPlanHooks(trial, context, hooks?)`
- `applyTrialPlanHooks({ trial, context, hooks, state?, options? })`
- `applyTrialPlanHooksAsync(args)`

Hooks can transform trial plans and access shared hook state (`state`) plus per-hook IDs (`hookId`).
Sync API throws if a hook returns a Promise.

### Outcome evaluation

- `evaluateTrialOutcomeWithHooks(args)`
- `evaluateTrialOutcomeWithHooksAsync(args)`

Hooks can patch:
- inputs before evaluation (`beforeEvaluate`)
- output after evaluation (`afterEvaluate`)

Sync API throws if a hook returns a Promise.
Both APIs support `HookExecutionOptions`:
- `continueOnError` (default `false`)
- `onError(error, context)` callback

## 14. Reaction-time trial helpers

### `computeRtPhaseDurations(timing, options?): RtPhaseDurations`

Computes common RT phase durations from a timing config:
- fixation
- blank
- pre-response stimulus
- response window
- post-response stimulus

`options.responseTerminatesTrial` (default `false`) forces `postResponseStimulusMs` to `0`.

### `runBasicRtTrial(args): Promise<BasicRtTrialResult>`

Runs a generic single-trial RT lifecycle with:
- normalized timing decomposition
- shared response capture window
- user-provided render hooks for fixation/blank/stimulus
- optional `responseTerminatesTrial` phase shaping (for fixed-trial tasks keep this `false`)

### `resolveRtTaskConfig(options): ResolvedRtTaskConfig`

Resolves an RT task config from:
- a required `baseTiming`
- optional `override` object (`enabled`, `responseTerminatesTrial`, `timing.*`)
- default flags (`defaultEnabled`, `defaultResponseTerminatesTrial`)

Useful for task-level defaults.

### `mergeRtTaskConfig(base, override?): ResolvedRtTaskConfig`

Merges a partial override onto an already-resolved RT config.
Useful for per-block/per-condition overrides in plan-driven tasks.

## 15. Block summary helpers

### `coerceBlockSummaryConfig(value): BlockSummaryConfig | null`

Parses `instructions.blockSummary` into a normalized config.
Supports:
- `enabled`
- `at`: `before_post`/`after_post` (aliases for block-end insertion slots)
- `title`
- `lines`:
  - string or string[] (shared summary stats for all lines)
  - line object or line object[] with:
    - `text` (or `line` / `template`) template
    - optional `where` filters (field -> value or array; dotted paths supported; string values support `*` wildcard and `regex:` prefix)
    - optional `metrics` overrides (`correctField`, `rtField`, `metricField`)
- `when` filters (`blockIndex`, `blockLabel`, `blockType`, `isPractice`)
- `where` trial-result filters (field -> value or array of values; supports dotted paths, `*` wildcard strings, and `regex:` string patterns)
- `metrics.correctField`, `metrics.rtField` (supports dotted paths)

### `buildBlockSummaryModel(args): BlockSummaryModel | null`

Builds a computed block summary from block metadata and trial results.
Template variables include:
- `{blockLabel}`, `{blockIndex}`, `{blockIndex1}`, `{blockType}`, `{isPractice}`
- `{total}`, `{correct}`, `{incorrect}`, `{accuracyPct}`, `{meanRtMs}`, `{validRtCount}`
- `{blockSpawned}`, `{blockCleared}`, `{blockDropped}`, `{blockPoints}`
- `{experimentSpawned}`, `{experimentCleared}`, `{experimentDropped}`, `{experimentPoints}`

### `renderBlockSummaryCardHtml(model): string`

Renders a simple HTML card from a summary model for tasks that use custom `waitForContinue` screens.

### `computeBlockSummaryStats(args): { total, correct, accuracyPct, meanRtMs, validRtCount }`

Computes filtered summary stats from trial results using `where` + `metrics`.
Both `where` keys and metric field names can use dotted paths (for example `game.stats.cleared`).
Useful when non-UI control flow (for example, retry logic) should use the same scoring semantics as block summary screens.

## 16. Block repeat helpers

### `coerceBlockRepeatUntilConfig(value): BlockRepeatUntilConfig | null`

Parses a block-level `repeatUntil` object into normalized form.
Supports:
- `enabled`
- `maxAttempts`
- `minAccuracy` (0..1) and `minAccuracyPct` (0..100 alias)
- `minCorrect`, `minTotal`
- `maxMeanMetric`, `minMeanMetric` (mean absolute value of `metrics.metricField`)
- `where` trial-result filtering (supports dotted paths)
- `metrics.correctField`, `metrics.metricField` (supports dotted paths)

### `evaluateBlockRepeatUntil(args): BlockRepeatEvaluation`

Evaluates pass/repeat decisions for one block attempt from trial results.
Returns:
- `passed`
- `shouldRepeat`
- `reason` (`threshold_met`, `threshold_not_met`, `max_attempts_reached`, `disabled`)
- attempt-local `stats` (`total`, `correct`, `accuracy`, `meanMetric`)
