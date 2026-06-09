import { createCoreRng } from '@experiments/core';
import type { CoreRng } from '@experiments/core';
import { createSampler } from './sampling.js';
import { getBrickVisibleWidth } from './brick_logic.js';

const BRICK_STATUS = {
  ACTIVE: 'active',
  CLEARED: 'cleared',
  DROPPED: 'dropped'
} as const;

interface BrickRecord {
  id: string;
  conveyorId: string;
  status: string;
  x: number;
  y: number;
  speed: number;
  width: number;
  initialWidth: number;
  height: number;
  createdAt: number;
  clicks: number;
  holds: number;
  taskAttempts: number;
  taskCompletions: number;
  clearProgress: number;
  isHovered: boolean;
  isHeld: boolean;
  color: string;
  borderColor: string | null;
  shape: string;
  textureStyle: string | null;
  colorCategoryId: string | null;
  colorCategoryLabel: string | null;
  widthCategoryId: string | null;
  widthCategoryLabel: string | null;
  borderColorCategoryId: string | null;
  borderColorCategoryLabel: string | null;
  shapeCategoryId: string | null;
  shapeCategoryLabel: string | null;
  textureCategoryId: string | null;
  textureCategoryLabel: string | null;
  value: number;
  workDeadlineMs: number | null;
  targetHoldMs: number | null;
  progressPerPerfect: number | null;
  forcedSetIndex: number | null;
  label: string | null;
}

interface ConveyorRecord {
  id: string;
  index: number;
  y: number;
  length: number;
  speed: number;
  interSpawnSampler: () => number;
  nextSpawnAt: number;
  activeIds: string[];
  dynamicSpeed: {
    enabled: boolean;
    speedSampler: (() => unknown) | null;
    intervalSamplerMs: (() => number) | null;
    nextChangeAtMs: number | null;
  } | null;
}

interface CategoryEntry {
  id: string;
  label: string | null;
  dimension: string;
  traits: Record<string, unknown>;
}

interface CategoryPalettes {
  color: CategoryEntry[];
  width: CategoryEntry[];
  borderColor: CategoryEntry[];
  shape: CategoryEntry[];
  texture: CategoryEntry[];
}

interface ForcedControlState {
  enabled: boolean;
  switchMode: string;
  switchIntervalMs: number;
  switchOnDrop: boolean;
  sequence: unknown[] | null;
  spotlightPadding: number;
  spotlightWidth: number | null;
  spotlightHeight: number | null;
  dimAlpha: number;
  coverStory: { enableAmmoCue: boolean };
  activeOrderIndex: number;
  activeBrickId: string | null;
  nextSwitchAtMs: number | null;
  orderedBrickIds: string[];
}

interface GameStats {
  spawned: number;
  cleared: number;
  dropped: number;
  clickErrors: number;
  points: number;
}

interface GameEvent {
  time: number;
  type: string;
  [key: string]: unknown;
}

interface PointerPos {
  x?: number | null;
  y?: number | null;
}

interface CategorySelections {
  color: CategoryEntry | null;
  width: CategoryEntry | null;
  borderColor: CategoryEntry | null;
  shape: CategoryEntry | null;
  texture: CategoryEntry | null;
}

interface ResolvedBrickTraits {
  categories: CategorySelections;
  traits: Record<string, unknown>;
}

interface BrickCreationOptions {
  categories?: Record<string, any> | null;
  traits?: Record<string, unknown> | null;
  metadata?: Record<string, unknown> | null;
}

interface SpawnBrickOptions extends BrickCreationOptions {
  x?: number;
  reason?: string;
  bypassSpacing?: boolean;
}

/**
 * Represents the trial-level game state, including conveyors, bricks, and
 * high-level statistics. Rendering and jsPsych plugin orchestrate updates
 * via the public methods exposed here.
 */
export class GameState {
  public activeBricks: BrickRecord[];
  config: Record<string, any>;
  onEvent: (event: GameEvent) => void;
  rng: CoreRng;
  samplerCache: WeakMap<object, () => unknown>;
  elapsed: number;
  events: GameEvent[];
  stats: GameStats;
  bricks: Map<string, BrickRecord>;
  conveyors: ConveyorRecord[];
  conveyorsById: Map<string, ConveyorRecord>;
  spawnControllers: unknown[];
  pendingDropVisuals: Record<string, unknown>[];
  pendingClearVisuals: Record<string, unknown>[];
  nextBrickId: number;
  globalInterSpawnSampler: () => number;
  nextGlobalSpawnAt: number;
  defaultConveyorLength: number;
  categoryPalettes: CategoryPalettes;
  brickCategories: CategoryEntry[];
  forcedControl: ForcedControlState;
  hasDynamicConveyorSpeed: boolean;
  private initialPoints: number;

  constructor(config: Record<string, any>, { onEvent, seed, initialPoints }: { onEvent?: (event: GameEvent) => void; seed?: unknown; initialPoints?: number } = {}) {
    this.config = config;
    this.onEvent = typeof onEvent === 'function' ? onEvent : () => {};
    this.rng = createCoreRng(seed ?? config?.trial?.seed);
    this.samplerCache = new WeakMap();
    this.elapsed = 0;
    this.initialPoints = Number.isFinite(initialPoints) ? Number(initialPoints) : 0;

    this.events = [];
    this.stats = {
      spawned: 0,
      cleared: 0,
      dropped: 0,
      clickErrors: 0,
      points: 0
    };

    this.bricks = new Map();
    this.activeBricks = [];
    this.conveyors = [];
    this.conveyorsById = new Map();
    this.spawnControllers = [];
    this.pendingDropVisuals = [];
    this.pendingClearVisuals = [];
    this.nextBrickId = 0;
    this.globalInterSpawnSampler = this._makeInterSpawnSampler(this.config?.bricks?.spawn || {});
    this.nextGlobalSpawnAt = 0;
    this.defaultConveyorLength = this.config.display?.canvasWidth ?? 1000;
    this.categoryPalettes = this._prepareBrickCategories();
    this.brickCategories = this.categoryPalettes.color;
    this.forcedControl = this._buildForcedControlConfig();
    this.hasDynamicConveyorSpeed = false;
    this._initConveyors();
    this._initBricks();
    this._initForcedControl();
  }

  _log(type: string, payload: Record<string, unknown> = {}) {
    const event = {
      time: this.elapsed,
      type,
      ...payload
    };
    this.events.push(event);
    this.onEvent(event);
  }

  _brickEventPayload(brick: BrickRecord): Record<string, unknown> {
    return {
      active_brick_id: brick.id,
      brick_id: brick.id,
      conveyor_id: brick.conveyorId,
      color: brick.color,
      border_color: brick.borderColor,
      shape: brick.shape,
      texture_style: brick.textureStyle,
      color_category_id: brick.colorCategoryId,
      color_category_label: brick.colorCategoryLabel,
      width_category_id: brick.widthCategoryId,
      width_category_label: brick.widthCategoryLabel,
      border_color_category_id: brick.borderColorCategoryId,
      border_color_category_label: brick.borderColorCategoryLabel,
      shape_category_id: brick.shapeCategoryId,
      shape_category_label: brick.shapeCategoryLabel,
      texture_category_id: brick.textureCategoryId,
      texture_category_label: brick.textureCategoryLabel,
      value: brick.value,
      target_hold_ms: brick.targetHoldMs,
      progress_per_perfect: brick.progressPerPerfect,
      forced_set_index: brick.forcedSetIndex,
      label: brick.label,
      brick_x: brick.x,
      brick_y: brick.y,
      brick_width: brick.width,
      brick_height: brick.height,
    };
  }

  _initConveyors() {
    const cfg = this.config;
    const n = cfg.conveyors.nConveyors;
    const beltHeight = cfg.display.beltHeight;
    const gap = cfg.display.beltGap;
    const totalHeight = n * beltHeight + (n - 1) * gap;
    const topOffset = (cfg.display.canvasHeight - totalHeight) / 2;
    const explicitLengths = Array.isArray(cfg.conveyors.lengthPx) ? cfg.conveyors.lengthPx : null;
    const lengthSampler = explicitLengths ? null : this._makeLengthSampler(cfg.conveyors.lengthPx);
    const speedSampler = createSampler(cfg.conveyors.speedPxPerSec, this.rng);
    const dynamicSpeedCfg = this._resolveDynamicConveyorSpeedConfig();
    const interSpawnSampler = this._makeInterSpawnSampler(cfg.bricks.spawn);
    const configuredBrickWidth = Number(cfg.display?.brickWidth);
    const brickWidth = Number.isFinite(configuredBrickWidth) ? Math.max(8, configuredBrickWidth) : 80;
    const minLength = brickWidth * 2;
    const fallbackLength = Number.isFinite(Number(cfg.display?.canvasWidth))
      ? Math.max(minLength, Number(cfg.display.canvasWidth))
      : Math.max(minLength, 1000);
    let defaultLength = null;
    for (let i = 0; i < n; i += 1) {
      const sampledLength = explicitLengths
        ? Number(explicitLengths[i] ?? explicitLengths[explicitLengths.length - 1])
        : Number(lengthSampler!());
      const length = Number.isFinite(sampledLength)
        ? Math.max(minLength, sampledLength)
        : fallbackLength;
      const speed = Math.max(0, Number(speedSampler()));
      const conveyor: ConveyorRecord = {
        id: `c${i}`,
        index: i,
        y: topOffset + i * (beltHeight + gap),
        length,
        speed,
        interSpawnSampler,
        nextSpawnAt: 0,
        activeIds: [],
        dynamicSpeed: null
      };
      conveyor.dynamicSpeed = this._buildConveyorDynamicSpeedState(conveyor, dynamicSpeedCfg, cfg.conveyors.speedPxPerSec);
      if (conveyor.dynamicSpeed?.enabled) {
        this.hasDynamicConveyorSpeed = true;
      }
      if (defaultLength === null) {
        defaultLength = length;
      }
      this.conveyors.push(conveyor);
      this.conveyorsById.set(conveyor.id, conveyor);
    }
    if (defaultLength !== null) {
      this.defaultConveyorLength = defaultLength;
    }
  }

