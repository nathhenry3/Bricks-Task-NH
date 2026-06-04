# User Guide

This guide covers everything needed to install, run, configure, and deploy experiments from this repository.

## Prerequisites

- **Node.js** 18 or later
- **npm** 9 or later (ships with Node 18+)

No global dependencies beyond Node and npm are required.

---

## Installation

Clone the repository and install all workspace dependencies from the repo root:

```bash
git clone <repo-url>
cd Experiments
npm install
```

The workspace includes `packages/core`, `apps/web`, and all task packages under `tasks/*`. A single `npm install` at the root handles all of them.

---

## Running Locally

Start the Vite development server:

```bash
npm run dev
```

This serves the web shell at `http://localhost:5173`. Open a task by appending URL parameters:

```
http://localhost:5173/?task=nback&config=nback/default
```

### URL Parameters

| Parameter | Description | Example |
| :--- | :--- | :--- |
| `task` | Task ID | `nback`, `sft`, `bricks`, `stroop` |
| `variant` | Variant ID defined in the task adapter manifest | `default`, `pm_module_demo` |
| `config` | Override the variant config path (skips manifest lookup); supports `<task>/<file>` or bare `<file>` | `nback/nirvanaExp1`, `annikaHons` |
| `overrides` | URL-encoded JSON merged on top of the config | `%7B%22mapping%22%3A%7B%22targetKey%22%3A%22k%22%7D%7D` |
| `auto` | Enable auto-responder synthetic participant | `true`, `1` |
| `auto_mode` | jsPsych simulation mode | `visual`, `data-only` |
| `exportStimuli` | Export planned stimulus list without running | `true` |
| `PROLIFIC_PID` | Canonical participant ID used by exports, filenames, seeding, and redirects. Common aliases in SONA/JATOS launches are `SONA_ID` and `participant`. | `abc123` |
| `STUDY_ID` | Study ID (also `study_id`) | `study01` |
| `SESSION_ID` | Session ID (also `session_id`) | `session1` |

### Quick-launch examples

Prefer `?config=<taskId>/<file>` — it works for any bundled JSON without needing it registered in the task manifest. `?config=<file>` also works and resolves to `<taskId>/<file>` for the selected task. `?variant=<id>` is a shorter alias only for configs already listed in the task's `variants[]` manifest.

```
# NBack default
http://localhost:5173/?task=nback&config=nback/default

# NBack with PM injector demo
http://localhost:5173/?task=nback&config=nback/pm_module_demo

# Bricks spotlight
http://localhost:5173/?task=bricks&config=bricks/spotlight

# Stroop with auto-responder
http://localhost:5173/?task=stroop&config=stroop/default&auto=true

# SFT staircase example
http://localhost:5173/?task=sft&config=sft/staircase_example

# MATB default session
http://localhost:5173/?task=matb&config=matb/default

# Export NBack stimulus plan without running
http://localhost:5173/?task=nback&config=nback/default&exportStimuli=true
```

---

## Available Tasks and Variants

| Task ID | Variants | Description |
| :--- | :--- | :--- |
| `sft` | `default`, `staircase_example` | Signal-to-Fade (DotsExp) |
| `nback` | `default`, `pm_module_demo`, `drt_block_demo`, `pm_module_export_demo`, `nirvanaExp1`, `annikaHons` | N-Back with optional PM/DRT modules |
| `bricks` | `baseline`, `spotlight`, `evanderHons`, `Henry1`, `moray1991`, `continuousSpawn`, `pizza`, `drt_block_demo`, and more | Conveyor / Bricks task |
| `stroop` | `default`, `arbitrary_words`, `emotional_valence` | Stroop colour-word task |
| `tracking` | `default`, `drt_demo`, `mot_demo` | Continuous mouse-tracking / MOT |
| `change_detection` | `default` | Visual change detection |
| `flanker` | `default` | Eriksen Flanker |
| `go_no_go` | *(config-only, no bundled variants — supply your own)* | Go/No-Go |
| `rdk` | `default` | Random Dot Kinematogram |
| `matb` | `default`, `practice`, `low-load`, `high-load`, `basic`, `parasuraman-high`, `parasuraman-low`, `parasuraman-drt`, `parasuraman-drt-dynamic` | Multi-Attribute Task Battery |

