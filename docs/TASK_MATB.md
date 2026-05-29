# Task: MATB (Multi-Attribute Task Battery)

The MATB adapter implements a composite multi-tasking paradigm in which participants perform four concurrent subtasks simultaneously within a multi-panel display.

- **Adapter path:** `tasks/matb/src/adapter.ts`
- **Task ID:** `matb`

---

## 1. Overview

The four active subtasks are:

| Subtask | Panel | Description |
| :--- | :--- | :--- |
| **SYSMON** | Top-left | System Monitoring — respond to indicator light failures (F5/F6) and scale drift (F1–F4) |
| **TRACKING** | Top-center | Compensatory tracking — keep cursor inside central reticle with mouse |
| **COMMS** | Bottom-left | Communications — respond to radio callouts matching own callsign |
| **RESMAN** | Bottom-center | Resource Management — balance fuel tanks A and B near target level using numpad |

Two additional read-only panels (`scheduling` top-right, `pumpstatus` bottom-right) provide auxiliary status information.

The task runs as a timed session. Blocks can be defined to run sequential sessions with different configs.

---

## 2. Variants

| Variant ID | Config Path | Description |
| :--- | :--- | :--- |
| `default` | `matb/default` | Standard 8-minute session with static scenario |
| `practice` | `matb/practice` | Short practice session |
| `low-load` | `matb/low-load` | Dynamic scenario, low-reliability failures |
| `high-load` | `matb/high-load` | Dynamic scenario, high-reliability failures |
| `basic` | `matb/basic` | Minimal session for development/testing |
| `parasuraman-high` | `matb/parasuraman-high` | Parasuraman et al. high-reliability replication |
| `parasuraman-low` | `matb/parasuraman-low` | Parasuraman et al. low-reliability replication |
| `parasuraman-drt` | `matb/parasuraman-drt` | Two-block version with DRT |
| `parasuraman-drt-dynamic` | `matb/parasuraman-drt-dynamic` | Dynamic scenario with DRT |

---

## 3. Configuration Schema

### 3.1 `task`

| Field | Type | Default | Description |
| :--- | :--- | :--- | :--- |
| `task.title` | string | `"MATB"` | Display title shown on instruction cards |
| `task.durationMs` | number | `480000` | Default block duration in milliseconds (8 minutes) |
| `task.modules.drt` | object | — | Task-level DRT config (see [MODULE_DRT.md](./MODULE_DRT.md)) |

### 3.2 `display`

Controls the MATB panel area sizing:

| Field | Default | Description |
| :--- | :--- | :--- |
| `display.maxWidthPx` | `1600` | Maximum panel area width |
| `display.maxHeightPx` | `900` | Maximum panel area height |
| `display.minWidthPx` | `800` | Minimum panel area width |
| `display.minHeightPx` | `450` | Minimum panel area height |
| `display.aspectRatio` | `"16/9"` | CSS aspect-ratio for panel area |
| `display.marginPx` | `16` | Margin around the panel grid |
| `display.background` | `"#d0d0d0"` | Background color behind panel grid |

### 3.3 `instructions`

Uses standard instruction-slot parsing:

- `instructions.intro` (alias `instructions.pages`): intro screens shown before the session
- `instructions.end` (alias `instructions.endPages`): screens shown at task end

### 3.4 `ui`

Override instruction card and button styling (see [CONFIGURATION_GUIDE.md §4](./CONFIGURATION_GUIDE.md)):

```json
{
  "ui": {
    "pageBackground": "#0a0a0a",
    "cardBackground": "#1a1a1a",
    "cardColor": "#cccccc",
    "continueButtonStyle": {
      "background": "#222222",
      "border": "1px solid #444444",
      "color": "#cccccc"
    }
  }
}
```

### 3.5 `layout`

Defines the panel grid:

```json
{
  "layout": {
    "rows": 2,
    "cols": 3,
    "gap": "2px",
    "background": "#d0d0d0",
    "panels": [
      { "id": "sysmon",     "row": 0, "col": 0, "label": "SYSTEM MONITORING" },
      { "id": "tracking",   "row": 0, "col": 1, "label": "TRACKING" },
      { "id": "scheduling", "row": 0, "col": 2, "label": "SCHEDULING" },
      { "id": "comms",      "row": 1, "col": 0, "label": "COMMUNICATIONS" },
      { "id": "resman",     "row": 1, "col": 1, "label": "RESOURCE MANAGEMENT" },
      { "id": "pumpstatus", "row": 1, "col": 2, "label": "PUMP STATUS" }
    ]
  }
}
```

