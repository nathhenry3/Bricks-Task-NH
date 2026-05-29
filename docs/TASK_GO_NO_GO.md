# Task: Go/No-Go

The Go/No-Go task is a classic cognitive control paradigm. Participants press a key when a "go" stimulus appears and withhold a response when a "no-go" stimulus appears.

- **Adapter path:** `tasks/go_no_go/src/index.ts`
- **Task ID:** `go_no_go`
- **Runner:** jsPsych (canvas keyboard response)

---

## 1. Variants

The Go/No-Go adapter has no bundled variants (the manifest has an empty `variants: []` list). To use it, supply your own config via `?config=go_no_go/myconfig` or pass a `?overrides=...` JSON.

---

## 2. Configuration Schema

All fields are nested under the `task` object (note: this differs from tasks that use a top-level `plan` — Go/No-Go reads blocks from `task.blocks[]`).

### 2.1 `task.title`

| Field | Default | Description |
| :--- | :--- | :--- |
| `task.title` | `"Go/No-Go Task"` | Title displayed on instruction cards |

### 2.2 `task.instructions`

Standard instruction-slot parsing applied to `task.instructions`:

- `pages` (alias `introPages`, `intro`, `screens`): screens shown before the task
- `preBlockPages` / `postBlockPages`: screens before/after each block
- `endPages`: screens at task end
- `blockIntroTemplate`: supports `{blockLabel}` and `{nTrials}`
- `showBlockLabel`: boolean (default `true`)

Example:
```json
{
  "task": {
    "instructions": {
      "pages": [
        "Press SPACE for the green stimulus (O). Withhold for the red stimulus (X).",
        "Respond as quickly and accurately as possible."
      ],
      "endPages": "Thank you for completing the task."
    }
  }
}
```

### 2.3 `task.mapping`

| Field | Default | Description |
| :--- | :--- | :--- |
| `task.mapping.goKey` | `" "` (space) | Key to press for go stimuli |

No-go trials require a withheld response — there is no separate `noGoKey`.

### 2.4 `task.stimuli`

| Field | Default | Description |
| :--- | :--- | :--- |
| `task.stimuli.goStimuli` | `["O"]` | Array of go stimulus strings |
| `task.stimuli.noGoStimuli` | `["X"]` | Array of no-go stimulus strings |

Each trial randomly draws one stimulus from the appropriate array.

### 2.5 `task.display`

| Field | Default | Description |
| :--- | :--- | :--- |
| `task.display.aperturePx` | `400` | Canvas frame width/height |
| `task.display.paddingYPx` | `80` | Vertical padding within the frame |
| `task.display.frameBackground` | `"rgba(255,255,255,1)"` | Frame background color |
| `task.display.frameBorder` | `"1px solid rgba(0,0,0,0.2)"` | Frame border CSS string |
| `task.display.fixationColor` | `"#000000"` | Color of the fixation cross |
| `task.display.fixationFontSizePx` | `40` | Font size of the fixation cross |
| `task.display.fixationFontWeight` | `400` | Font weight of the fixation cross |
| `task.display.stimulusFontSizePx` | `48` | Font size of the stimulus |
| `task.display.stimulusFontWeight` | `600` | Font weight of the stimulus |
| `task.display.goStimulusColor` | `"#2e7d32"` | Color of go stimuli |
| `task.display.noGoStimulusColor` | `"#d32f2f"` | Color of no-go stimuli |

### 2.6 `task.rtTask`

Timing and response policy for jsPsych trials. Uses the shared RT task config:

| Field | Default | Description |
| :--- | :--- | :--- |
| `task.rtTask.timing.trialDurationMs` | `1500` | Total trial duration |
| `task.rtTask.timing.fixationDurationMs` | `500` | Fixation cross duration |
| `task.rtTask.timing.stimulusOnsetMs` | `500` | Time from trial start to stimulus onset |
| `task.rtTask.timing.responseWindowStartMs` | `500` | When response logging begins |
| `task.rtTask.timing.responseWindowEndMs` | `1500` | When response logging ends |
| `task.rtTask.responseTerminatesTrial` | `false` | End trial immediately on response |
| `task.rtTask.postResponseContent` | `"blank"` | What is shown after response: `"stimulus"` or `"blank"` |
| `task.rtTask.feedbackPhase` | `"post_response"` | When feedback is shown: `"separate"` or `"post_response"` |

