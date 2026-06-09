# Bricks Runtime Config Schema

This is the runtime-facing schema used by `tasks/bricks/src/runtime/*` and block planner code in `tasks/bricks/src/index.ts`.

## 1. Run Bricks with a specific config

Start app:

```bash
npm run dev
```

Run Bricks baseline:

```text
http://localhost:5173/?task=bricks&variant=baseline
```

Run Bricks Moray baseline (ported from DiscoveryProject):

```text
http://localhost:5173/?task=bricks&variant=moray1991_vpt_vdd_baseline
```

Run Bricks spotlight:

```text
http://localhost:5173/?task=bricks&variant=spotlight
```

Force Bricks spotlight config while keeping baseline variant:

```text
http://localhost:5173/?task=bricks&variant=baseline&config=bricks/spotlight
```

## 2. Top-level sections

Recognized top-level keys:

- `display`
- `conveyors`
- `bricks`
- `drt`
- `trial`
- `experiment`
- `debug`
- `difficultyModel`
- `selfReport`
- `instructions`
- `blocks`
- `manipulations`

`blocks/manipulations` are planning-level keys. Other sections are consumed by runtime.

## 3. Planning-level schema (`blocks` + `manipulations`)

Planning keys can be provided either at top-level (`blocks`, `manipulations`, `manipulationPools`) or under `plan.*`.

### `blocks[]`

```ts
{
  label?: string;
  trials?: number;          // >= 1, default 1
  phase?: string;           // optional block phase tag (e.g., "practice", "main")
  isPractice?: boolean;     // explicit practice marker; if omitted, inferred from phase containing "practice"
  manipulation?: string;    // manipulation id
  overrides?: object;       // deep-merged into per-block config
}
```

### `manipulations[]`

```ts
{
  id: string;
  label?: string;
  overrides?: object;
  trialPlan?: {
    // alias: trial_plan
    schedule?: {
      mode?: "weighted" | "sequence" | "quota_shuffle" | "block_quota_shuffle";
      sequence?: Array<string | number>;
      withoutReplacement?: boolean;
      without_replacement?: boolean;
    };
    variants?: Array<{
      id?: string;
      label?: string;
      weight?: number;      // > 0, default 1
      overrides?: object;   // deep-merged into per-trial config
    }>;
  };
}
```

## 4. Runtime sections

## 4.1 `display`

Core:

```ts
{
  canvasWidth: number;
  canvasHeight: number;
  viewportPaddingPx?: number; // default 24
  backgroundColor?: string | number;

  beltColor?: string | number;
  beltHeight?: number;
  beltGap?: number;

  brickWidth?: number;
  brickHeight?: number;
  brickCornerRadius?: number;
  brickColor?: string | number;
  brickBorderColor?: string | number;
  brickShape?: "rect" | "rounded_rect" | "pill" | "diamond" | "hex" | "triangle" | "parallelogram" | "trapezoid";
}
```

Shape aliases accepted:

- `"square"` / `"rectangle"` -> `"rect"`
- `"rounded"` / `"rounded_rectangle"` -> `"rounded_rect"`

### `display.ui`

```ts
{
  showHUD?: boolean;
  hudFontFamily?: string;
  hudFontSize?: number;
  hudFontWeight?: number | string;
  hudPanel?: boolean;
  hudPanelColor?: string | number;
  hudPanelAlpha?: number;        // 0..1
  showTimer?: boolean;
  showRemainingBlocks?: boolean;
  showDroppedBlocks?: boolean;
  showPoints?: boolean;
  showDRT?: boolean;
}
```

### `display.performance`

```ts
{
  maxDevicePixelRatio?: number;  // default 1.5
  maxFrameDtMs?: number;         // default 50
  maxActiveEffects?: number;     // default 180
  antialias?: boolean;           // default false (sharper edges)
  pixelSnapBricks?: boolean;     // default false (smoother moving bricks)
  imageRendering?: string;       // default "crisp-edges"
}
```

### `display.spotlight`

```ts
{
  snapMode?: "screen" | "pixel" | "none"; // default "screen"
  cornerRadiusPx?: number;                 // default 10
  ringWidthPx?: number;                    // default 3
  ringColor?: string | number;             // default "#f8fafc"
  ringAlpha?: number;                      // 0..1, default 0.95
  signatureQuantizePx?: number;            // redraw threshold in px; default 1 for snapped, 0.25 for none
}
```