---

## Creating and Editing Configurations

### Where configs live

All config files are JSON documents stored under `configs/`:

```
configs/
├── core/
│   └── default.json          # Global framework defaults
├── nback/
│   ├── default.json
│   └── pm_module_demo.json
├── bricks/
│   ├── baseline.json
│   └── spotlight.json
└── ...
```

**Config files are auto-discovered.** Any `.json` file you place under `configs/<taskId>/` is immediately available as a config path — no registration step required.

### Config merge order

When a task launches, configs are merged in this order (later entries win):

1. `{}` (empty base)
2. The selected variant config JSON (from `configs/<taskId>/<variantId>.json`)
3. Runtime overrides (from JATOS Component Input or URL `?overrides=...`)

The merge is a **deep merge**: overriding one nested key does not erase sibling keys.

### Creating a new variant

1. Copy an existing config in `configs/<taskId>/` as a starting point.
2. Edit the fields you want to change.
3. All JSON files under `configs/**/*.json` are bundled automatically at build time — no import needed.
4. Launch immediately using the explicit config path (bypasses the variant manifest):
   ```
   http://localhost:5173/?task=<taskId>&config=<taskId>/<yourFile>
   ```
5. To make it selectable by the shorter `?variant=<id>` URL parameter, register it in the task adapter manifest at `tasks/<taskId>/src/index.ts`:
   ```typescript
   variants: [
     { id: "my_variant", label: "My Variant", configPath: "<taskId>/my_variant" },
   ]
   ```
   This registration step is **only** required for `?variant=` access. `?config=` works without it.

### Using runtime overrides (no file changes)

Pass a URL-encoded JSON object as the `overrides` parameter:

```text
http://localhost:5173/?task=nback&config=nback/default&overrides=%7B%22plan%22%3A%7B%22blocks%22%3A%5B%7B%22trials%22%3A10%7D%5D%7D%7D
```

Or in JATOS Component JSON Input:
```json
{
  "overrides": {
    "mapping": { "targetKey": "k" }
  }
}
```

### Core config (`configs/core/default.json`)

Global defaults applied to every task:

| Field | Default | Description |
| :--- | :--- | :--- |
| `selection.taskId` | `"sft"` | Default task if none specified in URL |
| `selection.variantId` | `"default"` | Default variant |
| `participant.participantParamCandidates` | `["PROLIFIC_PID","SONA_ID","participant","survey_code"]` | URL/JATOS keys checked for the canonical participant ID (`participantId`) |
| `participant.studyParamCandidates` | `["STUDY_ID","study_id"]` | Keys for study ID |
| `participant.sessionParamCandidates` | `["SESSION_ID","session_id"]` | Keys for session ID |
| `completion.redirect.enabled` | `false` | Enable redirect on completion |
| `completion.redirect.completeUrlTemplate` | `""` | Redirect URL (supports `{participantId}`, `{PROLIFIC_PID}`, `{survey_code}`, etc.; `{participantId}` is the canonical ID used by the runtime) |
| `completion.redirect.incompleteUrlTemplate` | `""` | Redirect URL on incomplete exit |
| `data.localSave` | `true` | Download CSV/JSON to browser on completion |
| `data.filePrefix` | `"experiments"` | Filename prefix for downloads |
| `data.localSaveFormat` | `"csv"` | `"csv"`, `"json"`, or `"both"` |
| `autoresponder.enabled` | `false` | Enable synthetic participant |
| `ui.pageBackground` | gradient | CSS background for the shell page |

---

## Testing with the Auto-Responder

The auto-responder runs the experiment with a synthetic participant — no keyboard input needed. Useful for smoke-testing after config changes.

### Enable via URL

```
http://localhost:5173/?task=nback&config=nback/default&auto=true
```

### Enable for a long unattended run

```bash
npm run autoresponder:url -- --url "http://localhost:5173/?task=bricks&config=bricks/baseline&auto=true" --max-minutes 10
```

### Auto-responder config

Override synthetic timing in the task config:

