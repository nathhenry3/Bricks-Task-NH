# Bricks Isolation Plan

Goal: strip this repository down to a single-experiment workspace containing only the **bricks** task, its direct module dependencies (DRT, surveys, etc.), and the core framework infrastructure that bricks actually exercises. Everything else is deleted.

---

## Guiding principles

- Work phase by phase, committing after each phase so each step is independently reversible.
- Verify build + typecheck passes between phases.
- Core modules (DRT, surveys, staircase, manipulations, EEG bridge, JATOS, autoresponder, etc.) stay unless positively confirmed unused by bricks.
- When in doubt about a core engine, leave it in place — the cost of a dead file is lower than a broken build.

---

## Phase 1 — Delete non-bricks task packages

**What:** Remove the 13 task packages that are not bricks.

**Directories to delete entirely:**

```
tasks/nback/
tasks/sft/
tasks/stroop/
tasks/flanker/
tasks/go_no_go/
tasks/change_detection/
tasks/rdk/
tasks/tracking/
tasks/matb/
tasks/matb-comms/
tasks/matb-tracking/
tasks/matb-resman/
tasks/matb-sysmon/
```

**Command:**
```bash
rm -rf tasks/nback tasks/sft tasks/stroop tasks/flanker tasks/go_no_go \
       tasks/change_detection tasks/rdk tasks/tracking \
       tasks/matb tasks/matb-comms tasks/matb-tracking \
       tasks/matb-resman tasks/matb-sysmon
```

**Verify:** `ls tasks/` should show only `bricks/`.

---

## Phase 2 — Update the app shell

### 2a. `apps/web/src/main.ts`

Remove all 13 non-bricks adapter imports (lines 22–35 minus the bricks line) and the corresponding entries in the `adapters` array (lines 49–63 minus the bricks entry).

**Before:**
```ts
import { sftAdapter } from "@experiments/task-sft";
import { nbackAdapter } from "@experiments/task-nback";
import { bricksAdapter } from "@experiments/task-bricks";
import { stroopAdapter } from "@experiments/task-stroop";
import { trackingAdapter } from "@experiments/task-tracking";
import { rdkAdapter } from "@experiments/task-rdk";
import { changeDetectionAdapter } from "@experiments/task-change-detection";
import { flankerAdapter } from "@experiments/task-flanker";
import { goNoGoAdapter } from "@experiments/task-go-no-go";
import { matbTrackingAdapter } from "@experiments/task-matb-tracking";
import { matbSysmonAdapter } from "@experiments/task-matb-sysmon";
import { matbResmanAdapter } from "@experiments/task-matb-resman";
import { matbCommsAdapter } from "@experiments/task-matb-comms";
import { matbAdapter } from "@experiments/task-matb";
```

**After:**
```ts
import { bricksAdapter } from "@experiments/task-bricks";
```

**Before (adapters array):**
```ts
const adapters: TaskAdapter[] = [
  sftAdapter,
  nbackAdapter,
  bricksAdapter,
  stroopAdapter,
  trackingAdapter,
  rdkAdapter,
  changeDetectionAdapter,
  flankerAdapter,
  goNoGoAdapter,
  matbTrackingAdapter,
  matbSysmonAdapter,
  matbResmanAdapter,
  matbCommsAdapter,
  matbAdapter,
];
```

**After:**
```ts
const adapters: TaskAdapter[] = [
  bricksAdapter,
];
```

Also remove `validateTaskConfigIsolation` usage if it is only there to guard against cross-task config bleed — it receives the full adapter list, and with a single adapter the function still works correctly, so keep the call as-is (it is harmless and guards mistyped config keys).

### 2b. `apps/web/src/appCoreConfig.ts`

Change the default `taskId` from `"sft"` to `"bricks"`.

```ts
selection: {
  taskId: "bricks",
},
```

### 2c. `apps/web/src/configResolution.test.ts`

This test file uses `nback` and `stroop` task IDs as fixtures. It tests config resolution logic, not the tasks themselves, so the test can be updated to use `bricks` variant names as fixtures, or deleted if it only tests paths that were specific to multi-task resolution. Review it and either rewrite the examples around bricks configs or delete the file.

**Verify:** `npm run typecheck` passes.

---

## Phase 3 — Remove non-bricks config directories

Config directories are auto-discovered by a glob in `apps/web/src/taskVariantConfigs.ts`. Removing the directories is sufficient — no code change needed.

**Directories to delete:**