Panel IDs: `sysmon`, `tracking`, `comms`, `resman`, `scheduling`, `pumpstatus`.

Each panel entry: `{ "id", "row", "col", "label", "colSpan"? }`.

### 3.6 `subtasks`

Per-subtask configuration. Each field under `subtasks` overrides defaults for that subtask.

#### `subtasks.sysmon`

| Field | Default | Description |
| :--- | :--- | :--- |
| `lights[]` | — | Array of indicator light configs: `id`, `label`, `onColor`, `offColor`, `defaultOn`, `key` |
| `scales[]` | — | Array of scale configs: `id`, `label`, `key`, `driftSpeed` |
| `alertTimeoutMs` | `10000` | Time before an unacknowledged failure auto-resolves |
| `feedbackDurationMs` | `1500` | Duration of visual feedback after a correct response |
| `driftIntervalMs` | `200` | Tick rate for scale drift updates (ms) |

#### `subtasks.tracking`

| Field | Default | Description |
| :--- | :--- | :--- |
| `display.aperturePx` | `400` | Tracking canvas size |
| `display.showCrosshair` | `true` | Show crosshair overlay |
| `display.canvasBackground` | `"#f0f0f0"` | Canvas background color |
| `reticle.radiusPx` | `50` | Radius of the target reticle |
| `reticle.strokeColor` | `"#323232"` | Reticle border color |
| `cursor.radiusPx` | `16` | Cursor dot radius |
| `cursor.colorInside` | `"#323232"` | Cursor color when inside reticle |
| `cursor.colorOutside` | `"#ef4444"` | Cursor color when outside reticle |
| `perturbation.components[]` | — | Array of sinusoidal perturbation components: `{ axis, frequencyHz, amplitude }` |
| `perturbation.gainRatio` | `0.8` | Mouse input gain scaling |
| `inputMode` | `"mouse"` | Input device (`"mouse"`) |
| `sampleIntervalMs` | `50` | Sampling rate for tracking data |
| `binMs` | `10000` | Bin size for performance aggregation |

#### `subtasks.comms`

| Field | Default | Description |
| :--- | :--- | :--- |
| `ownCallsign` | `"NASA504"` | The callsign participants must respond to |
| `radios[]` | — | Array of radio configs: `id`, `label`, `defaultFreqMhz` |
| `frequencyRange` | `{ minMhz: 108, maxMhz: 137, stepMhz: 0.1 }` | Tunable frequency range |
| `responseTimeoutMs` | `20000` | Time window to respond to a callout |
| `speech.voiceNames[]` | — | Preferred Web Speech API voice names (first available is used) |
| `speech.lang` | `"en-US"` | Speech synthesis language |
| `speech.rate` | `0.9` | Speech rate |
| `speech.pitch` | `1.0` | Speech pitch |
| `keys.radioUp` | `"ArrowUp"` | Select next radio |
| `keys.radioDown` | `"ArrowDown"` | Select previous radio |
| `keys.freqUp` | `"ArrowRight"` | Increase frequency |
| `keys.freqDown` | `"ArrowLeft"` | Decrease frequency |
| `keys.confirm` | `"Enter"` | Confirm tuned frequency |

#### `subtasks.resman`

Resource management is primarily controlled via scenario events (pump failures). Provide as `{}` to use defaults.

### 3.7 `scenario`

Controls when and what failures/events occur during the session.

#### Static scenario

```json
{
  "scenario": {
    "events": [
      { "timeMs": 30000, "target": "sysmon",  "command": "set", "path": "scale1.failure", "value": true },
      { "timeMs": 45000, "target": "comms",   "command": "prompt", "value": { "callsign": "NASA504", "radio": "com1", "frequency": 118.3 } },
      { "timeMs": 90000, "target": "resman",  "command": "set", "path": "pump.1.state",   "value": "failed" }
    ]
  }
}
```

Event fields:
- `timeMs`: Time offset from session start
- `target`: Subtask to receive the event (`"sysmon"`, `"comms"`, `"resman"`, `"tracking"`)
- `command`: `"set"` or `"prompt"`
- `path`: Dot-path for `"set"` commands (e.g., `"scale1.failure"`, `"pump.1.state"`, `"light1.failure"`)
- `value`: New value or prompt spec