```json
{
  "autoresponder": {
    "enabled": false,
    "jsPsychSimulationMode": "visual",
    "continueDelayMs": { "minMs": 800, "maxMs": 2600 },
    "surveySubmitDelayMs": { "minMs": 120, "maxMs": 420 },
    "responseRtMs": { "meanMs": 720, "sdMs": 210, "minMs": 180, "maxMs": 3200 },
    "timeoutRate": 0.08,
    "errorRate": 0.12,
    "interActionDelayMs": { "minMs": 450, "maxMs": 1200 },
    "holdDurationMs": { "minMs": 220, "maxMs": 860 },
    "maxTrialDurationMs": 90000
  }
}
```

When auto mode is enabled, survey forms are auto-filled and submitted automatically; single-choice and slider answers are sampled with variability.

---

## Building for Production

```bash
npm run build
```

Output is placed in `apps/web/dist/`. The built bundle includes all config JSONs (they are bundled at build time via `import.meta.glob`).

### Typechecking

```bash
npm run typecheck
```

Run this before deploying to catch any config-related or code type errors.

---

## Deploying to JATOS

1. Build the project: `npm run build`
2. Zip the contents of `apps/web/dist/`.
3. In JATOS, create a **Study** and add a **Component**.
4. Upload the zip as the component's HTML bundle.
5. Set task/config in the **Component JSON Input**:
   ```json
   {
     "task": "nback",
     "config": "nback/pm_module_demo"
   }
   ```
6. For runtime overrides, add an `"overrides"` key to the Component JSON Input:
   ```json
   {
     "task": "nback",
     "config": "nback/default",
     "overrides": {
       "mapping": { "targetKey": "k" }
     }
   }
   ```
7. Participant IDs are read from JATOS URL query parameters (`PROLIFIC_PID`, `SONA_ID`, etc.) and from `jatos.urlQueryParameters` (preserved even after Prolific/Publix redirects).

Notes:
- `config` is the preferred JATOS field for selecting a config path.
- `configID` and `configId` are accepted aliases.
- `variant` / `variantId` remain supported as backward-compatible aliases, but new deployments should prefer `config`.

Data is submitted to JATOS result data automatically when the experiment ends. Local-save downloads also occur if `data.localSave: true`.

---

## Adding a New Task

### 1. Create the adapter

```
tasks/
└── mytask/
    ├── package.json
    └── src/
        └── index.ts
```

In `tasks/mytask/src/index.ts`:

```typescript
import { createTaskAdapter } from "@experiments/core";

export const myTaskAdapter = createTaskAdapter({
  manifest: {
    taskId: "mytask",
    label: "My Task",
    variants: [
      { id: "default", label: "Default", configPath: "mytask/default" },
    ],
  },
  run: async (context) => {
    // access context.taskConfig, context.container, context.selection
    // use TaskOrchestrator for block/trial lifecycle
  },
  terminate: async () => {
    // cleanup on interrupt
  },
});
```

### 2. Create a config file

Create `configs/mytask/default.json` with whatever fields your task needs. No registration required — it is auto-discovered.

### 3. Register the adapter in the web shell

In `apps/web/src/main.ts`, import and add to the adapters array:

```typescript
import { myTaskAdapter } from "@experiments/task-mytask";
// ...
const adapters: TaskAdapter[] = [
  // ... existing adapters
  myTaskAdapter,
];
```

### 4. Document it

Add `docs/TASK_MYTASK.md` following the conventions in existing task docs.

### 5. Test it

```
http://localhost:5173/?task=mytask&config=mytask/default
http://localhost:5173/?task=mytask&config=mytask/default&auto=true
```

---

## Stimulus Export

Any task that supports it can export the planned stimulus list without running the full experiment:

```
http://localhost:5173/?task=nback&config=nback/default&exportStimuli=true
```

A CSV is downloaded containing the planned block/trial sequence, including trial types, stimuli, and expected responses.

Supported tasks: `sft`, `nback`, `bricks`, `stroop`, `tracking`, `change_detection`, `flanker`, `go_no_go`.

---

## Data Output

By default (`data.localSave: true`), each completed experiment downloads a CSV file to the browser. File naming: `<filePrefix>_<taskId>_trials_<timestamp>.csv`.

Set `data.localSaveFormat` to control output:
- `"csv"` — trial-level CSV only (default)
- `"json"` — full JSON payload only
- `"both"` — both files

When JATOS is present, data is also submitted to `resultData` as a JSON-lines stream (incremental) and a final payload.
