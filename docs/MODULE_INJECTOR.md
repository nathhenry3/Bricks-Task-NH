# Module: Stimulus Injector

The Stimulus Injector is a low-level module that allows you to inject arbitrary trials into any experiment's block plan. It is commonly used for custom Prospective Memory (PM) tasks, control stimuli, and other interleaved events.

## 1. Configuration (`task.modules.injector`)

| Field | Type | Default | Description |
| :--- | :--- | :--- | :--- |
| `enabled` | boolean | `false` | Whether the module is active. |
| `injections` | array | `[]` | List of injection configurations. |

### 1.1 Injection Spec (`injections[]`)

- `id`: Optional string ID for the injection.
- `enabled`: boolean (default `true`).
- `schedule`: Configuration for trial spacing (see [Schedule](#schedule)).
- `eligibleTrialTypes`: Array of base trial types that can be replaced (e.g., `["F"]`).
- `source`: Configuration for where to draw stimuli (see [Source](#source)).
- `sourceDraw`: Configuration for the stimulus draw mode.
- `set`: Properties to apply to the injected trial (see [Setters](#setters)).

### 1.2 Schedule (`schedule`)

- `count`: Number of trials to inject.
- `minSeparation`: Minimum trials between injections.
- `maxSeparation`: Maximum trials between injections.

### 1.3 Source (`source`)

#### Category Source (`category_in`)
Draws items from a stimulus category defined in the task's `stimuli` or `stimuliCsv`.
```json
{
  "type": "category_in",
  "categories": ["animals", "fruits"]
}
```

#### Literal Source (`literal`)
Draws from an inline list of items.
```json
{
  "type": "literal",
  "items": ["cat", "dog", "mouse"],
  "sourceCategory": "animals"
}
```

### 1.4 Source Draw (`sourceDraw`)

- `mode`: `"without_replacement"`, `"with_replacement"`, or `"ordered"`.
- `scope`: `"block"` (default) or `"participant"`.
- `shuffle`: boolean (default `true`).

### 1.5 Setters (`set`)

These values will be merged into the trial object:
- `trialType`: e.g., `"PM"`.
- `itemCategory`: e.g., `"injected"`.
- `correctResponse`: The response key expected (e.g., `"space"`).
- `responseCategory`: Semantic category (e.g., `"pm"`).
- `locked`: Optional boolean lock flag. When `true`, later injectors/samplers that respect `locked` will skip this trial.

For compatibility with PM workflows, injector trials are auto-locked when `set.locked` is not provided and either `set.trialType` is `"PM"` or `set.responseCategory` is `"pm"`.

## 2. Integration Mechanics

1.  **Plan Interception:** The module processes injections in the order they are defined.
2.  **Replacement:** The module replaces the trial at the selected position with the injected item.
3.  **Semantic Mapping:** Any `correctResponse` set by the injector is automatically added to the task's allowed key set.
4.  **Feasibility Guard:** If `schedule.count > 0` and no eligible positions exist, injection fails with an explicit error instead of silently skipping.

## 3. Data Output

Injector results are summarized in the `moduleResults` object under the key `injector`.

- **`applied`**: Array of injection logs showing which IDs were applied at which positions.
- **Trial Records:** Injected trials appear in the main CSV with the properties defined in the `set` object and an additional `injectionId` field.