#### Dynamic scenario

```json
{
  "scenario": {
    "mode": "dynamic",
    "warmupMs": 20000,
    "cooldownMs": 15000,
    "maxConcurrentFailures": 2,
    "sysmon": {
      "intervalMs": 30000,
      "minGapMs": 8000,
      "reliability": 0.9,
      "autoResolveDelayMs": 4000
    },
    "comms": {
      "intervalMs": 40000,
      "minGapMs": 15000,
      "ownRatio": 0.5
    },
    "resman": {
      "intervalMs": 60000,
      "failureDurationMs": 30000,
      "reliability": 0.9
    },
    "tracking": {
      "automated": false
    }
  }
}
```

Dynamic scenario fields:

| Field | Default | Description |
| :--- | :--- | :--- |
| `mode` | `"static"` | Set to `"dynamic"` to enable dynamic scheduling |
| `warmupMs` | `20000` | Time before failures start |
| `cooldownMs` | `15000` | Time before session end when new failures stop |
| `maxConcurrentFailures` | `0` (unlimited) | Max simultaneous active failures across all subtasks |
| `seed` | — | Optional integer seed for reproducible dynamic scenarios |
| `sysmon.intervalMs` | `30000` | Mean interval between sysmon events |
| `sysmon.minGapMs` | `8000` | Minimum gap between sysmon events |
| `sysmon.reliability` | — | Probability that a failure is a "real" failure (vs. auto-resolving) |
| `sysmon.autoResolveDelayMs` | `4000` | Delay before auto-resolve for unreliable events |
| `comms.intervalMs` | `40000` | Mean interval between comms prompts |
| `comms.ownRatio` | `0.5` | Fraction of prompts directed at own callsign |
| `resman.intervalMs` | `60000` | Mean interval between pump failures |
| `resman.failureDurationMs` | `30000` | Duration of each pump failure |
| `tracking.automated` | `false` | If `true`, tracking cursor is auto-controlled |

### 3.8 `plan.blocks[]`

Optional block array for multi-block sessions. If omitted, the top-level config defines a single block.

Each block can override any top-level field:

```json
{
  "plan": {
    "blocks": [
      {
        "label": "Low Load",
        "durationMs": 300000,
        "scenario": { "mode": "dynamic", "sysmon": { "reliability": 0.3 } },
        "beforeBlockScreens": ["Low-load block starting now."],
        "afterBlockScreens": ["Block complete. Take a rest."]
      },
      {
        "label": "High Load",
        "durationMs": 300000,
        "scenario": { "mode": "dynamic", "sysmon": { "reliability": 0.9 } }
      }
    ]
  }
}
```

Block fields:
- `label`: Block label for data output
- `durationMs`: Block duration override
- `isPractice`: boolean (default `false`)
- `subtasks`: Subtask config overrides for this block
- `scenario`: Scenario override for this block
- `layout`: Panel layout override
- `beforeBlockScreens` / `afterBlockScreens`: Instruction screens
- `modules`: Module config (e.g., `{ "drt": { "enabled": true } }`)

### 3.9 `endSurvey`

Optional post-session survey shown after all blocks:

```json
{
  "endSurvey": { "preset": "nasa_tlx" }
}
```

Supported presets: `"nasa_tlx"`, `"atwit"`.

---

## 4. DRT Integration

The MATB adapter supports DRT via `task.modules.drt` (task-level) or `plan.blocks[].modules.drt` (block-level). See [MODULE_DRT.md](./MODULE_DRT.md) for full config reference.

---

## 5. Data Output

Session data is exported with the following top-level keys:

- **`sysmon`**: `SysmonSubTaskResult` — per-event response records (hits, misses, RTs) and SDT summary
- **`tracking`**: `TrackingSubTaskResult` — binned tracking performance (inside/outside samples, mean error)
- **`comms`**: `CommsSubTaskResult` — per-prompt response records (correct tuning, RT)
- **`resman`**: `ResmanSubTaskResult` — tank level time series and deviation metrics
- **`drt_rows`**: DRT response records (when DRT is enabled)
- **`events`**: Lifecycle event log

CSV files:
- `matb_sysmon_events`: one row per sysmon event
- `matb_tracking_bins`: one row per tracking bin
- `matb_comms_prompts`: one row per comms prompt
- `matb_resman_ticks`: one row per resman tick
- `matb_drt_rows`: one row per DRT response (when enabled)