Notes:
- `snapMode: "screen"` mirrors conveyor screen-space snapping and uses renderer resolution, reducing visible spotlight stepping/judder.
- `snapMode: "none"` keeps fully subpixel spotlight motion (smoothest motion; potentially softer edges on low-DPR displays).

### `display.dueDateMarker`

```ts
{
  enable?: boolean;
  color?: string | number;
  widthPx?: number;
  heightPx?: number;
  alpha?: number; // 0..1
}
```

### `display.practiceFeedback`

Configures visual feedback for `hold_duration` practice.

```ts
{
  colorTooFast?: string | number;
  colorTooSlow?: string | number;
  colorGood?: string | number;
  goodThresholdMin?: number;
  goodThresholdMax?: number;
  bins?: Array<{
    min?: number;
    max?: number;
    label?: string;
    color?: string | number;
  }>;

  // Real-time progress circle
  showHoldProgressCircle?: boolean;
  holdProgressCircleRadius?: number;      // default 24
  holdProgressCircleThickness?: number;   // default 4
  holdProgressCircleColor?: string | number; // default "#3b82f6"
  holdProgressCircleColorOvertime?: string | number; // default "#ef4444"
  holdProgressCircleBgColor?: string | number; // default "#ffffff"
  holdProgressCircleBgAlpha?: number;     // default 0.2
}
```

### `display.endFurnace`

Supports `enable`, `offsetX`, and visual style values used by renderer presets:

- `wallColor`
- `wallShadeColor`
- `rimColor`
- `mouthColor`
- `emberColor`
- `style` (`"furnace" | "crusher" | "shredder" | "plasma_recycler"`)
- `bodyPanelLines` (bool)
- `hazardStripes` (bool), `hazardColorA`, `hazardColorB`
- `sideRivets` (bool)

### `display.missAnimation`

```ts
{
  mode?: "furnace";
  durationMs?: number;
  markerFlashMs?: number;
  flashColor?: string | number;
  disintegrate?: {
    shardCount?: number;
    durationMs?: number;
    gravityPxPerSec2?: number;
    speedMinPxPerSec?: number;
    speedMaxPxPerSec?: number;
    furnaceBias?: number;
  };
}
```

### `display.clearAnimation`

Optional points pop animation shown when a brick is cleared.

```ts
{
  enable?: boolean;
  timeoutMs?: number;             // pop lifetime in ms
  durationMs?: number;            // alias of timeoutMs
  risePx?: number;                // upward drift over lifetime
  startOffsetYPx?: number;        // initial vertical offset above brick center
  textColor?: string | number;
  textStrokeColor?: string | number;
  textStrokeThickness?: number;
  textFontFamily?: string;
  textFontWeight?: string | number;
  textMinSizePx?: number;         // clamp min for size-aware text
  textMaxSizePx?: number;         // clamp max for size-aware text
  textSizeFactor?: number;        // scales with brick height
  textShadowColor?: string | number;
  textShadowBlur?: number;
  textShadowDistance?: number;
  coin?: {
    enable?: boolean;
    showInPointsAnimation?: boolean;
    showInHud?: boolean;
    sizePx?: number;
    hudSizePx?: number;            // optional fixed HUD coin size; default auto from HUD cap height
    hudSizeScale?: number;         // multiplier for auto HUD size (default 0.95)
    gapPx?: number;
    rimColor?: string | number;
    bodyColor?: string | number;
    shineColor?: string | number;
    shadowColor?: string | number;
    symbolColor?: string | number;
    ridgeCount?: number;
  };
}
```

### `display.backgroundTexture`