  _resolveDynamicConveyorSpeedConfig(): Record<string, any> | null {
    const raw = this.config?.conveyors?.dynamicSpeed ?? this.config?.conveyors?.dynamic_speed;
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
      return null;
    }
    return raw as Record<string, any>;
  }

  _resolvePerConveyorDynamicSpeedOverride(
    dynamicCfg: Record<string, any> | null,
    conveyor: ConveyorRecord
  ): Record<string, any> | null {
    if (!dynamicCfg) {
      return null;
    }
    const map = dynamicCfg.perConveyor ?? dynamicCfg.per_conveyor;
    if (!map || typeof map !== 'object' || Array.isArray(map)) {
      return null;
    }
    const byId = map[conveyor.id];
    if (byId && typeof byId === 'object' && !Array.isArray(byId)) {
      return byId as Record<string, any>;
    }
    const byIndex = map[String(conveyor.index)] ?? map[conveyor.index];
    if (byIndex && typeof byIndex === 'object' && !Array.isArray(byIndex)) {
      return byIndex as Record<string, any>;
    }
    return null;
  }

  _makeIntervalSamplerMs(spec: unknown): (() => number) | null {
    if (typeof spec === 'number' && Number.isFinite(spec)) {
      const fixed = Number(spec);
      return () => fixed;
    }
    if (spec && typeof spec === 'object' && !Array.isArray(spec)) {
      try {
        const sampler = createSampler(spec as Record<string, unknown>, this.rng);
        return () => Number(sampler());
      } catch (error) {
        console.warn('Invalid dynamic conveyor interval sampler spec; ignoring dynamic conveyor speed.', spec, error);
        return null;
      }
    }
    return null;
  }

  _buildConveyorDynamicSpeedState(
    conveyor: ConveyorRecord,
    dynamicCfg: Record<string, any> | null,
    fallbackSpeedSpec: unknown,
  ): ConveyorRecord['dynamicSpeed'] {
    if (!dynamicCfg) {
      return null;
    }
    const override = this._resolvePerConveyorDynamicSpeedOverride(dynamicCfg, conveyor);
    const globalEnable = dynamicCfg.enable === true;
    const localEnable = override && typeof override.enable === 'boolean' ? override.enable : null;
    const enabled = localEnable ?? globalEnable;
    if (!enabled) {
      return null;
    }

    const intervalSpec = override?.intervalMs ?? override?.interval_ms ?? dynamicCfg.intervalMs ?? dynamicCfg.interval_ms;
    const intervalSamplerMs = this._makeIntervalSamplerMs(intervalSpec);
    if (!intervalSamplerMs) {
      return null;
    }

    const speedSpec = override?.speedPxPerSec
      ?? override?.speed_px_per_sec
      ?? dynamicCfg.speedPxPerSec
      ?? dynamicCfg.speed_px_per_sec
      ?? fallbackSpeedSpec;
    let speedSampler: (() => unknown) | null = null;
    try {
      speedSampler = createSampler(speedSpec, this.rng);
    } catch (error) {
      console.warn('Invalid dynamic conveyor speed sampler spec; ignoring dynamic conveyor speed.', speedSpec, error);
      return null;
    }

    const initialDelayMs = Number(intervalSamplerMs());
    if (!Number.isFinite(initialDelayMs)) {
      return null;
    }
    return {
      enabled: true,
      speedSampler,
      intervalSamplerMs,
      nextChangeAtMs: this.elapsed + Math.max(1, initialDelayMs),
    };
  }

  _updateDynamicConveyorSpeeds() {
    if (!this.hasDynamicConveyorSpeed) {
      return;
    }
    for (const conveyor of this.conveyors) {
      const dynamic = conveyor.dynamicSpeed;
      if (!dynamic?.enabled || dynamic.nextChangeAtMs === null) {
        continue;
      }
      let guard = 0;
      while (dynamic.nextChangeAtMs !== null && this.elapsed >= dynamic.nextChangeAtMs && guard < 8) {
        const prevSpeed = conveyor.speed;
        let sampledSpeed = prevSpeed;
        try {
          const next = Number(dynamic.speedSampler ? dynamic.speedSampler() : prevSpeed);
          if (Number.isFinite(next)) {
            sampledSpeed = Math.max(0, next);
          }
        } catch (error) {
          console.warn('Dynamic conveyor speed sampling failed; keeping previous speed.', error);
        }
        conveyor.speed = sampledSpeed;
        this._log('conveyor_speed_changed', {
          conveyor_id: conveyor.id,
          conveyor_index: conveyor.index,
          speed_px_s_prev: prevSpeed,
          speed_px_s_next: sampledSpeed,
        });

        const delayMs = Number(dynamic.intervalSamplerMs ? dynamic.intervalSamplerMs() : Number.POSITIVE_INFINITY);
        if (!Number.isFinite(delayMs)) {
          dynamic.nextChangeAtMs = null;
          break;
        }
        dynamic.nextChangeAtMs += Math.max(1, delayMs);
        guard += 1;
      }
      if (guard >= 8 && dynamic.nextChangeAtMs !== null && this.elapsed >= dynamic.nextChangeAtMs) {
        dynamic.nextChangeAtMs = this.elapsed + 1;
      }
    }
  }

  _initBricks() {
    const hasConfiguredSet = this._initForcedBricks();
    if (hasConfiguredSet) {
      return;
    }
    const cfg = this.config;
    const initialCount = Math.max(0, Math.floor(this._resolveValue(cfg.bricks.initialBricks)));
    if (initialCount === 0) {
      return;
    }
    const configuredBrickWidth = Number(cfg.display?.brickWidth);
    const brickWidth = Number.isFinite(configuredBrickWidth) ? Math.max(8, configuredBrickWidth) : 80;
    for (let i = 0; i < initialCount; i += 1) {
      const conveyor = this.conveyors[i % this.conveyors.length];
      const fraction = (i + 1) / (initialCount + 1);
      const length = Number(conveyor.length) - brickWidth;
      const x = Math.max(0, fraction * length);
      this._spawnBrick(conveyor, { x, reason: 'initial' });
    }
  }

  _initForcedBricks() {
    const set = this._materializeForcedSet();
    if (set.length === 0) {
      return false;
    }
    set.forEach((entry: Record<string, any>, index: number) => {
      const conveyorIndexSpec = entry?.conveyorIndex ?? entry?.conveyor_index ?? 0;
      const conveyorIndexRaw = Number(this._sampleField(conveyorIndexSpec));
      const conveyorIndex = Number.isFinite(conveyorIndexRaw)
        ? Math.max(0, Math.min(this.conveyors.length - 1, Math.floor(conveyorIndexRaw)))
        : 0;
      const conveyor = this.conveyors[conveyorIndex];
      if (!conveyor) {
        return;
      }
      const sampledWidth = this._sampleField(entry?.width ?? entry?.processingWidthPx ?? entry?.processing_width_px);
      const entryWidthRaw = Number(sampledWidth);
      const entryWidth = Number.isFinite(entryWidthRaw)
        ? Math.max(8, entryWidthRaw)
        : Math.max(8, Number(this.config.display.brickWidth) || 80);
      const maxX = Math.max(0, conveyor.length - entryWidth);
      const xRaw = Number(this._sampleField(entry?.x));
      const xFractionRaw = Number(this._sampleField(entry?.xFraction ?? entry?.x_fraction));
      const rightEdgeRaw = Number(this._sampleField(entry?.rightEdge ?? entry?.right_edge));
      const rightEdgeFractionRaw = Number(this._sampleField(entry?.rightEdgeFraction ?? entry?.right_edge_fraction));
      const x = Number.isFinite(xRaw)
        ? Math.max(0, Math.min(maxX, xRaw))
        : Number.isFinite(rightEdgeRaw)
          ? Math.max(0, Math.min(maxX, rightEdgeRaw - entryWidth))
          : Number.isFinite(rightEdgeFractionRaw)
            ? Math.max(0, Math.min(maxX, rightEdgeFractionRaw * conveyor.length - entryWidth))
        : Number.isFinite(xFractionRaw)
          ? Math.max(0, Math.min(maxX, xFractionRaw * maxX))
          : (index + 1) / (set.length + 1) * maxX;
      const sampledValue = this._sampleField(entry?.value);
      const sampledWorkDeadlineMs = this._sampleField(entry?.workDeadlineMs ?? entry?.work_deadline_ms);
      const sampledTargetHoldMs = this._sampleField(entry?.targetHoldMs ?? entry?.target_hold_ms);
      const sampledProgressPerPerfect = this._sampleField(entry?.progressPerPerfect ?? entry?.progress_per_perfect);
      const categories = this._resolveCategorySelectionsForEntry(entry);
      this._spawnBrick(conveyor, {
        x,
        reason: 'forced_set',
        bypassSpacing: true,
        categories,
        traits: {
          color: entry?.color ?? entry?.colour ?? null,
          width: Number.isFinite(entryWidthRaw) ? entryWidth : null,
          borderColor: entry?.borderColor ?? entry?.border_colour ?? entry?.border_color ?? null,
          shape: entry?.shape ?? null,
          textureStyle: entry?.textureStyle ?? entry?.texture_style ?? entry?.texture ?? null
        } as Record<string, unknown>,
        metadata: {
          forcedSetIndex: index,
          label: entry?.label ?? null,
          value: Number.isFinite(Number(sampledValue)) ? Number(sampledValue) : null,
          workDeadlineMs: Number.isFinite(Number(sampledWorkDeadlineMs))
            ? Number(sampledWorkDeadlineMs)
            : null,
          targetHoldMs: Number.isFinite(Number(sampledTargetHoldMs))
            ? Number(sampledTargetHoldMs)
            : null,
          progressPerPerfect: Number.isFinite(Number(sampledProgressPerPerfect))
            ? Number(sampledProgressPerPerfect)
            : null
        } as Record<string, unknown>
      });
    });
    return true;
  }

  _materializeForcedSet() {
    const bricksCfg = this.config?.bricks || {};
    const plan = bricksCfg?.forcedSetPlan;
    if (plan && typeof plan === 'object' && plan.enable !== false) {
      const generated = this._generateForcedSetFromPlan(plan);
      if (generated.length > 0) {
        return generated;
      }
    }
    return Array.isArray(bricksCfg?.forcedSet) ? bricksCfg.forcedSet : [];
  }

  _generateForcedSetFromPlan(plan: Record<string, any>) {
    const countRaw = Number(this._sampleField(plan.count ?? plan.n ?? 0));
    const count = Number.isFinite(countRaw) ? Math.max(0, Math.floor(countRaw)) : 0;
    if (count <= 0) {
      return [];
    }
    const defaults = plan.defaults && typeof plan.defaults === 'object' ? plan.defaults : {};
    const fields = plan.fields && typeof plan.fields === 'object' ? plan.fields : {};
    const resolvers: Record<string, (index: number) => unknown> = Object.entries(fields).reduce((acc: Record<string, (index: number) => unknown>, [fieldKey, fieldSpec]) => {
      acc[fieldKey] = this._createForcedPlanFieldResolver(fieldSpec);
      return acc;
    }, {});
    const output: Record<string, unknown>[] = [];
    for (let i = 0; i < count; i += 1) {
      const entry: Record<string, unknown> = {
        ...defaults
      };
      Object.entries(resolvers).forEach(([fieldKey, resolver]) => {
        entry[fieldKey] = resolver(i);
      });
      output.push(entry);
    }
    return output;
  }

  _createForcedPlanFieldResolver(fieldSpec: unknown): (index: number) => unknown {
    if (fieldSpec && typeof fieldSpec === 'object' && !Array.isArray(fieldSpec)) {
      const spec = fieldSpec as Record<string, any>;
      if (Array.isArray(spec.values)) {
        const values = spec.values.slice();
        if (values.length === 0) {
          return () => null;
        }
        const drawMode = String(spec.draw ?? spec.mode ?? 'with_replacement').toLowerCase();
        if (drawMode === 'sequence') {
          return (index: number) => values[index % values.length];
        }
        try {
          const sampler = createSampler({
            type: 'list',
            values,
            weights: spec.weights,
            draw: spec.draw,
            mode: spec.mode,
            without_replacement: spec.without_replacement,
            shuffle: spec.shuffle
          }, this.rng);
          return () => sampler();
        } catch (error) {
          console.warn('Invalid forced-set list field spec; falling back to uniform with replacement.', spec, error);
          return () => values[Math.floor(this.rng.nextRange(0, values.length))];
        }
      }
      if (typeof spec.type === 'string') {
        return () => this._sampleField(spec);
      }
    }
    return () => fieldSpec;
  }

  _sampleField(spec: unknown): unknown {
    if (spec && typeof spec === 'object' && !Array.isArray(spec) && (typeof (spec as Record<string, unknown>).type === 'string')) {
      try {
        let sampler = this.samplerCache.get(spec);
        if (!sampler) {
          sampler = createSampler(spec as Record<string, unknown>, this.rng);
          this.samplerCache.set(spec, sampler);
        }
        return sampler();
      } catch (error) {
        console.warn('Invalid forced-set sampler spec; falling back to raw value.', spec, error);
        return (spec as Record<string, unknown>).value ?? null;
      }
    }
    return spec;
  }

  _resolveValue(spec: unknown): number {
    if (typeof spec === 'number') {
      return spec;
    }
    if (spec && typeof spec === 'object') {
      const s = spec as Record<string, unknown>;
      if (s.type === 'fixed') {
        return Number(s.value);
      }
    }
    return 0;
  }

  _prepareBrickCategories() {
    const normalizePalette = (entries: unknown, dimension: string, featureExtractor: (entry: Record<string, any>) => Record<string, unknown> | null): CategoryEntry[] => {
      if (!Array.isArray(entries) || entries.length === 0) {
        return [];
      }
      return entries
        .map((entry, index) => {
          if (!entry || typeof entry !== 'object') {
            return null;
          }
          const baseTraits = featureExtractor(entry);
          if (!baseTraits) {
            return null;
          }
          const assignTraits = entry.assign && typeof entry.assign === 'object'
            ? this._collectCategoryTraitSpecs(entry.assign)
            : {};
          return {
            id: entry.id ?? `${dimension}${index + 1}`,
            label: entry.label ?? null,
            dimension,
            traits: {
              ...baseTraits,
              ...this._collectCategoryTraitSpecs(entry),
              ...assignTraits
            }
          };
        })
        .filter((item): item is CategoryEntry => Boolean(item));
    };

    return {
      color: normalizePalette(this.config?.bricks?.colorCategories, 'color', (entry: Record<string, any>) => {
        const color = entry.color ?? entry.colour ?? null;
        if (color === null || color === undefined) {
          return null;
        }
        return { color };
      }),
      width: normalizePalette(this.config?.bricks?.widthCategories, 'width', (entry: Record<string, any>) => {
        const width = entry.width;
        const isSampler = this._isSamplerSpec(width);
        if (!isSampler && !Number.isFinite(Number(width))) {
          return null;
        }
        return { width };
      }),
      borderColor: normalizePalette(this.config?.bricks?.borderColorCategories, 'borderColor', (entry: Record<string, any>) => {
        const borderColor = entry.borderColor ?? entry.border_colour ?? entry.border_color ?? null;
        if (borderColor === null || borderColor === undefined) {
          return null;
        }
        return { borderColor };
      }),
      shape: normalizePalette(this.config?.bricks?.shapeCategories, 'shape', (entry: Record<string, any>) => {
        const shape = entry.shape;
        const isSampler = this._isSamplerSpec(shape);
        const normalized = isSampler ? shape : this._normalizeBrickShape(shape);
        if (!normalized) {
          return null;
        }
        return { shape: normalized };
      }),
      texture: normalizePalette(this.config?.bricks?.textureCategories, 'texture', (entry: Record<string, any>) => {
        const textureStyle = entry.textureStyle ?? entry.texture_style ?? entry.texture ?? null;
        if (textureStyle === null || textureStyle === undefined) {
          return null;
        }
        return { textureStyle };
      })
    };
  }

  _normalizeBrickShape(rawShape: unknown): string | null {
    if (typeof rawShape !== 'string') {
      return null;
    }
    const normalized = rawShape.trim().toLowerCase();
    if (!normalized) {
      return null;
    }
    const aliases: Record<string, string> = {
      square: 'rect',
      rectangle: 'rect',
      rounded: 'rounded_rect',
      rounded_rectangle: 'rounded_rect'
    };
    return aliases[normalized] ?? normalized;
  }

  _isSamplerSpec(value: unknown): boolean {
    return Boolean(value && typeof value === 'object' && !Array.isArray(value) && typeof (value as Record<string, unknown>).type === 'string');
  }

  _collectCategoryTraitSpecs(source: unknown): Record<string, unknown> {
    if (!source || typeof source !== 'object') {
      return {};
    }
    const src = source as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    const copyRaw = (keys: string[], targetKey: string, transform: (value: unknown) => unknown = (value: unknown) => value) => {
      const key = keys.find((candidate: string) => src[candidate] !== undefined && src[candidate] !== null);
      if (!key) {
        return;
      }
      const rawValue = src[key];
      if (!(typeof rawValue === 'string' || typeof rawValue === 'number' || this._isSamplerSpec(rawValue))) {
        return;
      }
      const value = transform(rawValue);
      if (value === null || value === undefined || value === '') {
        return;
      }
      out[targetKey] = value;
    };

    copyRaw(['color', 'colour'], 'color');
    copyRaw(['borderColor', 'border_colour', 'border_color'], 'borderColor');
    copyRaw(['shape'], 'shape');
    copyRaw(['textureStyle', 'texture_style', 'texture'], 'textureStyle');
    copyRaw(['brickLabel', 'brick_label'], 'label');

    copyRaw(['width'], 'width');
    copyRaw(['value'], 'value');
    copyRaw(['workDeadlineMs', 'work_deadline_ms'], 'workDeadlineMs');
    copyRaw(['targetHoldMs', 'target_hold_ms'], 'targetHoldMs');
    copyRaw(['progressPerPerfect', 'progress_per_perfect'], 'progressPerPerfect');
    return out;
  }

  _materializeBrickTraits(traitSpecs: unknown): Record<string, unknown> {
    const specs: Record<string, unknown> = traitSpecs && typeof traitSpecs === 'object' ? traitSpecs as Record<string, unknown> : {};
    const out: Record<string, unknown> = {};
    const readString = (key: string, transform: (value: string) => string | null = (value: string) => value) => {
      if (specs[key] === undefined || specs[key] === null) {
        return;
      }
      const sampled = this._sampleField(specs[key]);
      if (typeof sampled !== 'string') {
        return;
      }
      const value = transform(sampled);
      if (typeof value === 'string' && value) {
        out[key] = value;
      }
    };
    const readNumber = (key: string, { min = null, max = null }: { min?: number | null; max?: number | null } = {}) => {
      if (specs[key] === undefined || specs[key] === null) {
        return;
      }
      const sampled = this._sampleField(specs[key]);
      const value = Number(sampled);
      if (!Number.isFinite(value)) {
        return;
      }
      let next = value;
      if (min !== null) {
        next = Math.max(min, next);
      }
      if (max !== null) {
        next = Math.min(max, next);
      }
      out[key] = next;
    };

    readString('color');
    readString('borderColor');
    readString('label');
    readString('shape', (value) => this._normalizeBrickShape(value));
    readString('textureStyle', (value) => value.trim());
    readNumber('width', { min: 8 });
    readNumber('value');
    readNumber('workDeadlineMs', { min: 0 });
    readNumber('targetHoldMs', { min: 0 });
    readNumber('progressPerPerfect', { min: 0 });
    return out;
  }

  _pickRandomCategory(dimension: keyof CategoryPalettes): CategoryEntry | null {
    const palette = this.categoryPalettes?.[dimension];
    if (!Array.isArray(palette) || palette.length === 0) {
      return null;
    }
    const index = Math.floor(this.rng.nextRange(0, palette.length));
    return palette[index] ?? null;
  }

  _resolveCategoryById(dimension: keyof CategoryPalettes, id: unknown): CategoryEntry | null {
    if (!id) {
      return null;
    }
    const palette = this.categoryPalettes?.[dimension];
    if (!Array.isArray(palette) || palette.length === 0) {
      return null;
    }
    return palette.find((item) => item.id === id) ?? null;
  }

  _resolveCategorySelectionsForEntry(entry: Record<string, any>) {
    const categoryIds = entry?.categoryIds && typeof entry.categoryIds === 'object' ? entry.categoryIds : {} as Record<string, any>;
    const sampledId = (keys: string[]) => {
      const first = keys
        .map((key: string) => entry?.[key])
        .find((value: unknown) => value !== undefined && value !== null);
      return this._sampleField(first);
    };
    return {
      color: this._resolveCategoryById(
        'color',
        sampledId(['colorCategoryId', 'color_category_id']) ?? categoryIds.color
      ),
      width: this._resolveCategoryById(
        'width',
        sampledId(['widthCategoryId', 'width_category_id']) ?? categoryIds.width
      ),
      borderColor: this._resolveCategoryById(
        'borderColor',
        sampledId(['borderColorCategoryId', 'border_color_category_id', 'borderColor_category_id']) ?? categoryIds.borderColor
      ),
      shape: this._resolveCategoryById(
        'shape',
        sampledId(['shapeCategoryId', 'shape_category_id']) ?? categoryIds.shape
      ),
      texture: this._resolveCategoryById(
        'texture',
        sampledId(['textureCategoryId', 'texture_category_id']) ?? categoryIds.texture
      )
    };
  }

  _resolveBrickTraits({ categories = null, traits = null, metadata = null }: BrickCreationOptions = {}): ResolvedBrickTraits {
    const resolvedCategories: CategorySelections = {
      color: categories?.color ?? this._pickRandomCategory('color'),
      width: categories?.width ?? this._pickRandomCategory('width'),
      borderColor: categories?.borderColor ?? this._pickRandomCategory('borderColor'),
      shape: categories?.shape ?? this._pickRandomCategory('shape'),
      texture: categories?.texture ?? this._pickRandomCategory('texture')
    };
    const categoryTraits: Record<string, unknown> = {};
    (['color', 'width', 'borderColor', 'shape', 'texture'] as const).forEach((dimension) => {
      const catTraits = resolvedCategories[dimension]?.traits;
      if (!catTraits || typeof catTraits !== 'object') {
        return;
      }
      for (const key in catTraits) {
        const value = catTraits[key];
        if (value === null || value === undefined) {
          continue;
        }
        if (categoryTraits[key] === undefined) {
          categoryTraits[key] = value;
        }
      }
    });
    return {
      categories: resolvedCategories,
      traits: this._materializeBrickTraits({
        ...categoryTraits,
        ...this._collectCategoryTraitSpecs(traits),
        ...this._collectCategoryTraitSpecs(metadata)
      })
    };
  }

  _makeLengthSampler(lengthSpec: unknown): () => number {
    if (typeof lengthSpec === 'number') {
      const value = Number(lengthSpec);
      return () => value;
    }
    if (lengthSpec && typeof lengthSpec === 'object') {
      const ls = lengthSpec as Record<string, unknown>;
      if (typeof ls.value === 'number' && !ls.type) {
        const value = Number(ls.value);
        return () => value;
      }
      const sampler = createSampler(lengthSpec as Record<string, unknown>, this.rng);
      return () => Number(sampler());
    }
    const fallback = this.config.display?.canvasWidth ?? 1000;
    return () => fallback;
  }

  _makeInterSpawnSampler(spawnCfg: Record<string, any> = {}): () => number {
    const interSpawnSpec = spawnCfg?.interSpawnDist;
    if (typeof interSpawnSpec === 'number' && Number.isFinite(interSpawnSpec) && interSpawnSpec >= 0) {
      return () => interSpawnSpec;
    }
    if (interSpawnSpec && typeof interSpawnSpec === 'object') {
      return createSampler(interSpawnSpec, this.rng) as () => number;
    }
    const spawnRate = this._resolveValue(spawnCfg?.ratePerSec);
    if (Number.isFinite(spawnRate) && spawnRate > 0) {
      // Fall back to Poisson arrivals when only ratePerSec is configured.
      return createSampler({ type: 'exponential', lambda: spawnRate }, this.rng) as () => number;
    }
    // Spawning disabled.
    return () => Number.POSITIVE_INFINITY;
  }

  _buildForcedControlConfig() {
    const forced = this.config?.trial?.forcedOrder ?? {};
    const switchModeRaw = String(forced.switchMode ?? 'on_clear').toLowerCase();
    const switchMode = ['on_clear', 'interval', 'interval_or_clear'].includes(switchModeRaw)
      ? switchModeRaw
      : 'on_clear';

    // Calculate maximum possible brick dimensions for consistent spotlight window
    const defaultWidth = Number(this.config.display?.brickWidth) || 80;
    const forcedWidths = (this.config.bricks?.forcedSet || []).map((b: any) => {
      const w = b.width ?? b.processingWidthPx ?? b.processing_width_px;
      if (this._isSamplerSpec(w)) {
        return Number((w as any).max) || Number((w as any).value) || defaultWidth;
      }
      return Number(w);
    }).filter(Number.isFinite);
    const categoryWidths = (this.config.bricks?.widthCategories || []).map((c: any) => {
      const w = c.width;
      if (this._isSamplerSpec(w)) {
        return Number((w as any).max) || Number((w as any).value) || defaultWidth;
      }
      return Number(w);
    }).filter(Number.isFinite);

    const spotlightWidth = Number.isFinite(Number(forced.spotlightWidth))
      ? Number(forced.spotlightWidth)
      : Math.max(defaultWidth, ...forcedWidths, ...categoryWidths);

    const spotlightHeight = Number.isFinite(Number(forced.spotlightHeight))
      ? Number(forced.spotlightHeight)
      : (Number.isFinite(Number(this.config.display?.brickHeight)) ? Math.max(8, Number(this.config.display?.brickHeight)) : 60);

    return {
      enabled: Boolean(forced.enable),
      switchMode,
      switchIntervalMs: Math.max(100, Number(forced.switchIntervalMs ?? 8000)),
      switchOnDrop: forced.switchOnDrop !== false,
      sequence: Array.isArray(forced.sequence) ? forced.sequence : null,
      spotlightPadding: Math.max(0, Number(forced.spotlightPadding ?? 18)),
      spotlightWidth,
      spotlightHeight,
      dimAlpha: Math.max(0, Math.min(0.95, Number(forced.dimAlpha ?? 0.45))),
      coverStory: {
        enableAmmoCue: Boolean(forced.coverStory?.enableAmmoCue)
      },
      activeOrderIndex: -1,
      activeBrickId: null,
      nextSwitchAtMs: null,
      orderedBrickIds: []
    };
  }

  _initForcedControl() {
    if (!this.forcedControl.enabled) {
      return;
    }
    const configured: BrickRecord[] = Array.from(this.bricks.values())
      .sort((a: BrickRecord, b: BrickRecord) => (a.forcedSetIndex ?? Number.MAX_SAFE_INTEGER) - (b.forcedSetIndex ?? Number.MAX_SAFE_INTEGER));
    const sequence = this.forcedControl.sequence;
    if (Array.isArray(sequence) && sequence.length > 0) {
      const chosen = sequence
        .map((idxRaw) => Number(idxRaw))
        .filter((idx) => Number.isFinite(idx) && idx >= 0 && idx < configured.length)
        .map((idx) => configured[Math.floor(idx)]?.id)
        .filter(Boolean);
      this.forcedControl.orderedBrickIds = chosen;
    } else {
      this.forcedControl.orderedBrickIds = configured.map((brick: BrickRecord) => brick.id);
    }
    this._setForcedActiveBrick(0, 'trial_start');
  }

  _setForcedActiveBrick(orderIndex: number, reason: string) {
    if (!this.forcedControl.enabled) {
      return;
    }
    const previous = this.forcedControl.activeBrickId;
    const order = this.forcedControl.orderedBrickIds || [];
    let chosenIndex = -1;
    let chosenBrickId = null;
    for (let i = Math.max(0, orderIndex); i < order.length; i += 1) {
      const id = order[i];
      const candidate = this.bricks.get(id);
      if (candidate && candidate.status === BRICK_STATUS.ACTIVE) {
        chosenIndex = i;
        chosenBrickId = id;
        break;
      }
    }
    this.forcedControl.activeOrderIndex = chosenIndex;
    this.forcedControl.activeBrickId = chosenBrickId;
    this._scheduleForcedTimedSwitch();
    this._log('brick_focus_changed', {
      reason,
      previous_brick_id: previous,
      active_brick_id: chosenBrickId,
      active_order_index: chosenIndex
    });
  }

  _advanceForcedActiveBrick(reason: string) {
    if (!this.forcedControl.enabled) {
      return;
    }
    const nextIndex = this.forcedControl.activeOrderIndex + 1;
    this._setForcedActiveBrick(nextIndex, reason);
  }

  _scheduleForcedTimedSwitch() {
    if (!this.forcedControl.enabled) {
      return;
    }
    if (this.forcedControl.switchMode === 'interval' || this.forcedControl.switchMode === 'interval_or_clear') {
      this.forcedControl.nextSwitchAtMs = this.elapsed + this.forcedControl.switchIntervalMs;
    } else {
      this.forcedControl.nextSwitchAtMs = null;
    }
  }

  _computeBrickY(conveyorY: number, brickHeight: number) {
    const beltHeight = Math.max(1, Number(this.config?.display?.beltHeight) || 1);
    const fallbackY = conveyorY + (beltHeight - brickHeight) / 2;
    const bandCfg = this.config?.display?.beltTexture?.brickContactBand;
    if (!bandCfg || bandCfg.enable !== true) {
      return fallbackY;
    }
    const readInsetPx = (pxValue: unknown, ratioValue: unknown) => {
      const px = Number(pxValue);
      if (Number.isFinite(px)) {
        return px;
      }
      const ratio = Number(ratioValue);
      if (Number.isFinite(ratio)) {
        return ratio * beltHeight;
      }
      return 0;
    };
    const topInset = Math.max(0, readInsetPx(bandCfg.topInsetPx, bandCfg.topInsetRatio));
    const bottomInset = Math.max(0, readInsetPx(bandCfg.bottomInsetPx, bandCfg.bottomInsetRatio));
    const bandTop = Math.min(beltHeight, topInset);
    const bandBottom = Math.max(bandTop, beltHeight - bottomInset);
    const bandCenterY = (bandTop + bandBottom) / 2;
    const offsetY = Number.isFinite(Number(bandCfg.offsetYPx)) ? Number(bandCfg.offsetYPx) : 0;
    return conveyorY + bandCenterY - brickHeight / 2 + offsetY;
  }

  /**
   * Spawns a new brick on the given conveyor if safety constraints permit.
   */
  _spawnBrick(conveyor: ConveyorRecord, options: SpawnBrickOptions = {}): boolean {
    const { x = 0, reason = 'spawn', bypassSpacing = false, categories = null, traits = null, metadata = null } = options;
    const cfg = this.config;
    const { categories: selectedCategories, traits: resolvedTraits } = this._resolveBrickTraits({
      categories,
      traits,
      metadata
    });
    const widthRaw = Number(resolvedTraits.width ?? cfg.display.brickWidth);
    const width = Number.isFinite(widthRaw) ? Math.max(8, widthRaw) : Math.max(8, Number(cfg.display.brickWidth) || 80);
    const minSpacing = cfg.bricks.spawn.minSpacingPx ?? 0;
    const maxActive = cfg.bricks.spawn.maxActivePerConveyor ?? Infinity;

    if (conveyor.activeIds.length >= maxActive) {
      return false;
    }
    const id = `b${++this.nextBrickId}`;
    const pickedColor = resolvedTraits.color ?? cfg.display.brickColor;
    const pickedBorderColor = resolvedTraits.borderColor ?? cfg.display.brickBorderColor ?? null;
    const pickedShape = this._normalizeBrickShape(resolvedTraits.shape ?? cfg.display.brickShape) ?? 'rounded_rect';
    const pickedTextureStyle = resolvedTraits.textureStyle ?? null;
    const speed = Math.max(0, conveyor.speed);
    const buffer = Math.max(0, minSpacing);
    const newStart = x;
    const newEnd = x + width;
    const overlaps = !bypassSpacing && this.activeBricks.some((existing) => {
      if (existing.conveyorId !== conveyor.id) return false;
      const existingStart = existing.x;
      const existingEnd = existing.x + existing.width;
      return newStart < existingEnd + buffer && newEnd + buffer > existingStart;
    });
    if (overlaps) {
      return false;
    }
    const optionalNumber = (value: unknown): number | null => {
      if (value === null || value === undefined || value === '') {
        return null;
      }
      const n = Number(value);
      return Number.isFinite(n) ? n : null;
    };

    const brickHeight = Number.isFinite(Number(cfg.display.brickHeight))
      ? Math.max(8, Number(cfg.display.brickHeight))
      : 60;
    const brick: BrickRecord = {
      id,
      conveyorId: conveyor.id,
      status: BRICK_STATUS.ACTIVE,
      x,
      y: this._computeBrickY(conveyor.y, brickHeight),
      speed,
      width,
      initialWidth: width,
      height: brickHeight,
      createdAt: this.elapsed,
      clicks: 0,
      holds: 0,
      taskAttempts: 0,
      taskCompletions: 0,
      clearProgress: 0,
      isHovered: false,
      isHeld: false,
      color: String(pickedColor ?? ''),
      borderColor: pickedBorderColor != null ? String(pickedBorderColor) : null,
      shape: pickedShape,
      textureStyle: pickedTextureStyle != null ? String(pickedTextureStyle) : null,
      colorCategoryId: selectedCategories.color?.id ?? null,
      colorCategoryLabel: selectedCategories.color?.label ?? null,
      widthCategoryId: selectedCategories.width?.id ?? null,
      widthCategoryLabel: selectedCategories.width?.label ?? null,
      borderColorCategoryId: selectedCategories.borderColor?.id ?? null,
      borderColorCategoryLabel: selectedCategories.borderColor?.label ?? null,
      shapeCategoryId: selectedCategories.shape?.id ?? null,
      shapeCategoryLabel: selectedCategories.shape?.label ?? null,
      textureCategoryId: selectedCategories.texture?.id ?? null,
      textureCategoryLabel: selectedCategories.texture?.label ?? null,
      value: Math.max(0, Number(resolvedTraits.value ?? 0)),
      workDeadlineMs: optionalNumber(resolvedTraits.workDeadlineMs),
      targetHoldMs: optionalNumber(resolvedTraits.targetHoldMs),
      progressPerPerfect: optionalNumber(resolvedTraits.progressPerPerfect),
      forcedSetIndex: optionalNumber(metadata?.forcedSetIndex),
      label: resolvedTraits.label != null ? String(resolvedTraits.label) : (metadata?.label != null ? String(metadata.label) : null)
    };
    this.bricks.set(id, brick);
    this.activeBricks.push(brick);
    conveyor.activeIds.push(id);
    if (this.forcedControl.enabled) {
      const order = this.forcedControl.orderedBrickIds;
      if (Array.isArray(order) && !order.includes(id)) {
        order.push(id);
      }
      const currentActive = this.forcedControl.activeBrickId
        ? this.bricks.get(this.forcedControl.activeBrickId)
        : null;
      if (!currentActive || currentActive.status !== BRICK_STATUS.ACTIVE) {
        const fallbackIndex = Array.isArray(order) ? Math.max(0, order.indexOf(id)) : 0;
        this._setForcedActiveBrick(fallbackIndex, 'spawned_no_active_focus');
      }
    }
    this.stats.spawned += 1;
    const conveyorLengthPx = Math.max(0, Number(conveyor.length) || 0);
    const visibleWidthAtSpawnPx = Math.max(0, getBrickVisibleWidth(brick, this.config.bricks.completionMode));
    const distanceToDropPx = Math.max(0, conveyorLengthPx - (brick.x + visibleWidthAtSpawnPx));
    const nominalDropDelayMs = speed > 0 ? (distanceToDropPx / speed) * 1000 : null;
    const nominalDropDeadlineTimeMs =
      nominalDropDelayMs !== null && Number.isFinite(nominalDropDelayMs)
        ? this.elapsed + nominalDropDelayMs
        : null;
    this._log('brick_spawned', {
      brick_id: id,
      conveyor_id: conveyor.id,
      speed_px_s: speed,
      conveyor_length_px: conveyorLengthPx,
      spawn_x_px: brick.x,
      visible_width_spawn_px: visibleWidthAtSpawnPx,
      nominal_drop_delay_ms: nominalDropDelayMs,
      nominal_drop_deadline_time_ms: nominalDropDeadlineTimeMs,
      reason,
      color: pickedColor,
      border_color: pickedBorderColor,
      shape: pickedShape,
      texture_style: pickedTextureStyle,
      color_category_id: brick.colorCategoryId,
      color_category_label: brick.colorCategoryLabel,
      width_category_id: brick.widthCategoryId,
      width_category_label: brick.widthCategoryLabel,
      border_color_category_id: brick.borderColorCategoryId,
      border_color_category_label: brick.borderColorCategoryLabel,
      shape_category_id: brick.shapeCategoryId,
      shape_category_label: brick.shapeCategoryLabel,
      texture_category_id: brick.textureCategoryId,
      texture_category_label: brick.textureCategoryLabel,
      value: brick.value,
      work_deadline_ms: brick.workDeadlineMs,
      target_hold_ms: brick.targetHoldMs,
      progress_per_perfect: brick.progressPerPerfect,
      forced_set_index: brick.forcedSetIndex
    });
    return true;
  }

  handleBrickHover(brickId: string, isHovering: boolean, timestamp: number, pointerPos: PointerPos = {}) {
    const { x = null, y = null } = pointerPos || {};
    const brick = this.bricks.get(brickId);
    if (!brick) {
      return;
    }
    if (!isHovering) {
      if (brick.isHovered) {
        brick.isHovered = false;
        this._log('brick_hover_end', {
          brick_id: brick.id,
          conveyor_id: brick.conveyorId,
          x,
          y
        });
      }
      return;
    }
    const gate = this._canWorkOnBrick(brick);
    if (!gate.ok) {
      this._log('brick_hover_blocked', {
        brick_id: brick.id,
        conveyor_id: brick.conveyorId,
        x,
        y,
        blocked_reason: gate.reason
      });
      return;
    }
    if (!brick.isHovered) {
      brick.isHovered = true;
      this._log('brick_hover_start', {
        brick_id: brick.id,
        conveyor_id: brick.conveyorId,
        x,
        y
      });
    }
  }

  /**
   * Removes a brick and updates stats/logging.
   */
  _finalizeBrick(brick: BrickRecord, status: string, payload: Record<string, unknown> = {}) {
    if (!brick || brick.status !== BRICK_STATUS.ACTIVE) {
      return;
    }
    brick.status = status;
    const conveyor = this.conveyorsById.get(brick.conveyorId);
    if (conveyor) {
      conveyor.activeIds = conveyor.activeIds.filter((id: string) => id !== brick.id);
    }
    this.bricks.delete(brick.id);
    const idx = this.activeBricks.findIndex((b) => b.id === brick.id);
    if (idx !== -1) {
      const lastIdx = this.activeBricks.length - 1;
      if (idx !== lastIdx) {
        this.activeBricks[idx] = this.activeBricks[lastIdx];
      }
      this.activeBricks.pop();
    }
    const eventType = status === BRICK_STATUS.CLEARED ? 'brick_cleared' : 'brick_dropped';
    let lostPoints = 0;
    let nominalLostPoints = 0;
    if (status === BRICK_STATUS.CLEARED) {
      this.stats.cleared += 1;
      const gainedPoints = Math.max(0, Number(brick.value ?? 0));
      this.stats.points += gainedPoints;
      this.pendingClearVisuals.push({
        brickId: brick.id,
        conveyorId: brick.conveyorId,
        x: brick.x,
        y: brick.y,
        width: brick.width,
        height: brick.height,
        value: gainedPoints,
        ...payload,
      });
    } else if (status === BRICK_STATUS.DROPPED) {
      this.stats.dropped += 1;
      const dropPenaltyCfg = (this.config?.bricks?.dropPenalty || {}) as Record<string, unknown>;
      if (dropPenaltyCfg.enable === true) {
        nominalLostPoints = Math.max(0, Number(brick.value ?? 0));
        const pointsBeforeCumulative = this.initialPoints + this.stats.points;
        lostPoints = Math.min(Math.max(0, pointsBeforeCumulative), nominalLostPoints);
        this.stats.points -= lostPoints;
      }
      const dropWidth = Math.max(0, Number(payload.visible_width_px ?? brick.width) || 0);
      this.pendingDropVisuals.push({
        brickId: brick.id,
        conveyorId: brick.conveyorId,
        x: brick.x,
        y: brick.y,
        width: dropWidth,
        height: brick.height,
        color: brick.color,
        borderColor: brick.borderColor,
        shape: brick.shape,
        textureStyle: brick.textureStyle,
        lostPoints,
      });
    }
    this._log(eventType, {
      brick_id: brick.id,
      conveyor_id: brick.conveyorId,
      lifetime: this.elapsed - brick.createdAt,
      x: brick.x,
      y: brick.y,
      value: brick.value,
      cumulative_points: this.stats.points,
      ...(lostPoints > 0 ? { lost_points: lostPoints } : {}),
      ...(nominalLostPoints > 0 ? { nominal_lost_points: nominalLostPoints } : {}),
      ...payload
    });
    if (this.forcedControl.enabled && brick.id === this.forcedControl.activeBrickId) {
      if (status === BRICK_STATUS.CLEARED) {
        this._advanceForcedActiveBrick('active_brick_cleared');
      } else if (status === BRICK_STATUS.DROPPED && this.forcedControl.switchOnDrop) {
        this._advanceForcedActiveBrick('active_brick_dropped');
      }
    }
  }

  _isCurrentForcedBrick(brickId: string) {
    if (!this.forcedControl.enabled) {
      return true;
    }
    // Practice trials should not be blocked by focus locks as they often involve
    // manual brick management/respawning that doesn't advance the forced order.
    if (this.config?.trial?.isPractice) {
      return true;
    }
    return brickId === this.forcedControl.activeBrickId;
  }

  _canWorkOnBrick(brick: BrickRecord) {
    if (!brick || brick.status !== BRICK_STATUS.ACTIVE) {
      return { ok: false, reason: 'inactive' };
    }
    // Practice mode should be lenient with focus locks to prevent getting stuck
    // due to ID mismatches during respawns/resets.
    if (!this.config?.trial?.isPractice && !this._isCurrentForcedBrick(brick.id)) {
      return { ok: false, reason: 'forced_order_locked' };
    }
    if (brick.workDeadlineMs !== null && Number.isFinite(brick.workDeadlineMs) && this.elapsed > brick.workDeadlineMs) {
      return { ok: false, reason: 'work_window_closed' };
    }
    return { ok: true, reason: null };
  }

  /**
   * Handles player interaction depending on completion mode.
   */
  handleBrickInteraction(brickId: string, timestamp: number, clickPos: PointerPos = {}) {
    const { x = null, y = null } = clickPos || {};
    const brick = this.bricks.get(brickId);
    if (!brick) {
      // Log the attempted click with coordinates even if invalid
      this.stats.clickErrors += 1;
      this._log('brick_click', { brick_id: brickId ?? null, x, y, valid: false });
      this._log('brick_click_invalid', { brick_id: brickId ?? null, x, y });
      return;
    }
    const gate = this._canWorkOnBrick(brick);
    if (!gate.ok) {
      this.stats.clickErrors += 1;
      this._log('brick_click', {
        brick_id: brick.id,
        conveyor_id: brick.conveyorId,
        x,
        y,
        valid: false,
        blocked_reason: gate.reason
      });
      return;
    }
    // Log a canonical click event before applying completion logic
    this._log('brick_click', {
      brick_id: brick.id,
      conveyor_id: brick.conveyorId,
      x,
      y,
      valid: true
    });
    const mode = this.config.bricks.completionMode;
    const params = this.config.bricks.completionParams || {};
    if (mode === 'single_click') {
      this._finalizeBrick(brick, BRICK_STATUS.CLEARED, {
        completion_mode: mode,
        clicks: brick.clicks + 1,
        x: brick.x,
        y: brick.y
      });
    } else if (mode === 'multi_click') {
      const required = Math.max(1, Number(params.clicks_required ?? 2));
      brick.clicks += 1;
      this._log('brick_click_progress', {
        brick_id: brick.id,
        clicks: brick.clicks,
        required
      });
      if (brick.clicks >= required) {
        this._finalizeBrick(brick, BRICK_STATUS.CLEARED, {
          completion_mode: mode,
          clicks: brick.clicks,
          x: brick.x,
          y: brick.y
        });
      }
    } else if (mode === 'click_to_clear') {
      const meanPx = Math.max(1, Number(params.click_clear_mean_px ?? 20));
      const sdPx = Math.max(0, Number(params.click_clear_sd_px ?? 0));
      const minPx = Math.max(0, Number(params.click_clear_min_px ?? 1));
      const clearPx = sdPx > 0
        ? Math.max(minPx, this.rng.nextNormal(meanPx, sdPx))
        : Math.max(minPx, meanPx);
      const progressBefore = Math.max(0, Math.min(1, Number(brick.clearProgress ?? 0)));
      const progressDelta = clearPx / Math.max(1, brick.initialWidth);
      brick.clicks += 1;
      brick.clearProgress = Math.min(1, progressBefore + progressDelta);
      const progressAfter = Math.max(0, Math.min(1, Number(brick.clearProgress ?? 0)));
      const remainingWidthBeforePx = Math.max(0, (1 - progressBefore) * Math.max(1, Number(brick.initialWidth ?? brick.width ?? 1)));
      const remainingWidthAfterPx = Math.max(0, (1 - progressAfter) * Math.max(1, Number(brick.initialWidth ?? brick.width ?? 1)));
      this._log('brick_click_progress', {
        brick_id: brick.id,
        clicks: brick.clicks,
        clear_px: clearPx,
        progress: progressAfter,
        progress_before: progressBefore,
        progress_after: progressAfter,
        remaining_width_px_before: remainingWidthBeforePx,
        remaining_width_px_after: remainingWidthAfterPx,
      });
      if (brick.clearProgress >= 1) {
        this._finalizeBrick(brick, BRICK_STATUS.CLEARED, {
          completion_mode: mode,
          clicks: brick.clicks,
          progress_before: progressBefore,
          progress_after: progressAfter,
          remaining_width_px_before: remainingWidthBeforePx,
          remaining_width_px_after: remainingWidthAfterPx,
          x: brick.x,
          y: brick.y,
        });
      }
    } else if (mode === 'hold_duration') {
      this._log('brick_click_progress', {
        brick_id: brick.id,
        note: 'Click ignored in hold_duration mode; use hold interactions.'
      });
    } else if (mode === 'hover_to_clear') {
      this._log('brick_click_progress', {
        brick_id: brick.id,
        note: 'Click ignored in hover_to_clear mode; progress is driven by hover exposure.'
      });
    } else if (mode === 'hold_to_clear') {
      this._log('brick_click_progress', {
        brick_id: brick.id,
        note: 'Click ignored in hold_to_clear mode; progress is driven by continuous hold exposure.'
      });
    } else {
      // Future modes can plug in here (e.g., cognitive tasks).
      this._finalizeBrick(brick, BRICK_STATUS.CLEARED, {
        completion_mode: mode,
        clicks: brick.clicks + 1,
        x: brick.x,
        y: brick.y,
        note: 'Fallback clear for unimplemented mode.'
      });
    }
  }



  startBrickTaskSequence(brickId: string, taskId: string, taskType: string, timestamp: number, clickPos: PointerPos = {}) {
    const { x = null, y = null } = clickPos || {};
    const brick = this.bricks.get(brickId);
    if (!brick) {
      this.stats.clickErrors += 1;
      this._log('brick_click', { brick_id: brickId ?? null, x, y, valid: false, completion_mode: 'task_sequence' });
      this._log('brick_task_start', {
        brick_id: brickId ?? null,
        task_id: taskId,
        task_type: taskType,
        x,
        y,
        valid: false,
        blocked_reason: 'brick_not_found'
      });
      return { ok: false, reason: 'brick_not_found' };
    }
    const gate = this._canWorkOnBrick(brick);
    if (!gate.ok) {
      this.stats.clickErrors += 1;
      this._log('brick_click', {
        ...this._brickEventPayload(brick),
        x,
        y,
        valid: false,
        completion_mode: 'task_sequence',
        blocked_reason: gate.reason
      });
      this._log('brick_task_start', {
        ...this._brickEventPayload(brick),
        task_id: taskId,
        task_type: taskType,
        x,
        y,
        valid: false,
        blocked_reason: gate.reason
      });
      return { ok: false, reason: gate.reason };
    }
    this._log('brick_click', {
      ...this._brickEventPayload(brick),
      x,
      y,
      valid: true,
      completion_mode: 'task_sequence'
    });
    this._log('brick_task_start', {
      ...this._brickEventPayload(brick),
      task_id: taskId,
      task_type: taskType,
      x,
      y,
      valid: true,
      completion_mode: 'task_sequence'
    });
    return { ok: true, reason: null, brickId: brick.id };
  }

  handleBrickTaskCompletion(brickId: string, result: Record<string, any>, timestamp: number) {
    const brick = this.bricks.get(brickId);
    const params = this.config.bricks?.completionParams || {};
    const taskId = String(result?.taskId ?? result?.task_id ?? params.taskId ?? params.task_id ?? 'embedded_task');
    const taskType = String(result?.taskType ?? result?.task_type ?? 'embedded');
    const correct = result?.correct === true;
    const responsePayload = result?.payload && typeof result.payload === 'object' ? result.payload : {};
    if (!brick) {
      this._log('embedded_task_response', {
        task_id: taskId,
        task_type: taskType,
        brick_id: brickId ?? null,
        correct,
        valid: false,
        blocked_reason: 'brick_not_found',
        ...responsePayload
      });
      this._log('brick_task_progress', {
        task_id: taskId,
        task_type: taskType,
        brick_id: brickId ?? null,
        correct,
        valid: false,
        progress_gained: 0,
        blocked_reason: 'brick_not_found'
      });
      return;
    }
    const gate = this._canWorkOnBrick(brick);
    if (!gate.ok) {
      this._log('embedded_task_response', {
        ...this._brickEventPayload(brick),
        task_id: taskId,
        task_type: taskType,
        correct,
        valid: false,
        blocked_reason: gate.reason,
        ...responsePayload
      });
      this._log('brick_task_progress', {
        ...this._brickEventPayload(brick),
        task_id: taskId,
        task_type: taskType,
        correct,
        valid: false,
        progress_gained: 0,
        blocked_reason: gate.reason
      });
      return;
    }

    brick.taskAttempts = Math.max(0, Number(brick.taskAttempts ?? 0)) + 1;
    const progressBefore = Math.max(0, Math.min(1, Number(brick.clearProgress ?? 0)));
    const widthScalingEnabled = params.width_scaling !== false;
    const widthReferencePx = Math.max(1, Number(params.width_reference_px ?? this.config.display?.brickWidth ?? 160));
    const widthScalingExponent = Math.max(0, Number(params.width_scaling_exponent ?? 1));
    const widthFactorRaw = widthScalingEnabled ? (brick.width / widthReferencePx) : 1;
    const widthFactor = Math.max(0.2, Math.pow(Math.max(0.01, widthFactorRaw), widthScalingExponent));
    const baseProgress = Math.max(0.01, Math.min(1, Number(params.progress_per_correct ?? params.progressPerCorrect ?? 0.5)));
    const gained = correct ? (baseProgress / widthFactor) : 0;
    if (correct) {
      brick.taskCompletions = Math.max(0, Number(brick.taskCompletions ?? 0)) + 1;
      brick.clearProgress = Math.max(0, Math.min(1, progressBefore + gained));
    }
    const progressAfter = Math.max(0, Math.min(1, Number(brick.clearProgress ?? 0)));
    const remainingWidthBeforePx = Math.max(0, (1 - progressBefore) * Math.max(1, Number(brick.initialWidth ?? brick.width ?? 1)));
    const remainingWidthAfterPx = Math.max(0, (1 - progressAfter) * Math.max(1, Number(brick.initialWidth ?? brick.width ?? 1)));

    this._log('embedded_task_response', {
      ...this._brickEventPayload(brick),
      task_id: taskId,
      task_type: taskType,
      correct,
      valid: true,
      ...responsePayload
    });
    this._log('brick_task_progress', {
      ...this._brickEventPayload(brick),
      task_id: taskId,
      task_type: taskType,
      correct,
      valid: true,
      completion_mode: 'task_sequence',
      progress_gained: gained,
      progress_total: progressAfter,
      progress_before: progressBefore,
      progress_after: progressAfter,
      remaining_width_px_before: remainingWidthBeforePx,
      remaining_width_px_after: remainingWidthAfterPx,
      width_factor: widthFactor,
      width_reference_px: widthReferencePx,
      task_attempts: brick.taskAttempts,
      task_completions: brick.taskCompletions
    });

    if (brick.clearProgress >= 1) {
      this._finalizeBrick(brick, BRICK_STATUS.CLEARED, {
        completion_mode: 'task_sequence',
        task_id: taskId,
        task_type: taskType,
        task_attempts: brick.taskAttempts,
        task_completions: brick.taskCompletions,
        progress: progressAfter,
        progress_before: progressBefore,
        progress_after: progressAfter,
        remaining_width_px_before: remainingWidthBeforePx,
        remaining_width_px_after: remainingWidthAfterPx,
        x: brick.x,
        y: brick.y
      });
    }
  }

  handleBrickHold(brickId: string, holdDurationMs: number, timestamp: number, clickPos: PointerPos = {}) {
    const rawX = Number((clickPos || {}).x);
    const rawY = Number((clickPos || {}).y);
    const brick = this.bricks.get(brickId);
    const holdMs = Math.max(0, Number(holdDurationMs) || 0);
    const x = Number.isFinite(rawX) ? rawX : (brick ? Number(brick.x) : 0);
    const y = Number.isFinite(rawY) ? rawY : (brick ? Number(brick.y) : 0);
    if (!brick) {
      this.stats.clickErrors += 1;
      this._log('brick_hold', {
        active_brick_id: brickId ?? null,
        brick_id: brickId ?? null,
        x,
        y,
        valid: false,
        hold_ms: holdMs,
        blocked_reason: 'brick_not_found',
      });
      return;
    }
    const gate = this._canWorkOnBrick(brick);
    if (!gate.ok) {
      this.stats.clickErrors += 1;
      this._log('brick_hold', {
        ...this._brickEventPayload(brick),
        x,
        y,
        valid: false,
        hold_ms: holdMs,
        blocked_reason: gate.reason
      });
      return;
    }
    const mode = this.config.bricks.completionMode;
    if (mode !== 'hold_duration') {
      this.handleBrickInteraction(brickId, timestamp, clickPos);
      return;
    }
    const params = this.config.bricks.completionParams || {};
    const targetHoldMs = Math.max(50, Number(brick.targetHoldMs ?? params.target_hold_ms ?? 700));
    const holdFloorMs = Math.max(0, Number(params.hold_floor_ms ?? 0));
    const holdCeilingMs = params.hold_ceiling_ms !== undefined
      ? Number(params.hold_ceiling_ms)
      : (targetHoldMs + Math.max(0, Number(params.overshoot_tolerance_ms ?? 0)));

    const progressPerPerfect = Math.max(
      0.01,
      Math.min(1, Number(brick.progressPerPerfect ?? params.progress_per_perfect ?? 0.35))
    );
    const progressCurve = Math.max(0.1, Number(params.progress_curve ?? 1));
    const widthScalingEnabled = params.width_scaling !== false;
    const widthReferencePx = Math.max(1, Number(params.width_reference_px ?? this.config.display.brickWidth ?? 160));
    const widthScalingExponent = Math.max(0, Number(params.width_scaling_exponent ?? 1));
    const widthFactorRaw = widthScalingEnabled ? (brick.width / widthReferencePx) : 1;
    const widthFactor = Math.max(0.2, Math.pow(Math.max(0.01, widthFactorRaw), widthScalingExponent));

    let ratio = 0;
    if (holdMs >= holdFloorMs && holdMs <= holdCeilingMs) {
      if (holdMs < targetHoldMs) {
        // Under-side: scale 0.0 at floor to 1.0 at target
        const range = targetHoldMs - holdFloorMs;
        const dist = (targetHoldMs - holdMs) / Math.max(1, range);
        ratio = 1 - Math.max(0, Math.min(1, dist));
      } else {
        // Over-side: scale 1.0 at target to 0.0 at ceiling
        const range = holdCeilingMs - targetHoldMs;
        const dist = (holdMs - targetHoldMs) / Math.max(1, range);
        ratio = 1 - Math.max(0, Math.min(1, dist));
      }
    }

    const gainedUnscaled = Math.pow(ratio, progressCurve) * progressPerPerfect;
    const gained = gainedUnscaled / widthFactor;
    const progressBefore = Math.max(0, Math.min(1, Number(brick.clearProgress ?? 0)));
    brick.holds += 1;
    brick.clearProgress = Math.max(0, Math.min(1, progressBefore + gained));
    const progressAfter = Math.max(0, Math.min(1, Number(brick.clearProgress ?? 0)));
    const remainingWidthBeforePx = Math.max(0, (1 - progressBefore) * Math.max(1, Number(brick.initialWidth ?? brick.width ?? 1)));
    const remainingWidthAfterPx = Math.max(0, (1 - progressAfter) * Math.max(1, Number(brick.initialWidth ?? brick.width ?? 1)));
    this._log('brick_hold', {
      ...this._brickEventPayload(brick),
      x,
      y,
      valid: true,
      hold_ms: holdMs,
      hold_floor_ms: holdFloorMs,
      hold_ceiling_ms: holdCeilingMs,
      width_factor: widthFactor,
      width_reference_px: widthReferencePx,
      progress_gained: gained,
      progress_total: progressAfter,
      progress_before: progressBefore,
      progress_after: progressAfter,
      remaining_width_px_before: remainingWidthBeforePx,
      remaining_width_px_after: remainingWidthAfterPx,
      holds: brick.holds
    });

    // In practice mode we don't want to actually finalize and clear the brick.
    // We let the `runHoldDurationPractice` script handle the quota and visual resets.
    if (brick.clearProgress >= 1 && !this.config?.trial?.isPractice) {
      this._finalizeBrick(brick, BRICK_STATUS.CLEARED, {
        completion_mode: mode,
        holds: brick.holds,
        progress: progressAfter,
        progress_before: progressBefore,
        progress_after: progressAfter,
        remaining_width_px_before: remainingWidthBeforePx,
        remaining_width_px_after: remainingWidthAfterPx,
        hold_ms: holdMs,
        x: brick.x,
        y: brick.y
      });
    }
  }

  handleBrickHoldState(brickId: string, isHolding: boolean, timestamp: number, clickPos: PointerPos = {}) {
    const { x = null, y = null } = clickPos || {};
    const brick = this.bricks.get(brickId);
    if (!brick) {
      this.stats.clickErrors += 1;
      this._log('brick_hold_state', { brick_id: brickId ?? null, x, y, valid: false, holding: Boolean(isHolding) });
      return;
    }
    const mode = this.config.bricks.completionMode;
    if (mode !== 'hold_to_clear') {
      return;
    }
    if (!isHolding) {
      if (!brick.isHeld) return;
      brick.isHeld = false;
      this._log('brick_hold_end', {
        brick_id: brick.id,
        conveyor_id: brick.conveyorId,
        x,
        y,
        valid: true
      });
      return;
    }
    const gate = this._canWorkOnBrick(brick);
    if (!gate.ok) {
      this.stats.clickErrors += 1;
      this._log('brick_hold_state', {
        brick_id: brick.id,
        conveyor_id: brick.conveyorId,
        x,
        y,
        valid: false,
        holding: true,
        blocked_reason: gate.reason
      });
      return;
    }
    if (brick.isHeld) {
      return;
    }
    brick.isHeld = true;
    this._log('brick_hold_begin', {
      brick_id: brick.id,
      conveyor_id: brick.conveyorId,
      x,
      y,
      valid: true
    });
  }

  /**
   * Advances the simulation by dt milliseconds.
   */
  step(dtMs: number) {
    const dt = dtMs / 1000;
    this.elapsed += dtMs;
    const completionMode = this.config.bricks.completionMode;
    this._updateDynamicConveyorSpeeds();

    // Update brick positions and check for drops.
    // Iterate over a stable snapshot because finalization mutates `this.bricks`.
    // Using the live Map iterator can skip entries when multiple bricks are
    // removed in one frame (e.g., simultaneous drops across conveyors).
    const activeSnapshot = Array.from(this.bricks.values());
    activeSnapshot.forEach((brick: BrickRecord) => {
      if (brick.status !== BRICK_STATUS.ACTIVE) {
        return;
      }
      // Brick may already have been finalized earlier in this frame.
      if (!this.bricks.has(brick.id)) {
        return;
      }
      const conveyor = this.conveyorsById.get(brick.conveyorId);
      const conveyorLength = conveyor ? conveyor.length : this.defaultConveyorLength;
      const speed = conveyor ? conveyor.speed : brick.speed;
      brick.speed = speed;
      const hoverCanProcess = completionMode === 'hover_to_clear' && brick.isHovered && this._canWorkOnBrick(brick).ok;
      const holdCanProcess = completionMode === 'hold_to_clear' && brick.isHeld && this._canWorkOnBrick(brick).ok;
      brick.x += speed * dt;
      if (hoverCanProcess || holdCanProcess) {
        const referenceWidth = Math.max(1, Number(brick.initialWidth ?? brick.width ?? 1));
        const rateKey = completionMode === 'hold_to_clear' ? 'hold_process_rate_px_s' : 'hover_process_rate_px_s';
        const processRatePxPerSec = Math.max(0, Number(this.config?.bricks?.completionParams?.[rateKey] ?? speed) || speed);
        const progressDelta = (processRatePxPerSec * dt) / referenceWidth;
        brick.clearProgress = Math.max(0, Math.min(1, (brick.clearProgress ?? 0) + progressDelta));
      }
      if ((completionMode === 'hover_to_clear' || completionMode === 'hold_to_clear') && (brick.clearProgress ?? 0) >= 1) {
        this._finalizeBrick(brick, BRICK_STATUS.CLEARED, {
          completion_mode: completionMode,
          progress: brick.clearProgress,
          x: brick.x,
          y: brick.y
        });
        return;
      }
      const visibleWidth = getBrickVisibleWidth(brick, completionMode);
      if (brick.x + visibleWidth >= conveyorLength) {
        this._finalizeBrick(brick, BRICK_STATUS.DROPPED, {
          completion_mode: completionMode,
          visible_width_px: visibleWidth
        });
      }
    });

    if (this.forcedControl.enabled) {
      const mode = this.forcedControl.switchMode;
      if ((mode === 'interval' || mode === 'interval_or_clear') &&
        this.forcedControl.nextSwitchAtMs !== null &&
        Number.isFinite(this.forcedControl.nextSwitchAtMs) &&
        this.elapsed >= this.forcedControl.nextSwitchAtMs) {
        this._advanceForcedActiveBrick('scheduled_switch');
      }
    }

    // Spawn logic.
    const maxTotal = this.config.bricks.maxBricksPerTrial ?? Infinity;
    const activeCount = this.bricks.size;
    const allowSpawn = !this.forcedControl.enabled;
    if (allowSpawn && activeCount < maxTotal) {
      const spawnRate = this._resolveValue(this.config.bricks.spawn.ratePerSec);
      const shouldConsider = spawnRate > 0 || this.config.bricks.spawn.interSpawnDist;
      if (shouldConsider) {
        if (this.config?.bricks?.spawn?.byConveyor === false) {
          if (this.elapsed >= this.nextGlobalSpawnAt) {
            // Try conveyors in randomized order until one accepts the spawn.
            const queue = this.conveyors.map((_: ConveyorRecord, index: number) => index);
            for (let i = queue.length - 1; i > 0; i -= 1) {
              const j = Math.floor(this.rng.nextRange(0, i + 1));
              const tmp = queue[i];
              queue[i] = queue[j];
              queue[j] = tmp;
            }
            let spawned = false;
            queue.forEach((index: number) => {
              if (!spawned) {
                spawned = this._spawnBrick(this.conveyors[index]);
              }
            });
            const delay = this.globalInterSpawnSampler();
            this.nextGlobalSpawnAt = this.elapsed + delay * 1000;
            if (!spawned) {
              this.nextGlobalSpawnAt = this.elapsed + Math.min(1000, delay * 500);
            }
          }
        } else {
          this.conveyors.forEach((conveyor: ConveyorRecord) => {
            const nextSpawn = conveyor.nextSpawnAt;
            if (this.elapsed >= nextSpawn) {
              const spawned = this._spawnBrick(conveyor);
              const delay = conveyor.interSpawnSampler();
              conveyor.nextSpawnAt = this.elapsed + delay * 1000;
              if (!spawned) {
                // If spawn failed due to spacing, retry sooner.
                conveyor.nextSpawnAt = this.elapsed + Math.min(1000, delay * 500);
              }
            }
          });
        }
      }
    }
  }

  /**
   * Returns a lightweight snapshot for HUD rendering.
   */
  getHUDStats() {
    const focusBrick = this.forcedControl.enabled && this.forcedControl.activeBrickId
      ? this.bricks.get(this.forcedControl.activeBrickId)
      : null;
    return {
      timeElapsedMs: this.elapsed,
      bricksActive: this.bricks.size,
      spawned: this.stats.spawned,
      cleared: this.stats.cleared,
      dropped: this.stats.dropped,
      points: this.stats.points,
      focusBrickId: focusBrick?.id ?? null,
      focusBrickValue: focusBrick?.value ?? null
    };
  }

  getFocusState() {
    if (!this.forcedControl.enabled) {
      return {
        enabled: false,
        activeBrickId: null
      };
    }
    const active = this.forcedControl.activeBrickId ? (this.bricks.get(this.forcedControl.activeBrickId) || null) : null;
    const ammoLabel = this.forcedControl.coverStory.enableAmmoCue && active
      ? `${active.colorCategoryLabel ?? active.color ?? 'Current'} ammo`
      : null;
    return {
      enabled: true,
      activeBrickId: active?.id ?? null,
      spotlightPadding: this.forcedControl.spotlightPadding,
      spotlightWidth: this.forcedControl.spotlightWidth,
      spotlightHeight: this.forcedControl.spotlightHeight,
      dimAlpha: this.forcedControl.dimAlpha,
      ammoLabel
    };
  }

  /**
   * Returns serializable data for persistent storage.
   */
  exportData() {
    return {
      stats: { ...this.stats },
      events: this.events.slice()
    };
  }

  /**
   * Cleans up any remaining bricks (used when the trial ends abruptly).
   */
  forceEnd() {
    this.bricks.forEach((brick: BrickRecord) => {
      this._finalizeBrick(brick, BRICK_STATUS.DROPPED, { forced: true });
    });
  }

  consumeDroppedVisuals() {
    if (!this.pendingDropVisuals.length) {
      return [];
    }
    const output = this.pendingDropVisuals.slice();
    this.pendingDropVisuals.length = 0;
    return output;
  }

  consumeClearedVisuals() {
    if (!this.pendingClearVisuals.length) {
      return [];
    }
    const output = this.pendingClearVisuals.slice();
    this.pendingClearVisuals.length = 0;
    return output;
  }
}

export { BRICK_STATUS };