```
configs/nback/
configs/sft/
configs/stroop/
configs/flanker/
configs/go_no_go/
configs/change_detection/
configs/rdk/
configs/tracking/
configs/matb/
configs/matb-comms/
configs/matb-tracking/
configs/matb-resman/
configs/matb-sysmon/
```

**Keep:**
```
configs/bricks/    (all 11 variant JSON files)
configs/core/      (default.json — framework defaults)
```

**Command:**
```bash
rm -rf configs/nback configs/sft configs/stroop configs/flanker configs/go_no_go \
       configs/change_detection configs/rdk configs/tracking \
       configs/matb configs/matb-comms configs/matb-tracking \
       configs/matb-resman configs/matb-sysmon
```

---

## Phase 4 — Remove non-bricks static assets

Located in `apps/web/public/assets/`. Three asset bundles belong to removed tasks.

**Directories to delete:**

```
apps/web/public/assets/matb-audio/
apps/web/public/assets/nback-pm-modern/
apps/web/public/assets/pm-words/
```

**Keep:**
```
apps/web/public/assets/bricks-stimuli/
apps/web/public/assets/evander-bricks/
```

**Command:**
```bash
rm -rf apps/web/public/assets/matb-audio \
       apps/web/public/assets/nback-pm-modern \
       apps/web/public/assets/pm-words
```

---

## Phase 5 — Remove non-bricks documentation

**Files to delete from `docs/`:**

```
docs/TASK_NBACK.md
docs/TASK_SFT.md
docs/TASK_STROOP.md
docs/TASK_FLANKER.md
docs/TASK_GO_NO_GO.md
docs/TASK_CHANGE_DETECTION.md
docs/TASK_RDK.md
docs/TASK_TRACKING.md
docs/TASK_MATB.md
```

**Keep:**
```
docs/README.md
docs/USER_GUIDE.md
docs/CORE_API.md
docs/CONFIGURATION_GUIDE.md
docs/EEG_WORKFLOW.md
docs/TASK_BRICKS.md
docs/MODULE_DRT.md
docs/MODULE_INJECTOR.md
docs/bricks-runtime-config-schema.md
```

After deletion, update `docs/README.md` to remove the index entries that pointed to the deleted files.

---

## Phase 6 — Remove non-bricks E2E tests

**File to delete:**
```
tests/matb.spec.ts
```

**Keep:**
```
tests/autoresponder.spec.ts    (task-agnostic bot simulation test)
```

**Note:** `playwright.config.ts` references no task names directly, so no changes there. After removing `matb.spec.ts`, run `npm run test:auto` and verify the remaining autoresponder spec still passes.

---

## Phase 7 — Prune unused core engines

This phase requires verification before deletion because the core barrel (`packages/core/src/index.ts`) re-exports everything and it is possible that bricks's runtime files import engines indirectly via the barrel. Run the grep checks listed for each engine before deleting.

### Engines positively unused by bricks

The following engines are not referenced anywhere in `tasks/bricks/` and serve only the deleted tasks. They are safe to remove.

#### `packages/core/src/engines/rtTask.ts`
Generic reaction-time trial runner for JsPsych-style tasks (nback, stroop, flanker, go_no_go, change_detection, sft).

Verify before deleting:
```bash
grep -r "rtTask\|RtTask\|createRtTask\|runRtTrial" tasks/bricks/
# Expected: no output
```

Delete `packages/core/src/engines/rtTask.ts` and remove its export line from `packages/core/src/index.ts`.

#### `packages/core/src/engines/jspsychRtTask.ts`
JsPsych integration layer (wraps JsPsych plugin lifecycle). Only used by JsPsych-based tasks.

Verify:
```bash
grep -r "jspsych\|JsPsych\|jsPsych" tasks/bricks/
# Expected: no output
```

Delete `packages/core/src/engines/jspsychRtTask.ts` and remove its export line from `packages/core/src/index.ts`.

#### `packages/core/src/engines/prospectiveMemory.ts`
Prospective memory module, used exclusively by nback.

Verify:
```bash
grep -r "prospectiveMemory\|ProspectiveMemory\|prospective_memory" tasks/bricks/
# Expected: no output
```

Delete `packages/core/src/engines/prospectiveMemory.ts` and remove its export line.

#### `packages/core/src/engines/tracking.ts`
Compensatory tracking task engine (canvas mouse-tracking loop). Used by the tracking and matb-tracking tasks.

Verify:
```bash
grep -r "tracking\b" tasks/bricks/ --include="*.ts" | grep -v "drtConfig\|drt_"
# Expected: no matches that reference the tracking engine
```

If no matches, delete `packages/core/src/engines/tracking.ts` and remove its export line.