```ts
{
  enable?: boolean;
  src?: string;                        // image mode
  renderMode?: "image" | "procedural_warehouse";
  style?: string;                      // built-in or custom style id
  styles?: Record<string, object>;     // optional style map by id
  alpha?: number;
  scale?: number;
  scrollFactor?: number;
  proceduralWarehouse?: {
    tileSizePx?: number;
    paverWidthPx?: number;
    paverHeightPx?: number;
    groutPx?: number;
    layout?: "grid" | "staggered";
    rowOffsetPx?: number;
    pattern?: "none" | "checker_alternating";
    alternationStrength?: number;
    variation?: number;
    edgeShadingAlpha?: number;
    noiseCount?: number;
    seamDashCount?: number;
    rivetCount?: number;
    dentCount?: number;
    crackCount?: number;
    baseColor?: string | number;
    groutColor?: string | number;
    seamDarkColor?: string | number;
    seamLightColor?: string | number;
    scratchColor?: string | number;
    rivetColor?: string | number;
  };
}
```

### `display.beltTexture`

```ts
{
  enable?: boolean;
  src?: string;                        // image mode
  renderMode?: "image" | "procedural_topdown";
  style?: string;                      // built-in or custom style id
  styles?: Record<string, object>;     // optional style map by id
  alpha?: number;
  scale?: number;
  scrollFactor?: number;
  scrollSnapMode?: "screen" | "texture" | "none"; // default "none"; "texture" keeps legacy seam snapping
  scrollRenderMode?: "auto" | "tiling"; // default "auto"; procedural_topdown uses seam-free redraw path unless forced to "tiling"
  proceduralTopdown?: {
    tileSizePx?: number;
    ribStepPx?: number;
    ribWidthPx?: number;
    sideBandPx?: number;
    sideCleatStepPx?: number;
    sideCleatLengthPx?: number;
    shadeAlpha?: number;
    baseColor?: string | number;
    shadeColor?: string | number;
    ribColor?: string | number;
    grooveColor?: string | number;
    sideCleatColor?: string | number;
    sideLineDarkColor?: string | number;
    sideLineLightColor?: string | number;
    scuffCount?: number;
    patchCount?: number;
    scuffColor?: string | number;
    patchColor?: string | number;
  };
  brickContactBand?: {
    enable?: boolean;
    topInsetPx?: number;
    topInsetRatio?: number;
    bottomInsetPx?: number;
    bottomInsetRatio?: number;
    offsetYPx?: number;
  };
}
```

### `display.brickTextureOverlay`

```ts
{
  enable?: boolean;
  style?: string; // default style id (e.g., "crate", "present", or custom)
  styles?: Record<string, object>; // per-style overrides
  pattern?: "wood_planks" | "gift_wrap" | "pizza" | "checkerboard" | "cardboard_block";
  baseFillColor?: string | number;
  baseFillAlpha?: number; // 0..1, can fully mask base brick color when 1
  alpha?: number;
  plankCount?: number;
  seamWidthPx?: number;
  grainCount?: number;
  nailRadiusPx?: number;
  insetPx?: number;
  topSheenAlpha?: number;
  seamColor?: string | number;
  highlightColor?: string | number;
  ribbonColor?: string | number;      // gift_wrap
  ribbonAlpha?: number;               // gift_wrap
  ribbonWidthRatio?: number;          // gift_wrap
  ribbonInsetPx?: number;             // gift_wrap
  bowBorderColor?: string | number;   // gift_wrap
  bowBorderAlpha?: number;            // gift_wrap
  bowBorderWidthPx?: number;          // gift_wrap
  paperPatternColor?: string | number; // gift_wrap
  paperPatternAlpha?: number;          // gift_wrap
  paperDotStepPx?: number;             // gift_wrap
  checkerColorA?: string | number;     // checkerboard
  checkerColorB?: string | number;     // checkerboard
  checkerCellPx?: number;              // checkerboard
  fiberColor?: string | number;        // cardboard_block
  fiberAlpha?: number;                 // cardboard_block
  fiberStepPx?: number;                // cardboard_block
  speckleColor?: string | number;      // cardboard_block
  speckleAlpha?: number;               // cardboard_block
  speckleCount?: number;               // cardboard_block
  tapeColor?: string | number;         // cardboard_block
  tapeAlpha?: number;                  // cardboard_block
  tapeWidthRatio?: number;             // cardboard_block
  tapeInsetPx?: number;                // cardboard_block
  tapeOrientation?: "vertical" | "horizontal" | "cross"; // cardboard_block
  sliceCount?: number;                // pizza
  toppingCount?: number;              // pizza
  crustColor?: string | number;       // pizza
  sauceColor?: string | number;       // pizza
  cheeseColor?: string | number;      // pizza
  toppingColor?: string | number;     // pizza
  sliceLineColor?: string | number;   // pizza
  labelPatch?: boolean;               // wood_planks
  labelPatchColor?: string | number;  // wood_planks
  labelPatchAlpha?: number;           // wood_planks
  labelPatchBorderColor?: string | number; // wood_planks
  labelBarcodeColor?: string | number;     // wood_planks
  bandColor?: string | number;        // wood_planks
  bandAlpha?: number;                 // wood_planks
  lockPlateColor?: string | number;   // wood_planks
  lockPlateAlpha?: number;            // wood_planks
}
```

