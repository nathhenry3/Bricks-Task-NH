# Task: RDK (Random Dot Kinematogram)

The RDK adapter presents a circular aperture of moving or colored dots and asks participants to judge the predominant direction of motion (dynamic mode) or predominant color (static mode).

- **Adapter path:** `tasks/rdk/src/index.ts`
- **Task ID:** `rdk`
- **Renderer:** Native canvas / Pixi.js

---

## 1. Variants

| Variant ID | Config Path | Description |
| :--- | :--- | :--- |
| `default` | `rdk/default` | Mixed dynamic (direction judgment) and static (color judgment) blocks |

---

## 2. Configuration Schema

### 2.1 `task`

| Field | Default | Description |
| :--- | :--- | :--- |
| `task.title` | `"Random Dot Kinetogram"` | Title shown on instruction cards |

### 2.2 `instructions`

Uses standard instruction-slot parsing:

- `instructions.pages` (alias `intro`, `introPages`, `screens`): task intro screens
- `instructions.preBlockPages`: screens before each block
- `instructions.postBlockPages`: screens after each block
- `instructions.endPages`: screens at task end
- `instructions.blockIntroTemplate`: template string (supports `{nTrials}`, `{phase}`)

### 2.3 `display`

| Field | Default | Description |
| :--- | :--- | :--- |
| `display.aperturePx` | `500` | Diameter of the circular dot aperture |
| `display.frameBackground` | `"#0f172a"` | Background color behind the aperture |
| `display.frameBorder` | `"#334155"` | Border/crosshair color of the aperture frame |
| `display.canvasBackground` | `"#e2e8f0"` | Background color inside the aperture |
| `display.showCrosshair` | `true` | Show a central fixation crosshair |
| `display.rendererBackend` | `"pixi"` | Rendering backend: `"pixi"` or `"canvas"` |

### 2.4 `trialDefaults`

Default values for all trials. Individual blocks can override these directly.

| Field | Default | Description |
| :--- | :--- | :--- |
| `trialDefaults.mode` | `"dynamic"` | `"dynamic"` (direction judgment) or `"static"` (color judgment) |
| `trialDefaults.durationMs` | `5000` | Maximum trial display duration in ms |
| `trialDefaults.coherenceStart` | `0.5` | Coherence at trial onset (0.0–1.0) |
| `trialDefaults.coherenceEnd` | `0.5` | Coherence at trial end (used for ramp if no function) |
| `trialDefaults.coherenceDurationMs` | `0` | Duration over which coherence ramps from start to end |
| `trialDefaults.coherenceFunction` | `null` | Optional JS expression: `start + (end-start) * Math.sin(t/dur * Math.PI/2)` |
| `trialDefaults.direction` | `"right"` | Dot motion direction: `"left"`, `"right"`, `"up"`, `"down"` |
| `trialDefaults.dotCount` | `300` | Number of dots |
| `trialDefaults.dotSizePx` | `4` | Dot radius in pixels |
| `trialDefaults.dotColor` | `"#ffffff"` | Primary dot color (signal color in static mode) |
| `trialDefaults.dotColorAlternate` | `"#000000"` | Alternate dot color (noise color in static mode) |
| `trialDefaults.speedPxPerSec` | `100` | Dot speed in dynamic mode |
| `trialDefaults.responseMaxDurationMs` | `5000` | Response window after stimulus ends (`0` = no timeout) |
| `trialDefaults.responseKeys.left` | `"ArrowLeft"` | Key for "left" response |
| `trialDefaults.responseKeys.right` | `"ArrowRight"` | Key for "right" response |
| `trialDefaults.responseKeys.up` | `"ArrowUp"` | Key for "up" response |
| `trialDefaults.responseKeys.down` | `"ArrowDown"` | Key for "down" response |
| `trialDefaults.responseKeys.black` | `"f"` | Key for "black" response (static mode) |
| `trialDefaults.responseKeys.white` | `"j"` | Key for "white" response (static mode) |