#### `packages/core/src/engines/noise.ts`
Perlin/random noise generation — used by RDK and tracking. No known use in bricks.

Verify:
```bash
grep -r "noise\|Noise" tasks/bricks/
```

Delete if no matches. Remove export line.

#### `packages/core/src/engines/audio.ts`
Audio service abstraction — used by MATB comms. No use in bricks.

Verify:
```bash
grep -r "audio\|Audio" tasks/bricks/ --include="*.ts"
```

Delete if no matches. Remove export line.

### Engines to verify and potentially prune

These engines are less certain. Run the grep, review the output, and decide:

#### `packages/core/src/engines/scene.ts` and `sceneRenderer.ts`
Scene/canvas rendering abstraction. Bricks uses PixiJS directly via `renderer_pixi.ts`. However, confirm:

```bash
grep -r "scene\|Scene\|sceneRenderer\|SceneRenderer" tasks/bricks/
```

If no references: delete both files and remove their export lines.

#### `packages/core/src/engines/stimulusInjector.ts`
Injects extra stimuli into a running trial. Bricks's DRT is handled via `moduleRunner`, not this engine. Confirm:

```bash
grep -r "stimulusInjector\|StimulusInjector\|createInjector" tasks/bricks/
```

If no references: safe to delete.

#### `packages/core/src/engines/trial.ts` and `conditions.ts`
Generic trial envelope and condition-set helpers. Some core runtime code may import these.

```bash
grep -r "from.*engines/trial\|from.*engines/conditions" packages/core/src/
```

If only non-bricks tasks import them through their own task packages (not through core runtime), they can be removed. If core runtime uses them, keep them.

#### `packages/core/src/web/jspsychContinueFlow.ts` and `taskUiFlow.ts`
JsPsych-specific UI flow helpers.

```bash
grep -r "jspsychContinueFlow\|taskUiFlow\|JsPsychContinue" tasks/bricks/ packages/core/src/runtime/
```

If only referenced from deleted-task code paths and not from core runtime modules that bricks exercises: delete and remove export lines.

#### `packages/core/src/runtime/concurrentRunner.ts` and `scenarioScheduler.ts` and `dynamicScenarioSource.ts`
MATB-specific scenario scheduling infrastructure.

```bash
grep -r "concurrentRunner\|ConcurrentRunner\|scenarioScheduler\|ScenarioScheduler\|dynamicScenario" tasks/bricks/
```

If no references in bricks: delete and remove export lines.

#### `packages/core/src/runtime/blockRepeat.ts`
Block repetition control. Verify bricks config uses it:

```bash
grep -r "blockRepeat\|BlockRepeat\|repeatAfter" tasks/bricks/ configs/bricks/
```

If `repeatAfter` block screens are used in bricks configs, keep. If not, can be deleted.

### After each engine deletion

1. Remove the corresponding `export * from "./engines/<name>"` (or `./runtime/<name>`, `./web/<name>`) line in `packages/core/src/index.ts`.
2. Run `npm run typecheck` immediately. A failing typecheck means something in bricks or core runtime still references the deleted export.

---

## Phase 8 — Root package.json workspace cleanup

The root `package.json` workspaces glob `"tasks/*"` is still correct because only `tasks/bricks` remains. No change required.

However, review the root-level scripts for references to removed tasks:

- `eeg:bridge` — keep (task-agnostic EEG bridge)
- `eeg:session` — keep (session-level runner, task-agnostic)
- `autoresponder:url` — keep (used to test bricks autoresponder)
- `test:auto` — keep (now only runs `autoresponder.spec.ts`)

No changes needed to `package.json` unless a script explicitly names a non-bricks task.

---

## Phase 9 — Node modules and lockfile refresh

After all deletions, the workspace dependency graph has changed. Reinstall to remove orphaned packages:

```bash
npm install
```

Verify the lockfile changes are plausible (removed packages for deleted tasks, no unexpected additions). Then run a full build:

```bash
npm run build
npm run typecheck
```

---

## Phase 10 — Rename the workspace (optional)

The root `package.json` currently has `"name": "experiments-workspace"`. Rename it to reflect the single-experiment scope:

```json
"name": "bricks-workspace"
```