### `display.preset` (Moray-style visual preset system)

```ts
{
  enable?: boolean;
  mode?: "none" | "fixed" | "random_per_trial";
  id?: string;                 // fixed mode
  fixedId?: string;            // fixed mode
  pool?: string[];             // random_per_trial mode
  presetOverrides?: Record<string, object>; // per-preset deep override
}
```

Built-in preset IDs:

- `warehouse_concrete_checker`
- `industrial_sleek_flat`
- `kraft_wood_packaging`
- `parcel_sorting_holiday`
- `cold_storage_blueprint`
- `nightshift_high_contrast`
- `lab_rivet_sorting_bay`
- `wood_corrugation_packline`
- `damaged_salvage_line`
- `salvage_shredder_bay`

Texture-forward preset convention:

- New presets above include `display.brickTextureOverlay.styles.target`, `.other`, and `.neutral`.
- You can bind these directly via `bricks.textureCategories[*].textureStyle`.

Built-in brick texture style IDs (global, usable without presets):

- `crate`
- `other_crate`
- `other_steel_case`
- `present`
- `target_present`
- `target_teal_present`
- `neutral_tote`
- `pizza`
- `target_pizza`
- `box`
- `checkerboard`
- `checker_board`
- `crate_damaged`
- `parcel_label`
- `parcel-label`
- `parcel_damaged`
- `chest`

Built-in warehouse floor procedural style IDs (`display.backgroundTexture.style`):

- `concrete_checker`
- `cold_blueprint`
- `lab_metal_rivet`
- `wood_corrugation`
- `damaged_salvage`
- `salvage_rivet`

Built-in conveyor procedural style IDs (`display.beltTexture.style`):

- `industrial_ribbed`
- `cold_blueprint_belt`
- `lab_ribbed`
- `wood_corrugation_belt`
- `damaged_patched_belt`
- `salvage_shredder_belt`

## 4.2 `conveyors`

```ts
{
  nConveyors: number;
  lengthPx: number | number[] | SamplerSpec;
  runtimeLengths?: number[]; // optional renderer override
  speedPxPerSec: number | SamplerSpec;
  dynamicSpeed?: {
    enable?: boolean;                 // default false
    intervalMs?: number | SamplerSpec; // ms between speed changes (sampled per conveyor)
    speedPxPerSec?: number | SamplerSpec; // sampled speed for each change event
    perConveyor?: Record<string, {
      enable?: boolean;
      intervalMs?: number | SamplerSpec;
      speedPxPerSec?: number | SamplerSpec;
    }>;
  };
}
```

`conveyors.dynamicSpeed` behavior:
- Off by default (`enable: false`): conveyor speed is sampled once at trial init and reused; no runtime speed resampling occurs.
- When enabled, each conveyor keeps its own independent timer and speed sampler.
- On each sampled interval boundary, the conveyor speed is resampled and applied immediately.
- `perConveyor` overrides are keyed by conveyor id (`"c0"`, `"c1"`, …) or string index (`"0"`, `"1"`, …).
- `perConveyor[*].enable` can turn dynamic speed on/off for individual conveyors while global `enable` remains unchanged.
- If `speedPxPerSec` is omitted inside `dynamicSpeed`, it falls back to `conveyors.speedPxPerSec`.

## 4.3 `bricks`

