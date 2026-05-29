# Task: Flanker (Eriksen Flanker Task)

The Eriksen Flanker Task measures selective attention and executive control. Participants identify the direction of a central target arrow while ignoring flanking arrows that are congruent, incongruent, or neutral.

- **Adapter path:** `tasks/flanker/src/index.ts`
- **Task ID:** `flanker`
- **Runner:** jsPsych (canvas keyboard response)

---

## 1. Variants

| Variant ID | Config Path | Description |
| :--- | :--- | :--- |
| `default` | `flanker/default` | Standard arrow flanker (2 blocks × 36 trials) |

---

## 2. Configuration Schema

### 2.1 `task`

| Field | Default | Description |
| :--- | :--- | :--- |
| `task.title` | `"Flanker Task"` | Title shown on instruction cards |
| `task.instructions` | — | Legacy intro fallback (string or array). Prefer `instructions.pages` below. |
| `task.rtTask` | — | RT timing and response policy (see below) |

#### `task.rtTask`

| Field | Default | Description |
| :--- | :--- | :--- |
| `task.rtTask.timing.trialDurationMs` | `2000` | Total trial duration in ms |
| `task.rtTask.timing.fixationOnsetMs` | `0` | Time from trial start to fixation onset |
| `task.rtTask.timing.fixationDurationMs` | `500` | Fixation cross duration |
| `task.rtTask.timing.stimulusOnsetMs` | `700` | Time from trial start to stimulus onset |
| `task.rtTask.timing.responseWindowStartMs` | `700` | When response logging begins |
| `task.rtTask.timing.responseWindowEndMs` | `1700` | When response logging ends |
| `task.rtTask.responseTerminatesTrial` | `false` | End trial immediately on response |
| `task.rtTask.postResponseContent` | `"blank"` | Post-response content: `"stimulus"` or `"blank"` |
| `task.rtTask.feedbackPhase` | `"separate"` | Feedback timing: `"separate"` or `"post_response"` |

### 2.2 `instructions`

Standard instruction-slot parsing. Preferred over `task.instructions`:

- `instructions.pages` (alias `introPages`, `intro`, `screens`): task intro screens
- `instructions.preBlockPages` (alias `beforeBlockPages`, `beforeBlockScreens`): screens before each block
- `instructions.postBlockPages` (alias `afterBlockPages`, `afterBlockScreens`): screens after each block
- `instructions.endPages` (alias `outroPages`, `end`, `outro`): screens at task end
- `instructions.blockIntroTemplate`: template shown before each block (supports `{blockLabel}`, `{nTrials}`)
- `instructions.showBlockLabel`: boolean (default `true`)
- `instructions.preBlockBeforeBlockIntro`: boolean (default `false`)

### 2.3 `mapping`

| Field | Default | Description |
| :--- | :--- | :--- |
| `mapping.leftKey` | `"f"` | Key for "left" target response |
| `mapping.rightKey` | `"j"` | Key for "right" target response |

Keys must be distinct.

### 2.4 `display`

| Field | Default | Description |
| :--- | :--- | :--- |
| `display.aperturePx` | `440` | Canvas frame width/height in pixels |
| `display.stimulusFontSizePx` | `56` | Font size of the arrow characters |
| `display.stimulusSpacingPx` | `10` | Pixel gap between adjacent symbols |
| `display.stimulusColor` | `"#000000"` | CSS color of all arrow symbols |

### 2.5 `stimuli`

| Field | Default | Description |
| :--- | :--- | :--- |
| `stimuli.leftTarget` | `"<"` | Central target character for "left" |
| `stimuli.rightTarget` | `">"` | Central target character for "right" |
| `stimuli.leftFlanker` | `"<"` | Flanker character for "left" direction |
| `stimuli.rightFlanker` | `">"` | Flanker character for "right" direction |
| `stimuli.neutralFlanker` | `"-"` | Flanker character for neutral condition |
| `stimuli.flankerCount` | `4` | Total number of flankers (must be even; 2 on each side) |

### 2.6 `conditions`