The `apps/web/package.json` name `@experiments/web` and `packages/core` name `@experiments/core` can remain as-is (internal package names don't need to match the experiment name), or be renamed to `@bricks/web` and `@bricks/core` if a clean break from the multi-experiment namespace is preferred. Note that renaming core requires a find-and-replace of all `@experiments/core` import paths, including in `tasks/bricks/src/*.ts`. This is a large but mechanical change.

---

## Execution order and commit strategy

| Step | Phase | Risk | Commit message |
|------|-------|------|----------------|
| 1 | Delete task packages | Low | `chore: remove non-bricks task packages` |
| 2 | Update app shell | Low | `chore: remove non-bricks adapters from web shell` |
| 3 | Remove configs | Low | `chore: remove non-bricks config directories` |
| 4 | Remove assets | Low | `chore: remove non-bricks static assets` |
| 5 | Remove docs | Low | `chore: remove non-bricks task documentation` |
| 6 | Remove E2E tests | Low | `chore: remove matb E2E test` |
| 7 | Prune core engines | Medium | `chore: remove unused core engines (rt, jspsych, pm, tracking, noise, audio)` |
| 8 | Verify & reinstall | — | — |
| 9 | Rename workspace | Low | `chore: rename workspace to bricks` |

Run `npm run typecheck` and `npm run build` after steps 2, 7, and 8 as mandatory checkpoints.

---

## What is explicitly kept

| Item | Reason |
|------|--------|
| `tasks/bricks/` | The experiment |
| `packages/core/` | Shared framework (with engine pruning per Phase 7) |
| `apps/web/` | Shell/bootstrap |
| `configs/bricks/` | All 11 variant configs |
| `configs/core/` | Framework defaults |
| `apps/web/public/assets/bricks-stimuli/` | Brick sprite assets |
| `apps/web/public/assets/evander-bricks/` | Character sprite assets |
| `docs/TASK_BRICKS.md` | Bricks-specific docs |
| `docs/MODULE_DRT.md` | DRT module (used by bricks) |
| `docs/MODULE_INJECTOR.md` | Stimulus injector docs |
| `docs/CORE_API.md`, `CONFIGURATION_GUIDE.md`, `EEG_WORKFLOW.md`, `USER_GUIDE.md` | Framework docs |
| `tests/autoresponder.spec.ts` | Autoresponder integration test |
| All scripts in `scripts/` | Task-agnostic utilities |
| `tasks/bricks/scripts/` | Bricks-specific utility scripts |

---

## Core modules confirmed needed by bricks

These core areas are actively used in `tasks/bricks/src/index.ts` or its runtime subdirectory and must remain:

- **DRT engine** (`engines/drt.ts`) — bricks imports `DrtController` and integrates DRT via `moduleRunner`
- **Staircase** (`engines/staircase.ts`) — bricks `difficulty_estimator.ts` uses the QUEST staircase
- **Surveys** (`web/surveys.ts`, `runtime/surveyPlan.ts`) — post-trial surveys
- **Orchestrator** (`runtime/orchestrator.ts`) — `TaskOrchestrator` is the main run loop
- **Task instructions** (`runtime/taskInstructions.ts`) — instruction screens
- **Module scopes** (`runtime/moduleScopes.ts`) — `resolveScopedModuleConfig`
- **Manipulations** (`infrastructure/manipulations.ts`) — block manipulation pool allocation
- **Sampling** (`infrastructure/sampling.ts`) — `buildScheduledItems`
- **Random** (`infrastructure/random.ts`) — `createMulberry32`, `hashSeed`
- **Variables** (`infrastructure/variables.ts`) — `resolveTemplatedString`
- **Data** (`infrastructure/data.ts`) — `recordsToCsv`
- **Deep merge** (`infrastructure/deepMerge.ts`) — `deepClone`, `deepMerge`
- **JATOS** (`infrastructure/jatos.ts`, `jatosBootstrap.ts`) — result submission
- **EEG bridge** (`infrastructure/eegBridge.ts`) — optional EEG integration
- **Autoresponder** (`runtime/autoresponder.ts`) — bot simulation for testing
- **Instruction flow** (`web/instructionFlow.ts`) — `createInstructionRenderer`
- **Coerce utils** (`utils/coerce.ts`) — `asObject`, `asArray`, `asString`
- **Config** (`infrastructure/config.ts`) — `ConfigurationManager`
- **Lifecycle** (`web/lifecycle.ts`) — `LifecycleManager`
- **Participant** (`infrastructure/participant.ts`) — participant tracking
- **Selection** (`infrastructure/selection.ts`) — task/session selection
- **Pools** (`infrastructure/pools.ts`) — manipulation pools
- **Stimulus export** (`runtime/stimulusExport.ts`, `web/stimulusExport.ts`) — export mode
- **Block summary** (`runtime/blockSummary.ts`) — end-of-block feedback
- **Gamepad** (`infrastructure/gamepad.ts`) — input handling
- **Parameter transforms** (`engines/parameterTransforms.ts`) — config value transforms