```ts
{
  completionMode: "single_click" | "multi_click" | "hold_duration" | "hover_to_clear" | "hold_to_clear" | "task_sequence" | string;
  completionParams?: {
    clicks_required?: number;        // multi_click
    target_hold_ms?: number;         // hold_duration
    hold_floor_ms?: number;           // hold_duration; holds shorter than this add zero progress
    progress_per_perfect?: number;   // hold_duration
    progress_curve?: number;         // hold_duration
    overshoot_tolerance_ms?: number; // hold_duration
    width_scaling?: boolean;         // hold_duration
    width_reference_px?: number;     // hold_duration
    width_scaling_exponent?: number; // hold_duration/task_sequence
    hover_process_rate_px_s?: number;// hover_to_clear; if unset, uses runtime `brick.speed`
    hold_process_rate_px_s?: number; // hold_to_clear; if unset, uses runtime `brick.speed`
    taskId?: string;                 // task_sequence; key into embeddedTasks
    progress_per_correct?: number;   // task_sequence; progress added by a correct embedded-task response
  };

  embeddedTasks?: {
    [taskId: string]: {
      type: "sternberg" | string;
      title?: string;
      letters?: string[];
      memorySetSize?: number;
      probePresentProbability?: number;
      memoryDurationMs?: number;
      retentionDelayMs?: number;
      feedbackDurationMs?: number;
      responseKeys?: { present?: string; absent?: string };
      keyReminder?: string;
      promptText?: string;
      showInstructions?: boolean;
    };
  };

  maxBricksPerTrial?: number;

  initialBricks?: number | { type: "fixed"; value: number };

  spawn: {
    ratePerSec?: number | SamplerSpec;
    interSpawnDist?: number | SamplerSpec | null;
    minSpacingPx?: number;
    byConveyor?: boolean;      // default true
    maxActivePerConveyor?: number;
  };

  forcedSet?: Array<object>;
  forcedSetPlan?: {
    enable?: boolean;
    count?: number | SamplerSpec;
    n?: number | SamplerSpec;
    defaults?: object;
    fields?: Record<string, ForcedPlanFieldSpec>;
  };

  interaction?: {
    targetingArea?: "brick" | "conveyor" | "spotlight";
    conveyorWideHitArea?:
      | boolean
      | {
          enable?: boolean;
        };
    spotlightWideHitArea?:
      | boolean
      | {
          enable?: boolean;
        };
  };

  colorCategories?: BrickCategorySpec[];
  widthCategories?: BrickCategorySpec[];
  borderColorCategories?: BrickCategorySpec[];
  shapeCategories?: BrickCategorySpec[];
  textureCategories?: BrickCategorySpec[];
}
```

`interaction` targeting behavior:
- Default is direct brick hit-testing.
- Preferred selector: `targetingArea`
  - `"brick"`: interact only on brick geometry (focused brick only when spotlight forced-order is active).
  - `"conveyor"`: interact anywhere on a conveyor lane; routes to front-most brick on that lane.
  - `"spotlight"`: interact anywhere inside the current spotlight area; routes to currently spotlighted brick.
- Legacy booleans remain supported:
  - `conveyorWideHitArea: true` (same as `targetingArea: "conveyor"`)
  - `spotlightWideHitArea: true` (same as `targetingArea: "spotlight"`)
- If `targetingArea` is set, it takes precedence over legacy booleans.

`hover_to_clear` runtime behavior:
- Bricks continue moving while hovered (normal conveyor advection still applies).
- Processing depletes visible width from the right edge at `hover_process_rate_px_s`.
- Depleted segments are fully removed visually (no translucent ghost body), while interaction bounds remain the full brick object until clear/drop.
- If `hover_process_rate_px_s` is not set, the runtime uses `brick.speed` (the sampled conveyor/brick px/s rate), so depletion rate matches forward progress by default.

`hold_to_clear` runtime behavior:
- Bricks continue moving while held (normal conveyor advection still applies).
- Processing depletes visible width while the mouse button is held at `hold_process_rate_px_s`.
- Works with all targeting areas (`brick`, `conveyor`, `spotlight`).
- If `hold_process_rate_px_s` is not set, the runtime uses `brick.speed`.

### `BrickCategorySpec`

Accepted keys include:

- `id`, `label`
- trait keys:
  - `color` / `colour`
  - `width`
  - `borderColor` / `border_color` / `border_colour`
  - `shape`
  - `textureStyle` / `texture_style` / `texture`
  - `brickLabel` / `brick_label`
  - `value`
  - `workDeadlineMs` / `work_deadline_ms`
  - `targetHoldMs` / `target_hold_ms`
  - `progressPerPerfect` / `progress_per_perfect`
- `assign` object with same trait keys

Trait values can be direct values or `SamplerSpec`.

### `forcedSet[]` entry keys

Supported keys (with aliases):

- position and conveyor:
  - `conveyorIndex` / `conveyor_index`
  - `x`, or `xFraction` / `x_fraction`
  - `rightEdge` / `right_edge`, or `rightEdgeFraction` / `right_edge_fraction`
- category picks:
  - `colorCategoryId` / `color_category_id`
  - `widthCategoryId` / `width_category_id`
  - `borderColorCategoryId` / `border_color_category_id`
  - `shapeCategoryId` / `shape_category_id`
  - `textureCategoryId` / `texture_category_id`
  - `categoryIds: { color, width, borderColor, shape, texture }`
- direct traits:
  - `color`, `colour`
  - `width`
  - `borderColor` / `border_color` / `border_colour`
  - `shape`
  - `label`
  - `value`
  - `isTarget` / `is_target`
  - `workDeadlineMs` / `work_deadline_ms`
  - `targetHoldMs` / `target_hold_ms`
  - `progressPerPerfect` / `progress_per_perfect`

### `forcedSetPlan.fields.*`

Each field can be:

- direct value
- sampler object
- list spec:

```ts
{
  values: unknown[];
  draw?: "with_replacement" | "without_replacement" | "sequence";
  mode?: same as draw;
  weights?: number[]; // normalized if using weighted list sampling
  without_replacement?: boolean;
  shuffle?: boolean;
}
```

`bricks.completionMode: "task_sequence"` behavior:
- A valid brick interaction launches `bricks.embeddedTasks[completionParams.taskId]` in a modal overlay while conveyor motion and the trial clock continue.
- Correct embedded-task responses add `progress_per_correct` progress, optionally width-scaled by `width_scaling`, `width_reference_px`, and `width_scaling_exponent`; incorrect responses are logged and add zero progress.
- The built-in `sternberg` embedded task uses letter memory sets, a delayed probe, configurable response keys, and a brief non-blocking feedback interval.

## 4.4 `drt`

```ts
{
  enable?: boolean;
  stim_type?: "visual" | "audio";
  stim_file_audio?: string;            // required for audio presentation
  stim_visual_config?: {
    shape?: string;                    // renderer interprets
    color?: string | number;
    size_px?: number;
    x?: number;
    y?: number;
  };
  key?: string;                        // supports "space"/"spacebar"/" "
  isi_sampler?: SamplerSpec;           // default uniform 3000..7000 ms
  response_deadline_ms?: number;       // default 1500
  audio?: { volume?: number };         // 0..1
}
```

## 4.5 `trial`

```ts
{
  seed?: number | string | "random" | "auto";
  mode?: "fixed_time" | "max_bricks";
  maxTimeSec?: number | null;          // used in fixed_time
  endDelayMs?: number;                 // global post-end delay (ms), default 0
  brickQuotaEndDelayMs?: number;       // post-end delay for "brick_quota_met" (ms), default 3000
  stopDrtOnBrickQuotaMet?: boolean;   // if true (trial-scoped DRT), stop DRT immediately when quota is met
  endDrtOnBrickQuotaMet?: boolean;    // alias of stopDrtOnBrickQuotaMet
  holdDurationPractice?: {
    requiredPresses?: number;          // for hold-duration practice runner, forces max_bricks quota
    fullWidthConveyor?: boolean;       // default true in hold-duration practice runner
    centerBrick?: boolean;             // default true in hold-duration practice runner
    hideHud?: boolean;                 // default true in hold-duration practice runner
    replenishDelayMs?: number;         // ms to keep post-release clear state before refilling (default 220)
    trialTimeMs?: number;              // alias of replenishDelayMs
    nextTrialDelayMs?: number;         // alias of replenishDelayMs
    useSpotlightWindow?: boolean;      // enable forced-order spotlight window during hold-duration practice
    spotlightWindow?: boolean;         // alias of useSpotlightWindow
  };
  forcedOrder?: {
    enable?: boolean;
    switchMode?: "on_clear" | "interval" | "interval_or_clear";
    switchIntervalMs?: number;         // default 8000
    switchOnDrop?: boolean;            // default true
    sequence?: number[];               // index order into forced-set brick list
    spotlightPadding?: number;         // default 18
    dimAlpha?: number;                 // default 0.45 (clamped 0..0.95)
    coverStory?: {
      enableAmmoCue?: boolean;
    };
  };
}
```