### 2.7 `task.feedbackDefaults`

Global feedback config applied to all blocks unless overridden. Uses the shared feedback schema:

| Field | Default | Description |
| :--- | :--- | :--- |
| `task.feedbackDefaults.enabled` | `false` | Show trial-level feedback |
| `task.feedbackDefaults.durationMs` | `800` | Feedback display duration |
| `task.feedbackDefaults.messages.correct` | — | Text shown on correct response |
| `task.feedbackDefaults.messages.incorrect` | — | Text shown on incorrect response |
| `task.feedbackDefaults.messages.timeout` | — | Text shown on timeout |
| `task.feedbackDefaults.style.*` | — | Color/font overrides |

### 2.8 `task.blocks[]`

Array of block definitions. Each block runs a shuffled mix of go and no-go trials.

| Field | Default | Description |
| :--- | :--- | :--- |
| `id` | derived from `label` | Unique block identifier |
| `label` | `"blockN"` | Block label (shown in output and block intro) |
| `trials` | `0` | Number of trials in the block |
| `goRatio` | `0.8` | Proportion of go trials (0.0–1.0); remainder are no-go |
| `feedback` | inherits `feedbackDefaults` | Per-block feedback override |
| `beforeBlockScreens` | `[]` | Instruction pages shown before the block |

---

## 3. Example Config

```json
{
  "task": {
    "title": "Go/No-Go",
    "instructions": {
      "pages": [
        "Press SPACE as fast as possible when you see a green O.",
        "Withhold your response when you see a red X.",
        "Respond within 1 second of the stimulus appearing."
      ]
    },
    "mapping": {
      "goKey": " "
    },
    "stimuli": {
      "goStimuli": ["O"],
      "noGoStimuli": ["X"]
    },
    "display": {
      "aperturePx": 400,
      "goStimulusColor": "#2e7d32",
      "noGoStimulusColor": "#d32f2f"
    },
    "rtTask": {
      "timing": {
        "trialDurationMs": 1500,
        "fixationDurationMs": 500,
        "stimulusOnsetMs": 500,
        "responseWindowStartMs": 500,
        "responseWindowEndMs": 1500
      }
    },
    "feedbackDefaults": {
      "enabled": true,
      "durationMs": 600,
      "messages": {
        "correct": "Correct",
        "incorrect": "Incorrect",
        "timeout": "Too slow"
      }
    },
    "blocks": [
      {
        "id": "practice",
        "label": "Practice",
        "trials": 20,
        "goRatio": 0.8,
        "beforeBlockScreens": ["Practice block. Try to respond as quickly as you can."]
      },
      {
        "id": "main",
        "label": "Main",
        "trials": 100,
        "goRatio": 0.75
      }
    ]
  }
}
```

---

## 4. Data Output

CSV suffix: `go_no_go_trials`

Each trial produces one row:

| Field | Description |
| :--- | :--- |
| `participantId` | Participant identifier |
| `variantId` | Variant/config path used |
| `blockId` | Block ID |
| `blockLabel` | Block label |
| `blockIndex` | Block index (0-based) |
| `trialId` | Unique trial ID |
| `trialIndex` | Trial index within block (0-based) |
| `condition` | `"go"` or `"no-go"` |
| `stimulus` | The stimulus string shown |
| `expectedCategory` | `"go"` for go trials, `null` for no-go trials |
| `responseKey` | Key pressed (or `""` for withheld) |
| `responseRtMs` | Response time in ms (or `0` for withheld) |
| `responseCorrect` | `1` (correct) or `0` (incorrect) |

A block-level accuracy summary is shown after each block (via `blockSummary` with `metrics.correctField: "responseCorrect"`).

Stimulus export mode is also supported (`?exportStimuli=true`), downloading the planned trial list as CSV.