### 2.5 `interTrialIntervalMs`

| Field | Default | Description |
| :--- | :--- | :--- |
| `interTrialIntervalMs` | `300` | Blank interval between trials in ms |

### 2.6 `plan.blocks[]`

Each block inherits from `trialDefaults` and can override any trial-level field directly:

| Field | Default | Description |
| :--- | :--- | :--- |
| `label` | `"Block N"` | Block label for data export |
| `phase` | `"main"` | `"practice"` or `"main"` |
| `trials` | `8` | Number of trials |
| `mode` | from `trialDefaults` | Override trial mode for this block |
| `coherenceStart` | from `trialDefaults` | Starting coherence |
| `coherenceEnd` | from `trialDefaults` | Ending coherence |
| `coherenceDurationMs` | from `trialDefaults` | Coherence ramp duration |
| `coherenceFunction` | from `trialDefaults` | Custom coherence expression |
| `direction` | from `trialDefaults` | Motion direction |
| `dotCount` | from `trialDefaults` | Number of dots |
| `dotSizePx` | from `trialDefaults` | Dot size |
| `speedPxPerSec` | from `trialDefaults` | Motion speed |
| `responseKeys` | from `trialDefaults` | Response key overrides |
| `beforeBlockScreens` | `[]` | Instruction pages before the block |
| `afterBlockScreens` | `[]` | Instruction pages after the block |
| `manipulation` | — | Optional manipulation ID from `plan.manipulations[]` |

Blocks also support `plan.manipulations[]` and `plan.manipulationPools` for parametric design (same pattern as other tasks — see [CONFIGURATION_GUIDE.md](./CONFIGURATION_GUIDE.md)).

### 2.7 DRT integration

RDK supports a DRT module at the block level via `task.drt` or `task.embeds.drt` (or per-block via `plan.blocks[].drt`). See [MODULE_DRT.md](./MODULE_DRT.md) for the full config reference.

---

## 3. Trial Modes

### Dynamic mode (`mode: "dynamic"`)

- Dots move continuously; `coherenceStart`/`coherenceEnd` fraction move in the `direction` axis.
- On each direction axis (`left`/`right` or `up`/`down`), the actual direction is randomized per trial.
- Participant presses the appropriate arrow key.

### Static mode (`mode: "static"`)

- Dots are stationary and individually colored.
- `coherence` controls the fraction of dots showing the signal color vs. noise color.
- Actual dominant color (`black` or `white`) is randomized per trial.
- Participant presses `f` (black) or `j` (white) by default.

### Coherence control

Coherence can be:
- **Fixed**: set `coherenceEnd` (with `coherenceDurationMs: 0`).
- **Linear ramp**: set `coherenceStart`, `coherenceEnd`, and `coherenceDurationMs`.
- **Custom function**: set `coherenceFunction` as a JS expression. Variables available: `t` (elapsed ms), `tMax` (total duration ms), `start` (coherenceStart), `end` (coherenceEnd).

Example:
```json
{
  "coherenceFunction": "start + (end - start) * Math.sin((t / 2000) * Math.PI / 2)"
}
```

---

## 4. Data Output

Trial records include:

| Field | Description |
| :--- | :--- |
| `taskId` | `"rdk"` |
| `phase` | `"practice"` or `"main"` |
| `blockLabel` | Block label |
| `blockIndex` | Block index |
| `trialIndex` | Trial index within block |
| `mode` | `"dynamic"` or `"static"` |
| `durationMs` | Actual trial duration |
| `coherenceStart` | Configured coherence start |
| `coherenceEnd` | Configured coherence end |
| `direction` | Actual direction/color shown |
| `responseKey` | Key pressed (or `null`) |
| `rtMs` | Response time in ms (or `null`) |
| `correct` | `true`/`false`/`null` |

DRT data (when enabled) is included in `moduleResults.drt` and exported via event log.