## 4.6 `experiment`

```ts
{
  startTrialsOn?: "space" | "click"; // preferred explicit trigger selector
  startTrialsOnSpace?: boolean;      // legacy alias for startTrialsOn: "space"
  startTrialsOnClick?: boolean;      // legacy alias for startTrialsOn: "click"
  startOverlay?: {
    text?: string;
    padding?: string;
    background?: string;
    border?: string;
    borderRadius?: string;
    boxShadow?: string;
    color?: string;
    fontSize?: string;
    buttonStyle?: {
      padding?: string;
      fontSize?: string;
      fontWeight?: string | number;
      border?: string;
      borderRadius?: string;
      color?: string;
      background?: string;
      minWidth?: string;
      minHeight?: string;
      outline?: string;
      boxShadow?: string;
    };
    buttonAutoFocus?: boolean;
    buttonPadding?: string;      // click start mode: button padding
    buttonFontSize?: string;     // click start mode: button font-size
    buttonFontWeight?: string | number;
    buttonBorder?: string;
    buttonBorderRadius?: string;
    buttonColor?: string;
    buttonBackground?: string;
    buttonMinWidth?: string;
    buttonMinHeight?: string;
  };
  showBetweenBlockSummary?: boolean; // currently not consumed in runtime
  statsPresentation?: {
    defaultScope?: "trial" | "block" | "experiment"; // default "trial"
    scopeByMetric?: {
      spawned?: "trial" | "block" | "experiment";
      cleared?: "trial" | "block" | "experiment";
      dropped?: "trial" | "block" | "experiment";
      points?: "trial" | "block" | "experiment";
    };
    reset?: Array<{
      at?: "block_start" | "block_end"; // default "block_end"
      scope?: "block" | "experiment";    // default "experiment"
      metrics?: Array<"spawned" | "cleared" | "dropped" | "points">; // default all metrics
      when?: {
        isPractice?: boolean;
        phaseIn?: string[];
        labelIn?: string[];
        manipulationIdIn?: string[];
      };
    }>;
  };
}
```

Example: show `cleared/dropped` per trial while keeping `points` cumulative across experiment,
then clear only experiment points after practice blocks:

```json
{
  "experiment": {
    "statsPresentation": {
      "defaultScope": "trial",
      "scopeByMetric": {
        "points": "experiment"
      },
      "reset": [
        {
          "at": "block_end",
          "scope": "experiment",
          "metrics": ["points"],
          "when": { "isPractice": true }
        }
      ]
    }
  }
}
```

## 4.7 `debug`

```ts
{
  pointerOverlay?: boolean;
  pointerConsole?: boolean;
  holdConsole?: boolean;
  performanceConsole?: boolean;       // if true, logs trial performance summary to console
  performanceFrameBudgetMs?: number;  // frame budget threshold used for overrun metrics (default 16.67)
  saveTrialLog?: boolean;
  printTrialLog?: boolean;
  trialLogPrefix?: string;
}
```

## 4.8 `difficultyModel`

Used by trial difficulty estimator:

```ts
{
  holdQualityMean?: number;         // 0..1 (default 0.5)
  hoverAcquireMs?: number;          // default 120
  hoverTrackingEfficiency?: number; // default 0.9
  avgClickIntervalMs?: number;      // default 240
  clickAcquireMs?: number;          // default 110
}
```

## 4.9 `selfReport` and `instructions`