| Field | Default | Description |
| :--- | :--- | :--- |
| `conditions.quotaPerBlock.congruent` | `12` | Exact count of congruent trials per block |
| `conditions.quotaPerBlock.incongruent` | `12` | Exact count of incongruent trials per block |
| `conditions.quotaPerBlock.neutral` | `12` | Exact count of neutral trials per block |
| `conditions.maxConditionRunLength` | `3` | Maximum consecutive trials of the same condition |

Condition definitions:
- **congruent**: flankers point in the same direction as the target
- **incongruent**: flankers point in the opposite direction to the target
- **neutral**: flankers are the neutral character

### 2.7 `plan`

| Field | Default | Description |
| :--- | :--- | :--- |
| `plan.blockCount` | — | Number of blocks to run |
| `plan.blockTemplate.trials` | — | Trials per block (should equal sum of `conditions.quotaPerBlock`) |
| `plan.blockTemplate.label` | — | Optional label template (supports `{blockIndex}`) |
| `plan.blockTemplate.feedback.enabled` | `false` | Show trial feedback |
| `plan.blockTemplate.feedback.durationMs` | `400` | Feedback duration in ms |
| `plan.blockTemplate.beforeBlockScreens` | `[]` | Extra screens before each block |
| `plan.blockTemplate.afterBlockScreens` | `[]` | Extra screens after each block |

The `blockTemplate` is replicated `blockCount` times. To use different block types, create separate config variants.

### 2.8 `feedback`

Global feedback config merged with per-block overrides. Uses the shared feedback schema:

| Field | Description |
| :--- | :--- |
| `feedback.enabled` | Show per-trial feedback |
| `feedback.durationMs` | Feedback display duration |
| `feedback.messages.correct` | Message on correct response |
| `feedback.messages.incorrect` | Message on incorrect response |
| `feedback.messages.timeout` | Message on timeout |
| `feedback.style.correctColor` | Feedback color for correct responses |
| `feedback.style.incorrectColor` | Feedback color for incorrect responses |
| `feedback.style.timeoutColor` | Feedback color for timeouts |

---

## 3. Example Config

```json
{
  "task": {
    "title": "Flanker Task",
    "rtTask": {
      "timing": {
        "trialDurationMs": 2000,
        "fixationDurationMs": 500,
        "stimulusOnsetMs": 700,
        "responseWindowStartMs": 700,
        "responseWindowEndMs": 1700
      },
      "feedbackPhase": "separate",
      "postResponseContent": "blank"
    }
  },
  "instructions": {
    "pages": [
      "Identify the direction of the **center arrow**.",
      "Press **F** for left (<), **J** for right (>). Ignore the surrounding arrows."
    ],
    "preBlockPages": "Keep your fingers on F and J.",
    "endPages": "Task complete. Thank you."
  },
  "mapping": {
    "leftKey": "f",
    "rightKey": "j"
  },
  "display": {
    "aperturePx": 440,
    "stimulusFontSizePx": 56,
    "stimulusSpacingPx": 10,
    "stimulusColor": "#000000"
  },
  "stimuli": {
    "leftTarget": "<",
    "rightTarget": ">",
    "leftFlanker": "<",
    "rightFlanker": ">",
    "neutralFlanker": "-",
    "flankerCount": 4
  },
  "conditions": {
    "quotaPerBlock": {
      "congruent": 12,
      "incongruent": 12,
      "neutral": 12
    },
    "maxConditionRunLength": 3
  },
  "plan": {
    "blockCount": 3,
    "blockTemplate": {
      "trials": 36,
      "feedback": { "enabled": true, "durationMs": 400 }
    }
  }
}
```

---

## 4. Data Output

CSV suffix: `flanker_trials`

Each trial produces one row:

| Field | Description |
| :--- | :--- |
| `conditionLabel` | `"congruent"`, `"incongruent"`, or `"neutral"` |
| `targetDirection` | `"left"` or `"right"` |
| `flankerDirection` | `"left"`, `"right"`, or `"neutral"` |
| `stimulusString` | Full rendered stimulus string (e.g., `"< < > < <"`) |
| `correctResponse` | Expected key (`"f"` or `"j"`) |
| `responseKey` | Key pressed |
| `responseRtMs` | Response time in ms |
| `responseCorrect` | `1` (correct) or `0` (incorrect) |

Participant, variant, block, and trial index fields are also included.

Stimulus export is supported via `?exportStimuli=true`.