- `selfReport` is allowed and preserved in config snapshots.
- `instructions` is consumed by Bricks UI flow:
  - `pages`/`introPages`/`intro`/`screens`: task intro pages
  - `preBlockPages`/`beforeBlockPages`/`beforeBlockScreens`: shown before each block starts
  - `postBlockPages`/`afterBlockPages`/`afterBlockScreens`: shown after each block ends
  - `endPages`/`outroPages`/`end`/`outro`: shown after all blocks
  - `blockIntroTemplate`: optional templated text shown on block intro cards
  - `showBlockLabel`: optional bool (default true) for block intro/post headers
  - `preBlockBeforeBlockIntro`: optional bool (default false) to place pre-block pages before block intro card
- Instruction pages can be plain strings or objects like `{ title, text }` / `{ title, html }`.
- Page `title`, `text`, and `html` support `{dot.path}` interpolation against merged Bricks config values (and resolver-backed values), e.g. `{bricks.completionParams.target_hold_ms}`.
- Post-trial survey presets (`surveys.postTrial`) support display toggles:
  - `showQuestionNumbers?: boolean` (set `false` to hide `Q1` / `1.`)
  - `showRequiredAsterisk?: boolean` (set `false` to hide required `*` marker)
  - `questionBorder?: string` (for example `"none"` to remove question frame border)
  - `questionBorderRadius?: string` (for example `"0"` to square corners)
  - `submitButtonStyle?: { ... }` (same style fields as core continue buttons)
  - `autoFocusSubmitButton?: boolean`

## 5. SamplerSpec grammar

Fields that accept sampler specs use this shape:

```ts
type SamplerSpec =
  | { type: "fixed"; value: unknown }
  | { type: "uniform"; min: number; max: number }
  | { type: "normal"; mu: number; sd: number; min?: number; max?: number }
  | { type: "truncnorm"; mu: number; sd: number; min?: number; max?: number }
  | { type: "exponential"; lambda: number; min?: number; max?: number }
  | { type: "poisson"; lambda: number; min?: number; max?: number }
  | { type: "negative_binomial" | "negbin"; mu: number; k?: number; size?: number; dispersion?: number; r?: number; min?: number; max?: number }
  | {
      type: "list";
      values: unknown[];
      weights?: number[]; // must sum to 1
      draw?: "with_replacement" | "without_replacement" | "sequence";
      mode?: string;
      without_replacement?: boolean;
      withoutReplacement?: boolean;
      shuffle?: boolean;
    };
```

## 6. Example (compact, valid shape)

```json
{
  "display": {
    "canvasWidth": 1200,
    "canvasHeight": 760,
    "preset": {
      "mode": "fixed",
      "id": "parcel_sorting_holiday"
    },
    "ui": { "showHUD": true, "showTimer": true, "showDRT": true }
  },
  "conveyors": {
    "nConveyors": 4,
    "lengthPx": { "type": "uniform", "min": 860, "max": 1160 },
    "speedPxPerSec": { "type": "fixed", "value": 42 }
  },
  "bricks": {
    "completionMode": "hold_duration",
    "completionParams": {
      "target_hold_ms": 500,
      "progress_per_perfect": 0.175
    },
    "colorCategories": [
      { "id": "NeutralA", "color": "#6b7280" },
      { "id": "NeutralB", "color": "#6b7280" }
    ],
    "textureCategories": [
      { "id": "Target", "textureStyle": "target", "value": 15, "label": "High Value" },
      { "id": "Other", "textureStyle": "other", "value": 5, "label": "Distractor" }
    ],
    "forcedSetPlan": {
      "enable": true,
      "count": 4,
      "fields": {
        "textureCategoryId": { "values": ["Target", "Other", "Other", "Other"] }
      }
    },
    "maxBricksPerTrial": 4,
    "spawn": {
      "ratePerSec": { "type": "fixed", "value": 0 },
      "byConveyor": true,
      "maxActivePerConveyor": 1
    }
  },
  "drt": {
    "enable": true,
    "stim_type": "visual",
    "key": "space",
    "isi_sampler": { "type": "uniform", "min": 3000, "max": 5000 },
    "response_deadline_ms": 2500
  },
  "trial": {
    "mode": "fixed_time",
    "maxTimeSec": 40,
    "forcedOrder": { "enable": true, "switchMode": "on_clear", "sequence": [1, 0, 2, 3] }
  },
  "blocks": [{ "label": "Block 1", "trials": 4, "manipulation": "m1" }],
  "manipulations": [{ "id": "m1", "overrides": {} }]
}
```
