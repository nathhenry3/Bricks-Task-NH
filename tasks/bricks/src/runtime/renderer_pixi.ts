import * as PIXI from 'pixi.js';
import { brickProgressTint, getBrickVisibleWidth } from './brick_logic.js';
import { buildHUDLines } from './hud.js';
import { getOrCreateProceduralTexture, loadCachedImageTexture, makeMaterialKey } from './material_cache.js';
import { CharacterSprite } from './renderer_character.js';

// Helper to convert CSS color strings or numeric values into Pixi-compatible numbers
const toPixiColor = (value: unknown) => {
  if (value === null || value === undefined || value === '') {
    return 0xffffff;
  }
  const normalized = typeof value === 'string' ? value.trim() : value;
  try {
    return PIXI.Color.shared.setValue(normalized as PIXI.ColorSource).toNumber();
  } catch (error) {
    console.warn(`[bricks] Failed to convert color: ${value}`, error);
    return 0xffffff;
  }
};
const normalizeBrickShape = (rawShape: unknown): string => {
  if (typeof rawShape !== 'string') {
    return 'rounded_rect';
  }
  const normalized = rawShape.trim().toLowerCase();
  if (!normalized) {
    return 'rounded_rect';
  }
  const aliases = {
    square: 'rect',
    rectangle: 'rect',
    rounded: 'rounded_rect',
    rounded_rectangle: 'rounded_rect'
  };
  return (aliases as Record<string, string>)[normalized] ?? normalized;
};

const normalizeTextureStyleId = (value: unknown): string => {
  if (typeof value !== 'string') {
    return '';
  }
  return value.trim().toLowerCase().replace(/[\s-]+/g, '_');
};

const BUILTIN_BRICK_TEXTURE_STYLES = {
  crate: {
    pattern: 'wood_planks',
    baseFillColor: '#8b6f4e',
    baseFillAlpha: 1,
    alpha: 0.95,
    plankCount: 3,
    grainCount: 5,
    seamColor: '#3b2f22',
    highlightColor: '#f5e9d8',
  },
  present: {
    pattern: 'gift_wrap',
    baseFillColor: '#ff2d2d',
    baseFillAlpha: 1,
    alpha: 1,
    ribbonColor: '#ffe14d',
    ribbonAlpha: 1,
    ribbonWidthRatio: 0.2,
    ribbonInsetPx: 2,
    topSheenAlpha: 0.08,
    paperPatternColor: '#ffffff',
    paperPatternAlpha: 0.38,
  },
  pizza: {
    pattern: 'pizza',
    baseFillColor: '#e2b07b',
    baseFillAlpha: 1,
    alpha: 1,
    sliceCount: 6,
    toppingCount: 7,
    crustColor: '#a16207',
    sauceColor: '#b91c1c',
    cheeseColor: '#facc15',
    toppingColor: '#7f1d1d',
    sliceLineColor: '#7c2d12',
  },
  box: {
    pattern: 'checkerboard',
    baseFillColor: '#b4936b',
    checkerColorA: '#9a7651',
    checkerColorB: '#5f6976',
    checkerCellPx: 2,
    baseFillAlpha: 1,
    alpha: 0.9,
    insetPx: 2,
    topSheenAlpha: 0,
    highlightColor: '#f1e5d5',
  },
  checkerboard: {
    pattern: 'checkerboard',
    baseFillColor: '#7d8794',
    checkerColorA: '#a9b4c2',
    checkerColorB: '#7e5f40',
    checkerCellPx: 12,
    baseFillAlpha: 1,
    alpha: 0.9,
    insetPx: 2,
    topSheenAlpha: 0,
    highlightColor: '#f8fafc',
  },
  parcel_label: {
    pattern: 'cardboard_block',
    baseFillColor: '#b4936b',
    baseFillAlpha: 1,
    alpha: 0.96,
    insetPx: 2,
    topSheenAlpha: 0,
    highlightColor: '#f1e5d5',
    fiberColor: '#9a7651',
    fiberAlpha: 0,
    fiberStepPx: 6,
    speckleColor: '#7e5f40',
    speckleAlpha: 0,
    speckleCount: 0,
    labelPatch: true,
    labelPatchColor: '#fbfdff',
    labelPatchAlpha: 0.86,
    labelPatchBorderColor: '#475569',
    labelBarcodeColor: '#111827',
  },
  chest: {
    pattern: 'wood_planks',
    baseFillColor: '#6d4b31',
    baseFillAlpha: 1,
    alpha: 0.98,
    plankCount: 3,
    seamWidthPx: 1,
    grainCount: 5,
    nailRadiusPx: 1.25,
    insetPx: 2,
    topSheenAlpha: 0.22,
    seamColor: '#2b1e14',
    highlightColor: '#f5d8a6',
    bandColor: '#f1f5f9',
    bandAlpha: 0.3,
    lockPlateColor: '#fef3c7',
    lockPlateAlpha: 0.7,
  },
};

const BUILTIN_END_FURNACE_STYLES = {
  furnace: {},
  crusher: {
    wallColor: '#6b7280',
    wallShadeColor: '#434a55',
    rimColor: '#f3f4f6',
    mouthColor: '#111827',
    emberColor: '#ef4444',
    bodyPanelLines: true,
    hazardStripes: true,
    sideRivets: true,
  },
  shredder: {
    wallColor: '#475569',
    wallShadeColor: '#334155',
    rimColor: '#cbd5e1',
    mouthColor: '#020617',
    emberColor: '#60a5fa',
    bodyPanelLines: true,
    hazardStripes: false,
    sideRivets: true,
  },
  plasma_recycler: {
    wallColor: '#0f172a',
    wallShadeColor: '#1e293b',
    rimColor: '#94a3b8',
    mouthColor: '#020617',
    emberColor: '#a78bfa',
    bodyPanelLines: false,
    hazardStripes: false,
    sideRivets: true,
  },
};

const BUILTIN_WAREHOUSE_TEXTURE_STYLES = {
  concrete_checker: {
    tileSizePx: 240,
    paverWidthPx: 82,
    paverHeightPx: 82,
    groutPx: 3,
    layout: 'grid',
    rowOffsetPx: 0,
    pattern: 'checker_alternating',
    alternationStrength: 0.07,
    variation: 0.12,
    edgeShadingAlpha: 0,
    noiseCount: 20,
    seamDashCount: 8,
    baseColor: '#8f959c',
    groutColor: '#6e757e',
    seamDarkColor: '#4b545f',
    seamLightColor: '#b4bac1',
    scratchColor: '#5a616b',
  },
  cold_blueprint: {
    tileSizePx: 228,
    paverWidthPx: 76,
    paverHeightPx: 76,
    groutPx: 2,
    layout: 'grid',
    pattern: 'checker_alternating',
    alternationStrength: 0.06,
    variation: 0.08,
    edgeShadingAlpha: 0,
    noiseCount: 18,
    seamDashCount: 8,
    baseColor: '#96acbf',
    groutColor: '#72889b',
    seamDarkColor: '#526678',
    seamLightColor: '#c9d7e3',
    scratchColor: '#5f7387',
  },
  lab_metal_rivet: {
    tileSizePx: 220,
    paverWidthPx: 72,
    paverHeightPx: 72,
    groutPx: 2,
    layout: 'grid',
    pattern: 'checker_alternating',
    alternationStrength: 0.05,
    variation: 0.07,
    edgeShadingAlpha: 0.06,
    noiseCount: 14,
    seamDashCount: 8,
    rivetCount: 36,
    dentCount: 6,
    baseColor: '#8ea0ad',
    groutColor: '#617380',
    seamDarkColor: '#465560',
    seamLightColor: '#c6d3de',
    scratchColor: '#51606b',
    rivetColor: '#dbe8f2',
  },
  wood_corrugation: {
    tileSizePx: 246,
    paverWidthPx: 92,
    paverHeightPx: 76,
    groutPx: 2,
    layout: 'staggered',
    rowOffsetPx: 46,
    pattern: 'none',
    variation: 0.12,
    edgeShadingAlpha: 0.15,
    noiseCount: 20,
    seamDashCount: 12,
    baseColor: '#9a8266',
    groutColor: '#715c47',
    seamDarkColor: '#5a4736',
    seamLightColor: '#c3ae92',
    scratchColor: '#5b4939',
  },
  damaged_salvage: {
    tileSizePx: 232,
    paverWidthPx: 84,
    paverHeightPx: 84,
    groutPx: 2,
    layout: 'grid',
    pattern: 'checker_alternating',
    alternationStrength: 0.08,
    variation: 0.11,
    edgeShadingAlpha: 0.08,
    noiseCount: 22,
    seamDashCount: 14,
    rivetCount: 18,
    dentCount: 12,
    crackCount: 14,
    baseColor: '#7a838e',
    groutColor: '#545c66',
    seamDarkColor: '#3d434c',
    seamLightColor: '#9ea7b2',
    scratchColor: '#474e57',
    rivetColor: '#cbd5e1',
  },
  salvage_rivet: {
    tileSizePx: 224,
    paverWidthPx: 74,
    paverHeightPx: 74,
    groutPx: 2,
    layout: 'grid',
    pattern: 'checker_alternating',
    alternationStrength: 0.06,
    variation: 0.08,
    edgeShadingAlpha: 0.06,
    noiseCount: 16,
    seamDashCount: 10,
    rivetCount: 28,
    dentCount: 8,
    baseColor: '#7f8b97',
    groutColor: '#596572',
    seamDarkColor: '#414b55',
    seamLightColor: '#bac7d4',
    scratchColor: '#49545f',
    rivetColor: '#d8e3ee',
  },
};

const BUILTIN_BELT_TEXTURE_STYLES = {
  industrial_ribbed: {
    tileSizePx: 120,
    ribStepPx: 12,
    ribWidthPx: 8,
    sideBandPx: 18,
    sideCleatStepPx: 16,
    sideCleatLengthPx: 12,
    shadeAlpha: 0.55,
    baseColor: '#2a323b',
    shadeColor: '#202730',
    ribColor: '#4d5863',
    grooveColor: '#2b333c',
    sideCleatColor: '#6b7280',
    sideLineDarkColor: '#111827',
    sideLineLightColor: '#9ca3af',
  },
  cold_blueprint_belt: {
    tileSizePx: 126,
    ribStepPx: 13,
    ribWidthPx: 8,
    sideBandPx: 18,
    sideCleatStepPx: 16,
    sideCleatLengthPx: 11,
    shadeAlpha: 0.5,
    baseColor: '#3a5166',
    shadeColor: '#23384a',
    ribColor: '#69859e',
    grooveColor: '#2b3f51',
    sideCleatColor: '#8aa4bc',
    sideLineDarkColor: '#0f172a',
    sideLineLightColor: '#dbeafe',
  },
  lab_ribbed: {
    tileSizePx: 122,
    ribStepPx: 12,
    ribWidthPx: 8,
    sideBandPx: 18,
    sideCleatStepPx: 16,
    sideCleatLengthPx: 12,
    shadeAlpha: 0.56,
    baseColor: '#3a4c5c',
    shadeColor: '#223544',
    ribColor: '#617b90',
    grooveColor: '#2a3b49',
    sideCleatColor: '#8ca1b4',
    sideLineDarkColor: '#0f172a',
    sideLineLightColor: '#dbeafe',
    scuffCount: 8,
  },
  wood_corrugation_belt: {
    tileSizePx: 116,
    ribStepPx: 10,
    ribWidthPx: 7,
    sideBandPx: 16,
    sideCleatStepPx: 14,
    sideCleatLengthPx: 10,
    shadeAlpha: 0.58,
    baseColor: '#4a3929',
    shadeColor: '#2e2419',
    ribColor: '#70583f',
    grooveColor: '#3b2d21',
    sideCleatColor: '#8a7359',
    sideLineDarkColor: '#1a130d',
    sideLineLightColor: '#d1bfa7',
  },
  damaged_patched_belt: {
    tileSizePx: 118,
    ribStepPx: 11,
    ribWidthPx: 7,
    sideBandPx: 17,
    sideCleatStepPx: 15,
    sideCleatLengthPx: 10,
    shadeAlpha: 0.62,
    baseColor: '#38414a',
    shadeColor: '#212a33',
    ribColor: '#55606b',
    grooveColor: '#2a323b',
    sideCleatColor: '#68727d',
    sideLineDarkColor: '#0b1120',
    sideLineLightColor: '#b7c2ce',
    scuffCount: 18,
    patchCount: 8,
  },
  salvage_shredder_belt: {
    tileSizePx: 114,
    ribStepPx: 11,
    ribWidthPx: 7,
    sideBandPx: 17,
    sideCleatStepPx: 15,
    sideCleatLengthPx: 10,
    shadeAlpha: 0.6,
    baseColor: '#343d46',
    shadeColor: '#1f2730',
    ribColor: '#515d69',
    grooveColor: '#2a333c',
    sideCleatColor: '#738190',
    sideLineDarkColor: '#060b14',
    sideLineLightColor: '#d6e0ea',
    scuffCount: 10,
  },
};

/**
 * ConveyorRenderer
 * -----------------
 * Responsible for all drawing and pointer interactions using PixiJS.
 * - Draws belts, animated bricks, optional visual DRT indicator, and HUD text.
 * - Exposes onBrickClick callback so higher-level logic controls game state.
 *
 * Notes on PixiJS v7 API:
 * - In v7 the Application constructor accepts options directly. We keep the init
 *   routine synchronous to avoid compatibility issues with older sub-versions.
 * - The canvas element can live on `app.view` or `app.canvas`, so we handle both
 *   cases before appending to the DOM.
 */

/**
 * PixiJS renderer responsible for drawing conveyors, bricks, HUD, and optional
 * visual DRT stimuli. Audio DRT is handled by the jsPsych plugin directly.
 */
export class ConveyorRenderer {
  config: Record<string, any>;
  onBrickClick: (brickId: string, x: number | null, y: number | null) => void;
  onBrickHold: (brickId: string, durationMs: number, x: number | null, y: number | null) => void;
  onBrickHoldState: (brickId: string, isHolding: boolean, x: number | null, y: number | null) => void;
  onBrickHover: (brickId: string, hovering: boolean, x: number | null, y: number | null) => void;
  onPointerDebug: (payload: Record<string, any>) => void;
  runtimeLengths: number[] | null;
  app: PIXI.Application | null;
  root: HTMLElement | null;
  brickSprites: Map<string, any>;
  hudElements: Record<string, any>;
  hudBackground: PIXI.Graphics | null;
  hudPointsAdornment: PIXI.Graphics | null;
  _lastHudText: string;
  _lastHudPanelSignature: string;
  _lastHudPointsAdornmentSignature: string;
  drtGraphics: PIXI.Graphics | null;
  backgroundTexture: PIXI.Texture | null;
  backgroundTextureOwned: boolean;
  backgroundVisual: PIXI.TilingSprite | null;
  beltTexture: PIXI.Texture | null;
  beltTextureOwned: boolean;
  beltVisuals: Array<Record<string, any>>;
  interactionLayer: PIXI.Container | null;
  conveyorZones: Map<string, PIXI.Graphics>;
  bricksByConveyor: Map<string, any[]>;
  conveyorHoldStart: Map<string, { brickId: string; t: number | null; mode: 'hold_duration' | 'hold_to_clear' }>;
  conveyorHovered: Set<string>;
  conveyorHoverTarget: Map<string, string>;
  conveyorPointerPos: Map<string, { x: number | null; y: number | null }>;
  spotlightZone: PIXI.Graphics | null;
  spotlightHoldStart: { brickId: string; t: number | null; mode: 'hold_duration' | 'hold_to_clear' } | null;
  spotlightHoveredBrickId: string | null;
  spotlightPointerPos: { x: number | null; y: number | null };
  spotlightPointerInside: boolean;
  effectVisuals: Array<Record<string, any>>;
  dueMarkerAnchors: Map<string, { x: number; y: number; width: number; height: number }>;
  furnaceAnchors: Map<string, { mouthX: number; mouthY: number; mouthWidth: number; mouthHeight: number }>;
  furnaceVisuals: Map<string, Record<string, any>>;
  furnaceFlickerTimeMs: number;
  spotlightGraphics: PIXI.Graphics | null;
  spotlightRing: PIXI.Graphics | null;
  holdProgressGraphics: PIXI.Graphics | null;
  spotlightRect: { x: number; y: number; w: number; h: number } | null;
  activeBrickId: string | null;
  brickHoldStart: Map<string, { t: number; x: number; y: number }>;
  canvasView: any;
  pointerInCanvas: boolean;
  pointerCanvasPos: { x: number | null; y: number | null };
  _teardownCanvasPointerTracking: (() => void) | null;
  _brickHoveredId: string | null;
  pointerDebugEnabled: boolean;
  pointerDebugLines: string[];
  pointerDebugText: PIXI.Text | null;
  pointerDebugSeq: number;
  pixelSnapBricks: boolean;
  _spriteSyncEpoch: number;
  _lastSpotlightSignature: string;
  perfStats: {
    effectDropsSkipped: number;
    effectsDestroyed: number;
    clearEffectsQueued: number;
    peakActiveEffects: number;
    peakBrickSprites: number;
  };
  _styleLookupCache: WeakMap<Record<string, any>, Map<string, any>>;
  seed: number;
  _rngState: number;
  beltLayer!: PIXI.Container;
  backgroundLayer!: PIXI.Container;
  brickLayer!: PIXI.Container;
  effectLayer!: PIXI.Container;
  characterLayer!: PIXI.Container;
  spotlightLayer!: PIXI.Container;
  hudLayer!: PIXI.Container;
  drtLayer!: PIXI.Container;
  characterSprite: CharacterSprite | null = null;

  constructor(config: Record<string, any>, { onBrickClick, onBrickHold, onBrickHoldState, onBrickHover, onPointerDebug, runtimeLengths, seed }: Record<string, any> = {}) {
    this.config = config;
    this.onBrickClick = typeof onBrickClick === 'function' ? onBrickClick : () => {};
    this.onBrickHold = typeof onBrickHold === 'function' ? onBrickHold : () => {};
    this.onBrickHoldState = typeof onBrickHoldState === 'function' ? onBrickHoldState : () => {};
    this.onBrickHover = typeof onBrickHover === 'function' ? onBrickHover : () => {};
    this.onPointerDebug = typeof onPointerDebug === 'function' ? onPointerDebug : () => {};
    this.runtimeLengths = Array.isArray(runtimeLengths) ? runtimeLengths.slice() : null;
    this.app = null;
    this.root = null;
    this.brickSprites = new Map();
    this.hudElements = {};
    this.hudBackground = null;
    this.hudPointsAdornment = null;
    this._lastHudText = '';
    this._lastHudPanelSignature = '';
    this._lastHudPointsAdornmentSignature = '';
    this.drtGraphics = null;
    this.backgroundTexture = null;
    this.backgroundTextureOwned = false;
    this.backgroundVisual = null;
    this.beltTexture = null;
    this.beltTextureOwned = false;
    this.beltVisuals = [];
    this.interactionLayer = null;
    this.conveyorZones = new Map();
    this.bricksByConveyor = new Map();
    this.conveyorHoldStart = new Map();
    this.conveyorHovered = new Set();
    this.conveyorHoverTarget = new Map();
    this.conveyorPointerPos = new Map();
    this.spotlightZone = null;
    this.spotlightHoldStart = null;
    this.spotlightHoveredBrickId = null;
    this.spotlightPointerPos = { x: null, y: null };
    this.spotlightPointerInside = false;
    this.effectVisuals = [];
    this.dueMarkerAnchors = new Map();
    this.furnaceAnchors = new Map();
    this.furnaceVisuals = new Map();
    this.furnaceFlickerTimeMs = 0;
    this.spotlightGraphics = null;
    this.spotlightRing = null;
    this.holdProgressGraphics = null;
    this.spotlightRect = null;
    this.activeBrickId = null;
    this.brickHoldStart = new Map();
    this._styleLookupCache = new WeakMap();
    this.canvasView = null;
    this.pointerInCanvas = false;
    this.pointerCanvasPos = { x: null, y: null };
    this._teardownCanvasPointerTracking = null;
    this._brickHoveredId = null;
    this.pointerDebugEnabled = Boolean(config?.debug?.pointerOverlay || config?.debug?.pointerConsole);
    this.pointerDebugLines = [];
    this.pointerDebugText = null;
    this.pointerDebugSeq = 0;
    this.pixelSnapBricks = false;
    this._spriteSyncEpoch = 0;
    this._lastSpotlightSignature = '';
    this.perfStats = {
      effectDropsSkipped: 0,
      effectsDestroyed: 0,
      clearEffectsQueued: 0,
      peakActiveEffects: 0,
      peakBrickSprites: 0
    };
    this.seed = Number.isFinite(Number(seed)) ? (Number(seed) >>> 0) : 0x9e3779b9;
    this._rngState = this.seed || 0x9e3779b9;
  }

  _nextRand() {
    // xorshift32 PRNG for deterministic renderer-side procedural visuals.
    let x = this._rngState >>> 0;
    x ^= (x << 13) >>> 0;
    x ^= x >>> 17;
    x ^= (x << 5) >>> 0;
    this._rngState = x >>> 0;
    return (this._rngState >>> 0) / 0x100000000;
  }

  async init(container: HTMLElement) {
    if (!container) {
      throw new Error('Renderer requires a DOM container.');
    }
    this.root = container;
    const perfCfg = this.config?.display?.performance || {};
    const configuredMaxDpr = Number(perfCfg.maxDevicePixelRatio ?? 1.5);
    const maxDpr = Number.isFinite(configuredMaxDpr) ? Math.max(1, configuredMaxDpr) : 2;
    const resolution = Math.max(1, Math.min(window.devicePixelRatio || 1, maxDpr));
    const antialias = perfCfg.antialias === true;
    this.pixelSnapBricks = perfCfg.pixelSnapBricks === true;
    // Initialize Pixi Application (v7 pattern)
    this.app = new PIXI.Application({
      width: this.config.display.canvasWidth,
      height: this.config.display.canvasHeight,
      backgroundColor: toPixiColor(this.config.display.backgroundColor),
      antialias,
      autoDensity: true,
      resolution,
    });
    container.innerHTML = '';
    const view = (this.app as any).view || (this.app as any).canvas || null;
    if (view) {
      container.appendChild(view as Node);
      this.canvasView = view;
      const imageRendering = String(perfCfg.imageRendering ?? 'crisp-edges').trim();
      if (imageRendering) {
        (view as any).style.imageRendering = imageRendering;
      }
      this._bindCanvasPointerTracking(view);
    }
    if (this.app?.renderer) {
      (this.app.renderer as any).roundPixels = this.pixelSnapBricks;
    }

    this.beltLayer = new PIXI.Container();
    this.interactionLayer = new PIXI.Container();
    this.backgroundLayer = new PIXI.Container();
    this.brickLayer = new PIXI.Container();
    this.effectLayer = new PIXI.Container();
    this.characterLayer = new PIXI.Container();
    this.spotlightLayer = new PIXI.Container();
    this.hudLayer = new PIXI.Container();
    this.drtLayer = new PIXI.Container();

    this.app.stage.addChild(this.backgroundLayer);
    this.app.stage.addChild(this.beltLayer);
    this.app.stage.addChild(this.interactionLayer);
    this.app.stage.addChild(this.brickLayer);
    this.app.stage.addChild(this.effectLayer);
    this.app.stage.addChild(this.characterLayer);
    this.app.stage.addChild(this.spotlightLayer);
    this.app.stage.addChild(this.drtLayer);
    this.app.stage.addChild(this.hudLayer);

    this.holdProgressGraphics = new PIXI.Graphics();
    this.effectLayer.addChild(this.holdProgressGraphics);

    await this._prepareBackgroundTexture();
    await this._prepareBeltTexture();
    this._drawBackground();
    this._drawBelts();
    this._setupHUD();
    this._setupPointerDebug();
    await this._initCharacter();
  }

  _setupPointerDebug() {
    if (!this.pointerDebugEnabled || !this.app || !this.app.stage) {
      return;
    }
    const stage = this.app.stage;
    stage.eventMode = 'static';
    stage.hitArea = new PIXI.Rectangle(0, 0, this.config.display.canvasWidth, this.config.display.canvasHeight);

    stage.on('pointerdown', (e) => this._emitPointerDebug('stage_pointerdown', null, e));
    stage.on('pointerup', (e) => this._emitPointerDebug('stage_pointerup', null, e));
    stage.on('pointerupoutside', (e) => this._emitPointerDebug('stage_pointerupoutside', null, e));

    if (this.config?.debug?.pointerOverlay) {
      const text = new PIXI.Text('', {
        fill: 0x111827,
        fontSize: 12,
        fontFamily: 'monospace',
        align: 'left'
      });
      text.x = 8;
      text.y = Math.max(40, this.config.display.canvasHeight - 150);
      text.alpha = 0.92;
      text.zIndex = 9999;
      this.hudLayer.addChild(text);
      this.pointerDebugText = text;
      this._updatePointerDebugOverlay();
    }
  }

  async _initCharacter(): Promise<void> {
    const characterCfg = this.config?.display?.character;
    if (!characterCfg || characterCfg.enable !== true) return;
    const canvasWidth = Number(this.config.display.canvasWidth);
    const offsetYPx = Number(characterCfg.offsetYPx ?? 4);
    this.characterSprite = new CharacterSprite(characterCfg);
    this.characterLayer.addChild(this.characterSprite.displayObject);
    this.characterSprite.displayObject.x = canvasWidth / 2;
    this.characterSprite.displayObject.y = offsetYPx;
    await this.characterSprite.load();
  }

  updateCharacter(dt: number, clearedCount: number, droppedCount: number): void {
    if (!this.characterSprite) return;
    if (clearedCount > 0) this.characterSprite.onClear();
    if (droppedCount > 0) this.characterSprite.onDrop();
    this.characterSprite.update(dt);
  }

  _emitPointerDebug(type: string, brickId: string | null, e: any, extra: Record<string, any> = {}) {
    if (!this.pointerDebugEnabled) {
      return;
    }
    const x = (e && (e.globalX ?? (e.global && e.global.x))) ?? null;
    const y = (e && (e.globalY ?? (e.global && e.global.y))) ?? null;
    const payload = {
      seq: ++this.pointerDebugSeq,
      type,
      brick_id: brickId ?? null,
      x,
      y,
      ...extra
    };
    this.onPointerDebug(payload);
    const line = `${String(payload.seq).padStart(3, '0')} ${type} b=${payload.brick_id ?? '-'} x=${x ?? '-'} y=${y ?? '-'}`;
    this.pointerDebugLines.push(line);
    if (this.pointerDebugLines.length > 8) {
      this.pointerDebugLines.shift();
    }
    this._updatePointerDebugOverlay();
  }

  _updatePointerDebugOverlay() {
    if (!this.pointerDebugText) {
      return;
    }
    const lines = this.pointerDebugLines.length > 0
      ? this.pointerDebugLines
      : ['pointer debug armed; waiting for events...'];
    this.pointerDebugText.text = `POINTER DEBUG\n${lines.join('\n')}`;
  }

  _findCustomStyle(customStyles: Record<string, any>, styleId: string) {
    if (!customStyles || typeof customStyles !== 'object') {
      return undefined;
    }
    let cache = this._styleLookupCache.get(customStyles);
    if (!cache) {
      cache = new Map();
      for (const key of Object.keys(customStyles)) {
        cache.set(normalizeTextureStyleId(key), customStyles[key]);
      }
      this._styleLookupCache.set(customStyles, cache);
    }
    return cache.get(styleId);
  }

  _resolveBeltProceduralStyleConfig(texCfg: Record<string, any>) {
    const styleId = normalizeTextureStyleId(texCfg?.style ?? '');
    const builtin = (BUILTIN_BELT_TEXTURE_STYLES as Record<string, any>)?.[styleId];
    const base = (builtin && typeof builtin === 'object') ? builtin : {};
    const customStyles = texCfg?.styles && typeof texCfg.styles === 'object' ? texCfg.styles : {};
    const custom = this._findCustomStyle(customStyles, styleId);
    const customObj = (custom && typeof custom === 'object') ? custom : {};
    const procedural = (texCfg?.proceduralTopdown && typeof texCfg.proceduralTopdown === 'object')
      ? texCfg.proceduralTopdown
      : {};
    return { ...base, ...customObj, ...procedural };
  }

  _resolveWarehouseProceduralStyleConfig(texCfg: Record<string, any>) {
    const styleId = normalizeTextureStyleId(texCfg?.style ?? '');
    const builtin = (BUILTIN_WAREHOUSE_TEXTURE_STYLES as Record<string, any>)?.[styleId];
    const base = (builtin && typeof builtin === 'object') ? builtin : {};
    const customStyles = texCfg?.styles && typeof texCfg.styles === 'object' ? texCfg.styles : {};
    const custom = this._findCustomStyle(customStyles, styleId);
    const customObj = (custom && typeof custom === 'object') ? custom : {};
    const procedural = (texCfg?.proceduralWarehouse && typeof texCfg.proceduralWarehouse === 'object')
      ? texCfg.proceduralWarehouse
      : {};
    return { ...base, ...customObj, ...procedural };
  }

  async _prepareBeltTexture() {
    try {
      const texCfg = this.config?.display?.beltTexture || {};
      if (!texCfg.enable) {
        this.beltTexture = null;
        this.beltTextureOwned = false;
        return;
      }
      const renderMode = String(texCfg.renderMode ?? 'image').toLowerCase();
      if (renderMode === 'procedural_topdown') {
        // Handled per-lane in _drawBelts to support height variations
        this.beltTexture = null;
        this.beltTextureOwned = false;
        return;
      }
      const src = texCfg.src || 'assets/belt-texture.png';
      this.beltTexture = await loadCachedImageTexture(src);
      this.beltTextureOwned = false;
    } catch (error) {
      console.warn('Failed to load belt texture; falling back to solid fill.', error);
      this.beltTexture = null;
      this.beltTextureOwned = false;
    }
  }

  _drawProceduralTopdownBeltGraphics(target: PIXI.Graphics, {
    beltHeight,
    styleCfg = {},
    styleScaleX = 1,
    styleScaleY = 1
  }: Record<string, any> = {}) {
    if (!target) {
      return;
    }
    const height = Math.max(1, Number(beltHeight) || 1);
    const pixelStep = (() => {
      const resolution = Math.max(1, Number(this.app?.renderer?.resolution) || 1);
      return 1 / resolution;
    })();

    const tileSize = Math.max(48, Number(styleCfg.tileSizePx ?? 120));
    const patternScaleX = Math.max(1e-6, (height / tileSize) * Math.max(0.01, Number(styleScaleX) || 1));
    const patternScaleY = Math.max(1e-6, (height / tileSize) * Math.max(0.01, Number(styleScaleY) || 1));

    const ribStepRaw = Math.max(pixelStep * 2, Number(styleCfg.ribStepPx ?? 12) * patternScaleX);
    const ribStep = this._roundSymmetric(ribStepRaw, pixelStep);
    const sideCleatStep = Math.max(pixelStep * 2, this._roundSymmetric(Number(styleCfg.sideCleatStepPx ?? 16) * patternScaleX, pixelStep));
    
    // Ensure tileWidth is a multiple of both ribStep and sideCleatStep for a seamless loop.
    // 480 is a good base width, we round it up to the next common multiple.
    const lcm = (a: number, b: number) => {
      const step = Math.max(a, b, 1);
      for (let i = step; i < 10000; i += 0.001) {
        if (Math.abs(i % a) < 0.001 && Math.abs(i % b) < 0.001) return i;
      }
      return a * b;
    };
    // For simplicity since they are often integers or simple fractions:
    const baseTileWidth = 480;
    const ribCount = Math.ceil(baseTileWidth / ribStep);
    const tileWidth = ribCount * ribStep;

    const snap = (value: number) => this._roundSymmetric(value, pixelStep);
    const snapSize = (value: number, min: number = pixelStep) => Math.max(min, snap(value));
    
    const ribWidthRaw = snapSize(Number(styleCfg.ribWidthPx ?? 8) * patternScaleX, pixelStep);
    const ribWidth = Math.max(pixelStep, Math.min(ribStep - pixelStep, ribWidthRaw));
    const sideBand = Math.max(pixelStep, snapSize(Number(styleCfg.sideBandPx ?? Math.round(tileSize * 0.16)) * patternScaleY, pixelStep));
    const sideCleatLen = Math.max(pixelStep, snapSize(Number(styleCfg.sideCleatLengthPx ?? Math.round((Number(styleCfg.sideCleatStepPx ?? 16)) * 0.75)) * patternScaleX, pixelStep));
    const shadeAlpha = Math.max(0, Math.min(1, Number(styleCfg.shadeAlpha ?? 0.55)));
    const beltBase = toPixiColor(styleCfg.baseColor ?? '#2a323b');
    const beltShade = toPixiColor(styleCfg.shadeColor ?? '#202730');
    const ribColor = toPixiColor(styleCfg.ribColor ?? '#4d5863');
    const grooveColor = toPixiColor(styleCfg.grooveColor ?? '#2b333c');
    const sideLineDark = toPixiColor(styleCfg.sideLineDarkColor ?? '#111827');
    const sideLineLight = toPixiColor(styleCfg.sideLineLightColor ?? '#9ca3af');
    const cleatColor = toPixiColor(styleCfg.sideCleatColor ?? '#6b7280');
    const scuffColor = toPixiColor(styleCfg.scuffColor ?? '#cbd5e1');
    const patchColor = toPixiColor(styleCfg.patchColor ?? '#111827');
    const scuffCount = Math.max(0, Math.floor(Number(styleCfg.scuffCount ?? 0)));
    const patchCount = Math.max(0, Math.floor(Number(styleCfg.patchCount ?? 0)));
    const workingHeight = Math.max(pixelStep, snapSize(height - sideBand * 2 - (4 * patternScaleY), pixelStep));

    target.clear();
    // Fill background
    target.beginFill(beltBase, 1);
    target.drawRect(0, 0, tileWidth, height);
    target.endFill();

    if (shadeAlpha > 0) {
      target.beginFill(beltShade, shadeAlpha);
      target.drawRect(0, Math.floor(height * 0.5), tileWidth, Math.ceil(height * 0.5));
      target.endFill();
    }

    // Ribs
    for (let x = 0; x < tileWidth; x += ribStep) {
      target.beginFill(ribColor, 0.9);
      target.drawRect(x, snap(sideBand + 2), ribWidth, workingHeight);
      target.endFill();

      target.beginFill(grooveColor, 0.92);
      const grooveX = snap(x + ribWidth);
      const grooveW = Math.max(pixelStep, snapSize(ribStep - ribWidth, pixelStep));
      target.drawRect(grooveX, snap(sideBand + 2), grooveW, workingHeight);
      target.endFill();
    }

    // Side Cleats
    for (let x = 0; x < tileWidth; x += sideCleatStep) {
      const cleatH = Math.max(pixelStep, snapSize(6 * patternScaleY, pixelStep));
      const cleatYTop = snap(Math.max(pixelStep, sideBand - (8 * patternScaleY)));
      const cleatYBottom = snap(Math.min(height - (7 * patternScaleY), height - sideBand + (2 * patternScaleY)));
      target.beginFill(cleatColor, 0.7);
      target.drawRoundedRect(x, cleatYTop, sideCleatLen, cleatH, Math.max(pixelStep, snapSize(patternScaleY, pixelStep)));
      target.drawRoundedRect(x, cleatYBottom, sideCleatLen, cleatH, Math.max(pixelStep, snapSize(patternScaleY, pixelStep)));
      target.endFill();
    }

    // Side lines
    const lineH = Math.max(pixelStep, snapSize(2 * patternScaleY, pixelStep));
    target.beginFill(sideLineDark, 0.65);
    target.drawRect(0, snap(sideBand - (2 * patternScaleY)), tileWidth, lineH);
    target.drawRect(0, snap(height - sideBand), tileWidth, lineH);
    target.endFill();

    target.beginFill(sideLineLight, 0.2);
    target.drawRect(0, snap(sideBand), tileWidth, lineH);
    target.drawRect(0, snap(height - sideBand - (2 * patternScaleY)), tileWidth, lineH);
    target.endFill();

    // Procedural wear (random scuffs/patches)
    const prand = (seed: number) => {
      let x = (seed >>> 0) || 1;
      x ^= (x << 13) >>> 0;
      x ^= x >>> 17;
      x ^= (x << 5) >>> 0;
      return (x >>> 0) / 0x100000000;
    };

    if (scuffCount > 0) {
      for (let i = 0; i < scuffCount * (tileWidth / 120); i += 1) {
        const s0 = (i * 73856093) ^ 0x1f123bb5;
        const s1 = (i * 19349663) ^ 0x7a4d4c95;
        const s2 = (i * 83492791) ^ 0x12b9b0a1;
        const s3 = (i * 2654435761) ^ 0x4f1bbcdc;
        const px = snap(prand(s0) * tileWidth);
        const py = snap(prand(s1) * height);
        const w = snapSize((6 + prand(s2) * 16) * patternScaleX, pixelStep);
        const h = snapSize((1 + prand(s3) * 2) * patternScaleY, pixelStep);
        target.beginFill(scuffColor, 0.08 + prand(s1 ^ 0x9e3779b9) * 0.18);
        target.drawRoundedRect(px, py, w, h, Math.max(pixelStep, h * 0.4));
        target.endFill();
      }
    }

    if (patchCount > 0) {
      for (let i = 0; i < patchCount * (tileWidth / 120); i += 1) {
        const s0 = (i * 2654435761) ^ 0x55aaff11;
        const s1 = (i * 374761393) ^ 0x9b93f6d5;
        const s2 = (i * 1103515245) ^ 0x3c6ef372;
        const s3 = (i * 668265263) ^ 0xda3e39cb;
        const w = snapSize((10 + prand(s2) * 16) * patternScaleX, pixelStep);
        const h = snapSize((5 + prand(s3) * 6) * patternScaleY, pixelStep);
        const px = snap(prand(s0) * (tileWidth - w));
        const py = snap(prand(s1) * (height - h));
        target.beginFill(patchColor, 0.14 + prand(s2 ^ 0x6a09e667) * 0.22);
        target.drawRect(px, py, w, h);
        target.endFill();
        target.beginFill(sideLineLight, 0.18);
        target.drawRect(px + pixelStep, py + pixelStep, Math.max(pixelStep, w - pixelStep * 2), pixelStep);
        target.endFill();
      }
    }
    return tileWidth;
  }

  _buildProceduralWarehouseTexture(styleCfg: Record<string, any> = {}) {
    if (!this.app?.renderer) {
      return null;
    }
    const tileSize = Math.max(120, Number(styleCfg.tileSizePx ?? 240));
    const paverW = Math.max(36, Number(styleCfg.paverWidthPx ?? 80));
    const paverH = Math.max(36, Number(styleCfg.paverHeightPx ?? 80));
    const grout = Math.max(1, Number(styleCfg.groutPx ?? 3));
    const layout = String(styleCfg.layout ?? 'grid').toLowerCase();
    const useStagger = layout === 'staggered';
    const rowOffsetPx = Number.isFinite(Number(styleCfg.rowOffsetPx))
      ? Math.max(0, Number(styleCfg.rowOffsetPx))
      : Math.floor(paverW * 0.5);
    const variance = Math.max(0, Math.min(1, Number(styleCfg.variation ?? 0.16)));
    const alternatingPattern = String(styleCfg.pattern ?? 'none').toLowerCase() === 'checker_alternating';
    const alternationStrength = Math.max(0, Math.min(1, Number(styleCfg.alternationStrength ?? 0.08)));
    const noiseCount = Math.max(0, Number(styleCfg.noiseCount ?? 28));
    const seamDashCount = Math.max(0, Number(styleCfg.seamDashCount ?? 10));
    const rivetCount = Math.max(0, Number(styleCfg.rivetCount ?? 0));
    const dentCount = Math.max(0, Number(styleCfg.dentCount ?? 0));
    const crackCount = Math.max(0, Number(styleCfg.crackCount ?? 0));

    const baseColor = PIXI.Color.shared.setValue(styleCfg.baseColor ?? '#8e949b').toRgbArray();
    const groutColor = toPixiColor(styleCfg.groutColor ?? '#6f757d');
    const seamDark = toPixiColor(styleCfg.seamDarkColor ?? '#4e5660');
    const seamLight = toPixiColor(styleCfg.seamLightColor ?? '#b0b6bc');
    const scratchColor = toPixiColor(styleCfg.scratchColor ?? '#5f6670');
    const rivetColor = toPixiColor(styleCfg.rivetColor ?? '#d1d5db');
    const edgeShadingAlpha = Math.max(0, Math.min(1, Number(styleCfg.edgeShadingAlpha ?? 0)));

    const toHexRgb = (r: number, g: number, b: number) => ((r << 16) | (g << 8) | b);
    const varyColor = (rgb: number[], amp: number, bias: number = 0) => {
      const jitter = ((this._nextRand() * 2) - 1) * amp * 255;
      const delta = jitter + (bias * 255);
      const r = Math.max(0, Math.min(255, Math.round(rgb[0] * 255 + delta)));
      const g = Math.max(0, Math.min(255, Math.round(rgb[1] * 255 + delta)));
      const b = Math.max(0, Math.min(255, Math.round(rgb[2] * 255 + delta)));
      return toHexRgb(r, g, b);
    };

    // Checkerboard tiling must span an even number of cells per texture repeat.
    // Otherwise parity flips at wrap boundaries and creates duplicate bands.
    const colsRaw = Math.max(2, Math.floor(tileSize / paverW));
    const rowsRaw = Math.max(2, Math.floor(tileSize / paverH));
    const cols = colsRaw % 2 === 0 ? colsRaw : colsRaw + 1;
    const rows = rowsRaw % 2 === 0 ? rowsRaw : rowsRaw + 1;
    const texW = cols * paverW;
    const texH = rows * paverH;

    const g = new PIXI.Graphics();
    g.beginFill(varyColor(baseColor, variance * 0.35), 1);
    g.drawRect(0, 0, texW, texH);
    g.endFill();

    for (let y = 0; y < texH; y += paverH) {
      const rowIndex = Math.floor(y / paverH);
      const rowOffset = useStagger && (rowIndex % 2 !== 0) ? rowOffsetPx : 0;
      const startX = useStagger ? -rowOffset : 0;
      for (let xBase = startX; xBase < texW + (useStagger ? paverW : 0); xBase += paverW) {
        const x = Math.max(0, xBase);
        const w = Math.min(paverW, texW - x);
        const h = Math.min(paverH, texH - y);
        if (w <= 0 || h <= 0) {
          continue;
        }
        const colIndex = Math.floor((xBase - startX) / paverW);
        const parity = (rowIndex + colIndex) % 2 === 0 ? 1 : -1;
        const patternBias = alternatingPattern ? (parity * alternationStrength) : 0;
        g.beginFill(varyColor(baseColor, variance, patternBias), 1);
        g.drawRect(x, y, w, h);
        g.endFill();

        if (edgeShadingAlpha > 0) {
          g.beginFill(seamLight, edgeShadingAlpha * (0.6 + this._nextRand() * 0.4));
          g.drawRect(x + 1, y + 1, Math.max(1, w - 2), 1);
          g.endFill();
          g.beginFill(seamDark, edgeShadingAlpha * (0.65 + this._nextRand() * 0.35));
          g.drawRect(x + 1, y + h - 2, Math.max(1, w - 2), 1);
          g.endFill();
        }
      }
    }

    g.beginFill(groutColor, 0.75);
    if (!useStagger) {
      // Strict checkerboard/grid mode: no half-tiles, fully regular grout.
      for (let x = 0; x <= texW; x += paverW) {
        g.drawRect(x, 0, grout, texH);
      }
      for (let y = 0; y <= texH; y += paverH) {
        g.drawRect(0, y, texW, grout);
      }
    } else {
      // Staggered mode keeps per-row shifted grout.
      for (let y = 0; y < texH; y += paverH) {
        const rowIndex = Math.floor(y / paverH);
        const rowOffset = (rowIndex % 2 === 0) ? 0 : rowOffsetPx;
        const yLine = Math.max(0, y);
        g.drawRect(0, yLine, texW, grout);
        for (let x = -rowOffset; x < texW + paverW; x += paverW) {
          const xLine = Math.max(0, x);
          if (xLine < texW) {
            g.drawRect(xLine, yLine, grout, Math.min(paverH + grout, texH - yLine));
          }
        }
      }
    }
    g.endFill();

    // Small seam dashes / wear marks.
    for (let i = 0; i < seamDashCount; i += 1) {
      const x = Math.floor(this._nextRand() * texW);
      const y = Math.floor(this._nextRand() * texH);
      const w = Math.max(6, Math.floor(this._nextRand() * 18));
      const h = 2;
      g.beginFill(seamDark, 0.18 + this._nextRand() * 0.2);
      g.drawRoundedRect(x, y, w, h, 1);
      g.endFill();
    }

    // Speckle noise / tiny scratches.
    for (let i = 0; i < noiseCount; i += 1) {
      const x = Math.floor(this._nextRand() * texW);
      const y = Math.floor(this._nextRand() * texH);
      const w = Math.max(1, Math.floor(this._nextRand() * 4));
      const h = Math.max(1, Math.floor(this._nextRand() * 3));
      g.beginFill(scratchColor, 0.07 + this._nextRand() * 0.14);
      g.drawRect(x, y, w, h);
      g.endFill();
    }

    for (let i = 0; i < rivetCount; i += 1) {
      const x = Math.floor(this._nextRand() * texW);
      const y = Math.floor(this._nextRand() * texH);
      const r = 1 + Math.floor(this._nextRand() * 2);
      g.beginFill(rivetColor, 0.28 + this._nextRand() * 0.26);
      g.drawCircle(x, y, r);
      g.endFill();
      g.beginFill(seamDark, 0.16);
      g.drawCircle(x + 0.5, y + 0.5, Math.max(1, r - 1));
      g.endFill();
    }

    for (let i = 0; i < dentCount; i += 1) {
      const x = Math.floor(this._nextRand() * texW);
      const y = Math.floor(this._nextRand() * texH);
      const rx = Math.max(3, Math.floor(4 + this._nextRand() * 7));
      const ry = Math.max(2, Math.floor(3 + this._nextRand() * 5));
      g.beginFill(seamDark, 0.06 + this._nextRand() * 0.1);
      g.drawEllipse(x, y, rx, ry);
      g.endFill();
      g.beginFill(seamLight, 0.04 + this._nextRand() * 0.08);
      g.drawEllipse(x - 1, y - 1, Math.max(1, rx - 2), Math.max(1, ry - 2));
      g.endFill();
    }

    for (let i = 0; i < crackCount; i += 1) {
      const x = Math.floor(this._nextRand() * texW);
      const y = Math.floor(this._nextRand() * texH);
      const len = Math.max(8, Math.floor(12 + this._nextRand() * 24));
      const dy = Math.floor((this._nextRand() - 0.5) * 8);
      g.beginFill(seamDark, 0.2 + this._nextRand() * 0.16);
      g.drawRect(x, y, len, 1);
      g.drawRect(x + Math.floor(len * 0.45), y + dy, Math.max(2, Math.floor(len * 0.28)), 1);
      g.endFill();
    }

    const texture = this.app.renderer.generateTexture(g, {
      region: new PIXI.Rectangle(0, 0, texW, texH),
      resolution: 1
    });
    g.destroy();
    return texture;
  }

  _drawBelts() {
    const { beltColor, beltHeight, beltGap, canvasHeight } = this.config.display;
    const n = this.config.conveyors.nConveyors;
    const totalHeight = n * beltHeight + (n - 1) * beltGap;
    const topOffset = (canvasHeight - totalHeight) / 2;
    const runtimeLengths = Array.isArray(this.runtimeLengths)
      ? this.runtimeLengths
      : Array.isArray(this.config.conveyors.runtimeLengths)
        ? this.config.conveyors.runtimeLengths
      : null;
    const fallbackLength = (() => {
      const spec = this.config.conveyors.lengthPx;
      if (typeof spec === 'number') {
        return spec;
      }
      if (spec && typeof spec === 'object') {
        const value = Number(spec.value);
        if (Number.isFinite(value)) {
          return value;
        }
      }
      return this.config.display.canvasWidth;
    })();
    this.beltLayer.removeChildren();
    this.interactionLayer?.removeChildren?.();
    this.conveyorZones.clear();
    this.spotlightZone = null;
    this.spotlightHoldStart = null;
    this.spotlightHoveredBrickId = null;
    this.spotlightPointerInside = false;
    this.beltVisuals = [];
    this.dueMarkerAnchors.clear();
    this.furnaceAnchors.clear();
    this.furnaceVisuals.clear();
    const useTexture = !!this.beltTexture && (this.config?.display?.beltTexture?.enable === true);
    const beltTexCfg = this.config?.display?.beltTexture || {};
    const beltRenderMode = String(beltTexCfg.renderMode ?? 'image').toLowerCase();
    const scrollRenderMode = String(beltTexCfg.scrollRenderMode ?? 'auto').trim().toLowerCase();
    const useProceduralTexture = beltRenderMode === 'procedural_topdown' && scrollRenderMode !== 'tiling';
    const proceduralStyleCfg = useProceduralTexture ? this._resolveBeltProceduralStyleConfig(beltTexCfg) : null;
    const alpha = Number(this.config?.display?.beltTexture?.alpha ?? 1);
    const scaleX = Number(this.config?.display?.beltTexture?.scaleX ?? this.config?.display?.beltTexture?.scale ?? 1);
    const scaleY = Number(this.config?.display?.beltTexture?.scaleY ?? this.config?.display?.beltTexture?.scale ?? 1);
    const pixelSnap = this.config?.display?.beltTexture?.pixelSnap ?? this.pixelSnapBricks;
    const tint = this.config?.display?.beltTexture?.tint ?? null;

    const resolution = Math.max(1, Number(this.app?.renderer?.resolution) || 1);
    const brickSnapStep = this.pixelSnapBricks ? 1 : (1 / resolution);

    for (let i = 0; i < n; i += 1) {
      const y = topOffset + i * (beltHeight + beltGap);
      const sampledLength =
        runtimeLengths && Number.isFinite(runtimeLengths[i])
          ? runtimeLengths[i]
          : fallbackLength;
      const length = Math.max(0, sampledLength);
      if (useProceduralTexture) {
        const g = new PIXI.Graphics();
        const tileWidth = this._drawProceduralTopdownBeltGraphics(g, {
          beltHeight,
          styleCfg: proceduralStyleCfg,
          styleScaleX: scaleX,
          styleScaleY: scaleY
        });

        if (!this.app?.renderer) {
          g.destroy();
          continue;
        }
        
        // Use an explicit region to avoid clipping empty margins (which caused black bars)
        const texture = this.app.renderer.generateTexture(g, {
          region: new PIXI.Rectangle(0, 0, tileWidth, beltHeight),
          resolution: resolution
        });
        g.destroy();

        const sprite = new PIXI.TilingSprite(texture, length, beltHeight);
        sprite.x = 0;
        sprite.y = pixelSnap ? this._roundSymmetric(y, brickSnapStep) : y;
        sprite.roundPixels = pixelSnap;
        sprite.alpha = Number.isFinite(alpha) ? Math.max(0, Math.min(1, alpha)) : 1;
        if (tint) {
          sprite.tint = toPixiColor(tint);
        }

        this.beltLayer.addChild(sprite);
        this.beltVisuals.push({
          type: 'tiling',
          node: sprite,
          offsetX: 0,
          pixelSnap,
          beltLength: length,
          beltHeight,
          styleCfg: proceduralStyleCfg,
          styleScaleX: scaleX,
          styleScaleY: scaleY,
          isProcedural: true
        });
      } else if (useTexture) {
        let sprite;
        try {
          sprite = new (PIXI.TilingSprite as any)({ texture: this.beltTexture, width: length, height: beltHeight });
        } catch (_) {
          sprite = new PIXI.TilingSprite(this.beltTexture!, length, beltHeight);
        }
        sprite.x = 0;
        sprite.y = pixelSnap ? this._roundSymmetric(y, brickSnapStep) : y;
        sprite.roundPixels = pixelSnap;
        sprite.alpha = Number.isFinite(alpha) ? Math.max(0, Math.min(1, alpha)) : 1;
        if (tint) {
          sprite.tint = toPixiColor(tint);
        }
        // Control density of pattern.
        try {
          // Auto-scale texture to fit belt height, preserving aspect ratio.
          const baseScale = beltHeight / sprite.texture.height;
          sprite.tileScale.set(baseScale * scaleX, baseScale * scaleY);
        } catch (_) {
          // Older Pixi versions may use different APIs; ignore.
        }
        try {
          // Reset tile origin so scrolling starts aligned.
          sprite.tilePosition.set(0, 0);
        } catch (_) {
          // ignore
        }
        this.beltLayer.addChild(sprite);
        this.beltVisuals.push({ type: 'tiling', node: sprite, offsetX: 0, pixelSnap });
      } else {
        const g = new PIXI.Graphics();
        const snappedY = pixelSnap ? this._roundSymmetric(y, brickSnapStep) : y;
        g.beginFill(toPixiColor(beltColor));
        g.drawRoundedRect(0, snappedY, length, beltHeight, 12);
        g.endFill();
        this.beltLayer.addChild(g);
        this.beltVisuals.push({ type: 'solid', node: g, offsetX: 0, pixelSnap });
      }
      const markerCfg = this.config.display?.dueDateMarker || {};
      if (markerCfg.enable === true) {
        const marker = new PIXI.Graphics();
        const markerColor = toPixiColor(markerCfg.color ?? '#f5f6fa');
        const markerWidth = Math.max(1, Number(markerCfg.widthPx ?? 3));
        const markerHeight = Math.max(10, Number(markerCfg.heightPx ?? Math.floor(beltHeight * 0.5)));
        const markerYRaw = y + (beltHeight - markerHeight) / 2;
        const markerY = pixelSnap ? this._roundSymmetric(markerYRaw, brickSnapStep) : markerYRaw;
        const markerAlpha = Math.max(0.1, Math.min(1, Number(markerCfg.alpha ?? 0.95)));
        const markerXRaw = length - markerWidth / 2;
        const markerX = pixelSnap ? this._roundSymmetric(markerXRaw, brickSnapStep) : markerXRaw;
        marker.beginFill(markerColor, markerAlpha);
        marker.drawRoundedRect(markerX, markerY, markerWidth, markerHeight, Math.min(3, markerWidth / 2));
        marker.endFill();
        this.beltLayer.addChild(marker);
        this.dueMarkerAnchors.set(`c${i}`, {
          x: length,
          y: markerY + markerHeight / 2,
          width: markerWidth,
          height: markerHeight
        });
      }
      this._drawEndFurnace(`c${i}`, y, beltHeight, length);
      this._drawConveyorZone(`c${i}`, y, length, beltHeight);
    }
  }

  _isInteractionToggleEnabled(setting: any) {
    if (typeof setting === 'boolean') {
      return setting;
    }
    if (setting && typeof setting === 'object') {
      return setting.enable === true;
    }
    return false;
  }

  _getInteractionTargetMode() {
    const interactionCfg = this.config?.bricks?.interaction || {};
    const explicitMode = String(
      interactionCfg.targetingArea ?? interactionCfg.targetArea ?? interactionCfg.hitAreaMode ?? ''
    ).trim().toLowerCase();
    if (explicitMode === 'conveyor' || explicitMode === 'spotlight' || explicitMode === 'brick') {
      return explicitMode;
    }
    if (this._isInteractionToggleEnabled(interactionCfg.conveyorWideHitArea)) {
      return 'conveyor';
    }
    if (this._isInteractionToggleEnabled(interactionCfg.spotlightWideHitArea)) {
      return 'spotlight';
    }
    return 'brick';
  }

  _isConveyorHitAreaEnabled() {
    return this._getInteractionTargetMode() === 'conveyor';
  }

  _isSpotlightHitAreaEnabled() {
    return this._getInteractionTargetMode() === 'spotlight';
  }

  _resolveSpotlightSnapMode() {
    const spotlightCfg = this.config?.display?.spotlight || {};
    const snapModeRaw = spotlightCfg.snapMode ?? spotlightCfg.geometrySnapMode ?? spotlightCfg.renderSnapMode;
    const text = String(snapModeRaw ?? 'none').trim().toLowerCase();
    if (text === 'none' || text === 'off' || text === 'false') {
      return 'none';
    }
    if (text === 'pixel' || text === 'legacy') {
      return 'pixel';
    }
    return 'screen';
  }

  _snapSpotlightGeometry(value: number, mode: string) {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) {
      return 0;
    }
    if (mode === 'none') {
      return numeric;
    }
    const resolution = Math.max(1, Number(this.app?.renderer?.resolution ?? 1));
    const step = mode === 'pixel' ? 1 : (1 / resolution);
    return this._roundSymmetric(numeric, step);
  }

  _roundSymmetric(value: number, step: number) {
    const s = Math.max(1e-6, step);
    return (value < 0 ? -Math.round(-value / s) : Math.round(value / s)) * s;
  }

  _quantizeSpotlightSignature(value: number, step: number) {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) {
      return '0';
    }
    const safeStep = Math.max(1e-4, Number(step) || 1);
    return String(Math.round(this._roundSymmetric(numeric, safeStep) / safeStep));
  }

  _extractPointerPosition(e: any) {
    return {
      x: (e && (e.globalX ?? (e.global && e.global.x))) ?? null,
      y: (e && (e.globalY ?? (e.global && e.global.y))) ?? null
    };
  }

  _bindCanvasPointerTracking(view: any) {
    if (!view || typeof view.addEventListener !== 'function') {
      return;
    }
    const updateFromEvent = (event: PointerEvent) => {
      const rect = view.getBoundingClientRect?.();
      if (!rect || rect.width <= 0 || rect.height <= 0) {
        return;
      }
      const nx = (event.clientX - rect.left) / rect.width;
      const ny = (event.clientY - rect.top) / rect.height;
      const x = nx * Number(this.config?.display?.canvasWidth ?? 0);
      const y = ny * Number(this.config?.display?.canvasHeight ?? 0);
      this.pointerCanvasPos = { x, y };
    };
    const onPointerEnter = (event: PointerEvent) => {
      this.pointerInCanvas = true;
      updateFromEvent(event);
    };
    const onPointerMove = (event: PointerEvent) => {
      this.pointerInCanvas = true;
      updateFromEvent(event);
    };
    const onPointerDown = (event: PointerEvent) => {
      this.pointerInCanvas = true;
      updateFromEvent(event);
    };
    const onPointerLeave = () => {
      this.pointerInCanvas = false;
      this.pointerCanvasPos = { x: null, y: null };
    };
    view.addEventListener('pointerenter', onPointerEnter, { passive: true });
    view.addEventListener('pointermove', onPointerMove, { passive: true });
    view.addEventListener('pointerdown', onPointerDown, { passive: true });
    view.addEventListener('pointerleave', onPointerLeave, { passive: true });
    this._teardownCanvasPointerTracking = () => {
      view.removeEventListener('pointerenter', onPointerEnter);
      view.removeEventListener('pointermove', onPointerMove);
      view.removeEventListener('pointerdown', onPointerDown);
      view.removeEventListener('pointerleave', onPointerLeave);
    };
  }

  _getTrackedPointerPosition() {
    if (!this.pointerInCanvas) {
      return null;
    }
    const x = Number(this.pointerCanvasPos?.x);
    const y = Number(this.pointerCanvasPos?.y);
    if (!Number.isFinite(x) || !Number.isFinite(y)) {
      return null;
    }
    return { x, y };
  }

  _setCanvasCursor(cursor: string) {
    if (!this.canvasView || !this.pointerInCanvas) {
      return;
    }
    this.canvasView.style.cursor = cursor;
  }

  _pickInteractiveBrickAtPoint(x: number, y: number) {
    let chosen: any = null;
    let chosenDepth = -Infinity;
    this.brickSprites.forEach((sprite: any) => {
      if (!sprite || sprite.eventMode === 'none' || sprite.visible === false) {
        return;
      }
      let contains = false;
      try {
        const bounds = sprite.getBounds?.();
        contains = Boolean(bounds?.contains?.(x, y));
      } catch (_) {
        contains = false;
      }
      if (!contains) {
        return;
      }
      const depth = Number(sprite.y ?? 0) * 10000 + Number(sprite.x ?? 0);
      if (depth >= chosenDepth) {
        chosen = sprite;
        chosenDepth = depth;
      }
    });
    return chosen;
  }

  _clearBrickHoverState(pos: { x: number | null; y: number | null } | null = null) {
    if (!this._brickHoveredId) {
      return;
    }
    if (this.config?.bricks?.completionMode === 'hover_to_clear') {
      this.onBrickHover(this._brickHoveredId, false, pos?.x ?? null, pos?.y ?? null);
    }
    this._brickHoveredId = null;
  }

  _reconcileStationaryPointerInteractions(completionMode: string) {
    const pos = this._getTrackedPointerPosition();
    if (!pos) {
      this._clearBrickHoverState();
      return;
    }
    const interactionMode = this._getInteractionTargetMode();
    let canInteract = false;

    if (interactionMode === 'spotlight') {
      const rect = this.spotlightRect;
      const inside = Boolean(
        rect &&
        pos.x >= rect.x &&
        pos.x <= (rect.x + rect.w) &&
        pos.y >= rect.y &&
        pos.y <= (rect.y + rect.h)
      );
      this.spotlightPointerInside = inside;
      this.spotlightPointerPos = { x: pos.x, y: pos.y };
      canInteract = inside && Boolean(this.activeBrickId);
      this._clearBrickHoverState(pos);
    } else if (interactionMode === 'conveyor') {
      let hoveredConveyorId: string | null = null;
      this.conveyorZones.forEach((zone, cid) => {
        if (hoveredConveyorId) {
          return;
        }
        try {
          const bounds = zone?.getBounds?.();
          if (bounds?.contains?.(pos.x, pos.y)) {
            hoveredConveyorId = cid;
          }
        } catch (_) {
          // ignore
        }
      });
      const previousHovered = new Set(this.conveyorHovered);
      this.conveyorHovered.clear();
      if (hoveredConveyorId) {
        this.conveyorHovered.add(hoveredConveyorId);
        this.conveyorPointerPos.set(hoveredConveyorId, { x: pos.x, y: pos.y });
        canInteract = Boolean(this._getConveyorTargetBrickId(hoveredConveyorId));
      }
      previousHovered.forEach((cid) => {
        if (this.conveyorHovered.has(cid)) {
          return;
        }
        const prev = this.conveyorHoverTarget.get(cid);
        this.conveyorHoverTarget.delete(cid);
        if (prev && completionMode === 'hover_to_clear') {
          this.onBrickHover(prev, false, pos.x, pos.y);
        }
      });
      this._clearBrickHoverState(pos);
    } else {
      const hoveredSprite = this._pickInteractiveBrickAtPoint(pos.x, pos.y);
      const nextId = hoveredSprite?.id ?? null;
      canInteract = Boolean(nextId);
      if (completionMode === 'hover_to_clear') {
        if (this._brickHoveredId && this._brickHoveredId !== nextId) {
          this.onBrickHover(this._brickHoveredId, false, pos.x, pos.y);
        }
        if (nextId && this._brickHoveredId !== nextId) {
          this.onBrickHover(nextId, true, pos.x, pos.y);
        }
        this._brickHoveredId = nextId;
      } else {
        this._clearBrickHoverState(pos);
      }
    }

    this._setCanvasCursor(canInteract ? 'pointer' : 'default');
  }

  _getConveyorTargetBrickId(conveyorId: string) {
    const entries = this.bricksByConveyor.get(String(conveyorId)) || [];
    if (!entries.length) {
      return null;
    }
    let selected = null;
    let selectedEdge = -Infinity;
    for (let i = 0; i < entries.length; i += 1) {
      const brick = entries[i];
      const edge = Number(brick?.x ?? 0) + Number(brick?.width ?? 0);
      if (edge > selectedEdge) {
        selected = brick;
        selectedEdge = edge;
      }
    }
    return selected?.id ?? null;
  }

  _syncSpotlightHoverTarget(completionMode: string) {
    if (!this._isSpotlightHitAreaEnabled() || completionMode !== 'hover_to_clear') {
      if (this.spotlightHoveredBrickId) {
        this.onBrickHover(
          this.spotlightHoveredBrickId,
          false,
          this.spotlightPointerPos?.x ?? null,
          this.spotlightPointerPos?.y ?? null
        );
        this.spotlightHoveredBrickId = null;
      }
      return;
    }
    const next = this.spotlightPointerInside ? (this.activeBrickId ?? null) : null;
    const prev = this.spotlightHoveredBrickId ?? null;
    if (prev === next) {
      return;
    }
    if (prev) {
      this._emitPointerDebug('spotlight_hover_end', prev, null);
      this.onBrickHover(prev, false, this.spotlightPointerPos?.x ?? null, this.spotlightPointerPos?.y ?? null);
    }
    if (next) {
      this._emitPointerDebug('spotlight_hover_begin', next, null);
      this.onBrickHover(next, true, this.spotlightPointerPos?.x ?? null, this.spotlightPointerPos?.y ?? null);
    }
    this.spotlightHoveredBrickId = next;
  }

  _clearSpotlightZoneInteraction() {
    const mode = this.config?.bricks?.completionMode;
    if (mode === 'hover_to_clear' && this.spotlightHoveredBrickId) {
      this._emitPointerDebug('spotlight_hover_end', this.spotlightHoveredBrickId, null);
      this.onBrickHover(
        this.spotlightHoveredBrickId,
        false,
        this.spotlightPointerPos?.x ?? null,
        this.spotlightPointerPos?.y ?? null
      );
    }
    this.spotlightHoveredBrickId = null;
    this.spotlightHoldStart = null;
    this.spotlightPointerInside = false;
  }

  _teardownSpotlightZone() {
    this._clearSpotlightZoneInteraction();
    if (this.spotlightZone?.destroy) {
      this.spotlightZone.destroy();
    }
    this.spotlightZone = null;
  }

  _ensureSpotlightZone(holeX: number, holeY: number, holeW: number, holeH: number, cornerRadius: number) {
    if (!this.interactionLayer || !this._isSpotlightHitAreaEnabled()) {
      this._teardownSpotlightZone();
      return;
    }
    if (!this.spotlightZone) {
      const zone = new PIXI.Graphics();
      zone.eventMode = 'dynamic';
      zone.cursor = 'pointer';

      const endSpotlightHold = (e: any) => {
        const holdState = this.spotlightHoldStart;
        if (!holdState) {
          return;
        }
        this.spotlightHoldStart = null;
        const pos = this._extractPointerPosition(e);
        this.spotlightPointerPos = pos;
        if (holdState.mode === 'hold_duration') {
          const holdDurationMs = Math.max(0, performance.now() - Number(holdState.t ?? performance.now()));
          this._emitPointerDebug('spotlight_hold_end', holdState.brickId, e, { hold_ms: Math.round(holdDurationMs) });
          this.onBrickHold(holdState.brickId, holdDurationMs, pos.x, pos.y);
          return;
        }
        this._emitPointerDebug('spotlight_hold_state_end', holdState.brickId, e);
        this.onBrickHoldState(holdState.brickId, false, pos.x, pos.y);
      };

      zone.on('pointerdown', (e) => {
        const mode = this.config?.bricks?.completionMode;
        const targetBrickId = this.activeBrickId ?? null;
        const pos = this._extractPointerPosition(e);
        this.spotlightPointerPos = pos;
        this.spotlightPointerInside = true;
        if (!targetBrickId) {
          this._emitPointerDebug('spotlight_pointerdown_no_target', null, e);
          return;
        }
        if (mode === 'hold_duration') {
          this.spotlightHoldStart = { brickId: targetBrickId, t: performance.now(), mode: 'hold_duration' };
          this._emitPointerDebug('spotlight_hold_begin', targetBrickId, e);
        } else if (mode === 'hold_to_clear') {
          this.spotlightHoldStart = { brickId: targetBrickId, t: null, mode: 'hold_to_clear' };
          this._emitPointerDebug('spotlight_hold_state_begin', targetBrickId, e);
          this.onBrickHoldState(targetBrickId, true, pos.x, pos.y);
        } else {
          this._emitPointerDebug('spotlight_click', targetBrickId, e);
          this.onBrickClick(targetBrickId, pos.x, pos.y);
        }
      });
      zone.on('pointerup', endSpotlightHold);
      zone.on('pointerupoutside', endSpotlightHold);
      zone.on('pointerover', (e) => {
        this.spotlightPointerInside = true;
        this.spotlightPointerPos = this._extractPointerPosition(e);
        this._syncSpotlightHoverTarget(this.config?.bricks?.completionMode);
      });
      zone.on('pointermove', (e) => {
        this.spotlightPointerPos = this._extractPointerPosition(e);
        this._syncSpotlightHoverTarget(this.config?.bricks?.completionMode);
      });
      zone.on('pointerout', (e) => {
        this.spotlightPointerInside = false;
        this.spotlightPointerPos = this._extractPointerPosition(e);
        this._syncSpotlightHoverTarget(this.config?.bricks?.completionMode);
      });
      zone.on('pointerleave', (e) => {
        this.spotlightPointerInside = false;
        this.spotlightPointerPos = this._extractPointerPosition(e);
        this._syncSpotlightHoverTarget(this.config?.bricks?.completionMode);
      });
      zone.on('pointercancel', (e) => {
        this.spotlightPointerInside = false;
        this.spotlightPointerPos = this._extractPointerPosition(e);
        endSpotlightHold(e);
        this._syncSpotlightHoverTarget(this.config?.bricks?.completionMode);
      });

      this.interactionLayer.addChild(zone);
      this.spotlightZone = zone;
    }

    this.spotlightZone.clear();
    this.spotlightZone.beginFill(0xffffff, 0.001);
    this.spotlightZone.drawRoundedRect(holeX, holeY, Math.max(1, holeW), Math.max(1, holeH), Math.max(0, cornerRadius));
    this.spotlightZone.endFill();
  }

  _drawConveyorZone(conveyorId: string, beltY: number, beltLength: number, beltHeight: number) {
    if (!this.interactionLayer || !this._isConveyorHitAreaEnabled()) {
      return;
    }
    const zone = new PIXI.Graphics();
    // Near-transparent interaction surface covering full lane width.
    zone.beginFill(0xffffff, 0.001);
    zone.drawRect(0, beltY, Math.max(1, Number(beltLength) || 1), Math.max(1, Number(beltHeight) || 1));
    zone.endFill();
    zone.eventMode = 'dynamic';
    zone.cursor = 'pointer';
    (zone as any).conveyorId = String(conveyorId);

    const endConveyorHold = (e: any) => {
      const cid = (zone as any).conveyorId;
      const holdState = this.conveyorHoldStart.get(cid);
      if (!holdState) {
        return;
      }
      this.conveyorHoldStart.delete(cid);
      const pos = this._extractPointerPosition(e);
      this.conveyorPointerPos.set(cid, pos);
      if (holdState.mode === 'hold_duration') {
        const holdDurationMs = Math.max(0, performance.now() - Number(holdState.t ?? performance.now()));
        this._emitPointerDebug('conveyor_hold_end', holdState.brickId, e, { conveyor_id: cid, hold_ms: Math.round(holdDurationMs) });
        this.onBrickHold(holdState.brickId, holdDurationMs, pos.x, pos.y);
        return;
      }
      this._emitPointerDebug('conveyor_hold_state_end', holdState.brickId, e, { conveyor_id: cid });
      this.onBrickHoldState(holdState.brickId, false, pos.x, pos.y);
    };

    zone.on('pointerdown', (e) => {
      const cid = (zone as any).conveyorId;
      const mode = this.config?.bricks?.completionMode;
      const targetBrickId = this._getConveyorTargetBrickId(cid);
      const pos = this._extractPointerPosition(e);
      this.conveyorPointerPos.set(cid, pos);
      if (!targetBrickId) {
        this._emitPointerDebug('conveyor_pointerdown_no_target', null, e, { conveyor_id: cid });
        return;
      }
      if (mode === 'hold_duration') {
        this.conveyorHoldStart.set(cid, {
          brickId: targetBrickId,
          t: performance.now(),
          mode: 'hold_duration'
        });
        this._emitPointerDebug('conveyor_hold_begin', targetBrickId, e, { conveyor_id: cid });
      } else if (mode === 'hold_to_clear') {
        this.conveyorHoldStart.set(cid, {
          brickId: targetBrickId,
          t: null,
          mode: 'hold_to_clear'
        });
        this._emitPointerDebug('conveyor_hold_state_begin', targetBrickId, e, { conveyor_id: cid });
        this.onBrickHoldState(targetBrickId, true, pos.x, pos.y);
      } else {
        this._emitPointerDebug('conveyor_click', targetBrickId, e, { conveyor_id: cid });
        this.onBrickClick(targetBrickId, pos.x, pos.y);
      }
    });
    zone.on('pointerup', endConveyorHold);
    zone.on('pointerupoutside', endConveyorHold);
    zone.on('pointerout', (e) => {
      const cid = (zone as any).conveyorId;
      if (this.config?.bricks?.completionMode !== 'hover_to_clear') {
        return;
      }
      this.conveyorHovered.delete(cid);
      const prev = this.conveyorHoverTarget.get(cid);
      this.conveyorHoverTarget.delete(cid);
      const pos = this._extractPointerPosition(e);
      this.conveyorPointerPos.set(cid, pos);
      if (prev) {
        this._emitPointerDebug('conveyor_hover_end', prev, e, { conveyor_id: cid });
        this.onBrickHover(prev, false, pos.x, pos.y);
      }
    });
    zone.on('pointerleave', (e) => {
      const cid = (zone as any).conveyorId;
      this.conveyorHovered.delete(cid);
      const prev = this.conveyorHoverTarget.get(cid);
      this.conveyorHoverTarget.delete(cid);
      const pos = this._extractPointerPosition(e);
      this.conveyorPointerPos.set(cid, pos);
      if (prev && this.config?.bricks?.completionMode === 'hover_to_clear') {
        this._emitPointerDebug('conveyor_hover_end', prev, e, { conveyor_id: cid });
        this.onBrickHover(prev, false, pos.x, pos.y);
      }
    });
    zone.on('pointercancel', (e) => {
      const cid = (zone as any).conveyorId;
      this.conveyorHovered.delete(cid);
      const prev = this.conveyorHoverTarget.get(cid);
      this.conveyorHoverTarget.delete(cid);
      const pos = this._extractPointerPosition(e);
      this.conveyorPointerPos.set(cid, pos);
      if (prev && this.config?.bricks?.completionMode === 'hover_to_clear') {
        this._emitPointerDebug('conveyor_hover_end', prev, e, { conveyor_id: cid });
        this.onBrickHover(prev, false, pos.x, pos.y);
      }
      endConveyorHold(e);
    });
    zone.on('pointerover', (e) => {
      if (this.config?.bricks?.completionMode !== 'hover_to_clear') {
        return;
      }
      const cid = (zone as any).conveyorId;
      const pos = this._extractPointerPosition(e);
      this.conveyorPointerPos.set(cid, pos);
      this.conveyorHovered.add(cid);
      const next = this._getConveyorTargetBrickId(cid);
      if (!next) {
        return;
      }
      const prev = this.conveyorHoverTarget.get(cid);
      if (prev === next) {
        return;
      }
      if (prev) {
        this.onBrickHover(prev, false, pos.x, pos.y);
      }
      this.conveyorHoverTarget.set(cid, next);
      this._emitPointerDebug('conveyor_hover_begin', next, e, { conveyor_id: cid });
      this.onBrickHover(next, true, pos.x, pos.y);
    });

    this.interactionLayer.addChild(zone);
    this.conveyorZones.set(String(conveyorId), zone);
  }

  _drawEndFurnace(conveyorId: string, beltY: number, beltHeight: number, beltLength: number) {
    const cfgRaw = this.config?.display?.endFurnace || {};
    const rawStyleId = normalizeTextureStyleId(cfgRaw?.style ?? '');
    const styleId = rawStyleId === 'incinerator' ? 'furnace' : rawStyleId;
    const styleCfg = (BUILTIN_END_FURNACE_STYLES as Record<string, any>)[styleId] || {};
    const cfg = { ...styleCfg, ...cfgRaw, style: styleId || cfgRaw?.style };
    if (cfg.enable === false) {
      return;
    }
    const bodyWidth = Math.max(20, Number(cfg.widthPx ?? Math.round(beltHeight * 0.8)));
    const bodyHeight = Math.max(18, Number(cfg.heightPx ?? Math.round(beltHeight * 0.9)));
    const bodyXRaw = Number(beltLength) + Number(cfg.offsetX ?? 6);
    const bodyYRaw = Number(beltY) + (beltHeight - bodyHeight) / 2;

    const resolution = Math.max(1, Number(this.app?.renderer?.resolution) || 1);
    const brickSnapStep = this.pixelSnapBricks ? 1 : (1 / resolution);
    const bodyX = this._roundSymmetric(bodyXRaw, brickSnapStep);
    const bodyY = this._roundSymmetric(bodyYRaw, brickSnapStep);

    const wallColor = toPixiColor(cfg.wallColor ?? '#334155');
    const wallShadeColor = toPixiColor(cfg.wallShadeColor ?? '#1e293b');
    const rimColor = toPixiColor(cfg.rimColor ?? '#94a3b8');
    const mouthColor = toPixiColor(cfg.mouthColor ?? '#0f172a');
    const emberColor = toPixiColor(cfg.emberColor ?? '#f97316');
    const style = normalizeTextureStyleId(cfg.style ?? '');
    const showPanelLines = cfg.bodyPanelLines !== false;
    const showHazardStripes = cfg.hazardStripes === true;
    const showSideRivets = cfg.sideRivets === true;

    const mouthWidth = Math.max(8, Math.floor(bodyWidth * 0.38));
    const mouthHeight = Math.max(8, Math.floor(bodyHeight * 0.42));
    // Belts move left->right; place intake on the belt-facing (left) side.
    const mouthX = bodyX + 3;
    const mouthY = bodyY + (bodyHeight - mouthHeight) / 2;

    const g = new PIXI.Graphics();
    // Pixel-like furnace body.
    g.beginFill(wallColor, 1);
    g.drawRect(bodyX, bodyY, bodyWidth, bodyHeight);
    g.endFill();
    g.beginFill(wallShadeColor, 1);
    g.drawRect(bodyX, bodyY + bodyHeight - 5, bodyWidth, 5);
    g.endFill();

    if (showPanelLines) {
      g.beginFill(wallShadeColor, 0.6);
      g.drawRect(bodyX + Math.floor(bodyWidth * 0.32), bodyY + 3, 1, Math.max(2, bodyHeight - 6));
      g.drawRect(bodyX + Math.floor(bodyWidth * 0.62), bodyY + 3, 1, Math.max(2, bodyHeight - 6));
      g.endFill();
    }

    g.beginFill(rimColor, 1);
    g.drawRect(bodyX, bodyY, bodyWidth, 3);
    g.drawRect(bodyX + 2, bodyY + 4, 3, 3);
    g.drawRect(bodyX + 2, bodyY + bodyHeight - 8, 3, 3);
    g.endFill();

    if (showSideRivets) {
      g.beginFill(rimColor, 0.85);
      for (let i = 0; i < 3; i += 1) {
        const ry = bodyY + 6 + i * Math.max(6, Math.floor((bodyHeight - 12) / 2));
        g.drawCircle(bodyX + bodyWidth - 4, ry, 1.1);
      }
      g.endFill();
    }

    // Intake lip so the opening reads as the belt endpoint target.
    g.beginFill(rimColor, 0.95);
    g.drawRect(bodyX - 2, mouthY - 1, 3, mouthHeight + 2);
    g.endFill();

    if (showHazardStripes) {
      const hazardA = toPixiColor(cfg.hazardColorA ?? '#f59e0b');
      const hazardB = toPixiColor(cfg.hazardColorB ?? '#111827');
      const stripeH = 2;
      for (let sy = mouthY - 2; sy < mouthY + mouthHeight + 2; sy += stripeH) {
        const isAlt = Math.floor((sy - mouthY) / stripeH) % 2 !== 0;
        g.beginFill(isAlt ? hazardB : hazardA, 0.85);
        g.drawRect(bodyX - 4, sy, 2, stripeH);
        g.endFill();
      }
    }

    // Mouth.
    g.beginFill(mouthColor, 1);
    g.drawRect(mouthX, mouthY, mouthWidth, mouthHeight);
    g.endFill();
    this.beltLayer.addChild(g);

    // Keep hot-core/glow as separate nodes so they can flicker over time.
    const ember = new PIXI.Graphics();
    ember.beginFill(emberColor, 0.95);
    ember.drawRect(mouthX + 2, mouthY + 2, Math.max(2, mouthWidth - 4), Math.max(2, mouthHeight - 4));
    ember.endFill();
    this.beltLayer.addChild(ember);

    const core = new PIXI.Graphics();
    const coreColor = style === 'plasma_recycler' ? 0x93c5fd : 0xfbbf24;
    core.beginFill(coreColor, 0.75);
    core.drawRect(mouthX + 3, mouthY + 3, Math.max(1, mouthWidth - 8), Math.max(1, mouthHeight - 8));
    core.endFill();
    this.beltLayer.addChild(core);

    const intakeGlow = new PIXI.Graphics();
    intakeGlow.beginFill(emberColor, 0.28);
    intakeGlow.drawRect(mouthX - 3, mouthY + 2, 3, Math.max(2, mouthHeight - 4));
    intakeGlow.endFill();
    this.beltLayer.addChild(intakeGlow);

    let jawTop = null;
    let jawBottom = null;
    let rotor = null;
    let halo = null;
    const mouthCx = mouthX + mouthWidth * 0.5;
    const mouthCy = mouthY + mouthHeight * 0.5;

    if (style === 'crusher') {
      jawTop = new PIXI.Graphics();
      jawTop.beginFill(rimColor, 0.9);
      jawTop.drawRect(mouthX + 1, mouthY + 1, Math.max(2, mouthWidth - 2), 2);
      jawTop.endFill();
      this.beltLayer.addChild(jawTop);

      jawBottom = new PIXI.Graphics();
      jawBottom.beginFill(rimColor, 0.9);
      jawBottom.drawRect(mouthX + 1, mouthY + mouthHeight - 3, Math.max(2, mouthWidth - 2), 2);
      jawBottom.endFill();
      this.beltLayer.addChild(jawBottom);
    } else if (style === 'shredder') {
      rotor = new PIXI.Graphics();
      rotor.lineStyle(1.4, rimColor, 0.92);
      rotor.moveTo(-4, 0);
      rotor.lineTo(4, 0);
      rotor.moveTo(0, -4);
      rotor.lineTo(0, 4);
      rotor.moveTo(-3, -3);
      rotor.lineTo(3, 3);
      rotor.moveTo(-3, 3);
      rotor.lineTo(3, -3);
      rotor.x = mouthCx;
      rotor.y = mouthCy;
      this.beltLayer.addChild(rotor);
    } else if (style === 'plasma_recycler') {
      halo = new PIXI.Graphics();
      halo.lineStyle(2, emberColor, 0.5);
      halo.drawEllipse(0, 0, Math.max(5, mouthWidth * 0.7), Math.max(4, mouthHeight * 0.7));
      halo.x = mouthCx;
      halo.y = mouthCy;
      this.beltLayer.addChild(halo);
    }

    this.furnaceAnchors.set(String(conveyorId), {
      mouthX,
      mouthY,
      mouthWidth,
      mouthHeight
    });
    this.furnaceVisuals.set(String(conveyorId), {
      style,
      ember,
      core,
      intakeGlow,
      jawTop,
      jawBottom,
      rotor,
      halo,
      mouthX,
      mouthY,
      mouthWidth,
      mouthHeight,
      mouthCx,
      mouthCy
    });
  }

  /**
   * Scrolls belt textures to suggest motion matching each conveyor's speed.
   * Expects the same ordering as created in _drawBelts.
   */
  updateBelts(conveyors: any[], dtMs: number) {
    if (!this.beltVisuals || !this.beltVisuals.length) {
      return;
    }
    const hasAnimatedBelts = this.beltVisuals.some((vis) => vis?.type === 'tiling');
    if (!hasAnimatedBelts) {
      return;
    }
    const factor = Number(this.config?.display?.beltTexture?.scrollFactor ?? 1);
    const dirRaw = this.config?.display?.beltTexture?.scrollDirection;
    const snapModeRaw = this.config?.display?.beltTexture?.scrollSnapMode;
    const scrollSnapMode = (() => {
      const text = String(snapModeRaw ?? 'screen').trim().toLowerCase();
      if (text === 'texture' || text === 'legacy') {
        return 'texture';
      }
      if (text === 'none' || text === 'off' || text === 'false') {
        return 'none';
      }
      return 'screen';
    })();
    const scrollDirection = (() => {
      if (typeof dirRaw === 'number' && Number.isFinite(dirRaw)) {
        return dirRaw < 0 ? -1 : 1;
      }
      const text = String(dirRaw ?? 'right').trim().toLowerCase();
      return (text === 'left' || text === 'rtl' || text === 'reverse' || text === 'backward') ? -1 : 1;
    })();
    const dt = Math.max(0, Number(dtMs) || 0) / 1000;
    const resolution = Math.max(1, Number(this.app?.renderer?.resolution ?? 1));
    const brickSnapStep = this.pixelSnapBricks ? 1 : (1 / resolution);

    for (let i = 0; i < Math.min(this.beltVisuals.length, conveyors.length); i += 1) {
      const vis = this.beltVisuals[i];
      if (!vis?.node || vis.type !== 'tiling') {
        continue;
      }
      const speed = Number(conveyors[i]?.speed) || 0;
      const shift = speed * dt * factor * scrollDirection;
      try {
        vis.offsetX = Number(vis.offsetX ?? 0) + shift;
        let snappedOffsetX = vis.offsetX;

        if (vis.pixelSnap) {
          if (scrollSnapMode === 'texture') {
            snappedOffsetX = this._roundSymmetric(vis.offsetX, 1);
          } else if (scrollSnapMode === 'none') {
            // Match brick movement snapping to avoid phase-shift rocking.
            snappedOffsetX = this._roundSymmetric(vis.offsetX, brickSnapStep);
          } else if (!vis.isProcedural) {
            const scaleX = Math.max(1e-6, Math.abs(Number(vis.node?.tileScale?.x) || 1));
            snappedOffsetX = this._roundSymmetric(vis.offsetX, 1 / scaleX);
          } else {
            // Default (including 'screen') - force exactly brickSnapStep to stay in sync.
            snappedOffsetX = this._roundSymmetric(vis.offsetX, brickSnapStep);
          }
        }

        vis.node.tilePosition.x = snappedOffsetX;
      } catch (_) {
        // ignore
      }
    }
  }
  updateFurnaces(dtMs: number) {
    if (!this.furnaceVisuals.size) {
      return;
    }
    const cfg = this.config?.display?.endFurnace || {};
    if (cfg.enable === false) {
      return;
    }
    const flicker = cfg.flicker || {};
    if (flicker.enable === false) {
      return;
    }
    const dt = Math.max(0, Number(dtMs) || 0);
    this.furnaceFlickerTimeMs += dt;
    const t = this.furnaceFlickerTimeMs / 1000;
    const speedHz = Math.max(0.1, Number(flicker.speedHz ?? 8));
    const baseIntensity = Math.max(0.15, Math.min(1, Number(flicker.baseIntensity ?? 0.78)));
    const alphaAmplitude = Math.max(0, Math.min(0.85, Number(flicker.alphaAmplitude ?? 0.22)));

    let laneIndex = 0;
    this.furnaceVisuals.forEach((vis) => {
      const phase = laneIndex * 0.9;
      laneIndex += 1;
      const waveA = 0.5 + 0.5 * Math.sin((t * speedHz + phase) * Math.PI * 2);
      const waveB = 0.5 + 0.5 * Math.sin((t * speedHz * 0.57 + phase * 1.7) * Math.PI * 2);
      const jitter = Math.sin((t * 23 + phase * 3.1) * Math.PI * 2) * 0.03;
      const blend = waveA * 0.7 + waveB * 0.3;
      const intensity = Math.max(
        0.05,
        Math.min(1, baseIntensity + (blend - 0.5) * 2 * alphaAmplitude + jitter)
      );

      const styleId = normalizeTextureStyleId(vis?.style ?? 'furnace');
      const isFireStyle = styleId === 'furnace';

      if (vis.ember) {
        vis.ember.alpha = isFireStyle
          ? Math.max(0.15, Math.min(1, 0.45 + intensity * 0.55))
          : Math.max(0.2, Math.min(0.85, 0.25 + intensity * 0.35));
      }
      if (vis.core) {
        vis.core.alpha = isFireStyle
          ? Math.max(0.15, Math.min(1, 0.35 + intensity * 0.65))
          : Math.max(0.2, Math.min(0.85, 0.22 + intensity * 0.33));
      }
      if (vis.intakeGlow) {
        vis.intakeGlow.alpha = isFireStyle
          ? Math.max(0.05, Math.min(0.7, 0.08 + intensity * 0.35))
          : Math.max(0.04, Math.min(0.3, 0.04 + intensity * 0.16));
      }

      if (styleId === 'crusher' && vis.jawTop && vis.jawBottom) {
        const gapWave = 0.5 + 0.5 * Math.sin((t * speedHz * 0.9 + phase * 0.7) * Math.PI * 2);
        const maxTravel = Math.max(1, Math.floor((Number(vis.mouthHeight) || 8) * 0.2));
        const travel = Math.round(gapWave * maxTravel);
        vis.jawTop.y = (Number(vis.mouthY) || 0) + 1 + travel;
        vis.jawBottom.y = (Number(vis.mouthY) || 0) + (Number(vis.mouthHeight) || 0) - 3 - travel;
        const jawAlpha = Math.max(0.45, Math.min(1, 0.6 + intensity * 0.28));
        vis.jawTop.alpha = jawAlpha;
        vis.jawBottom.alpha = jawAlpha;
      }

      if (styleId === 'shredder' && vis.rotor) {
        vis.rotor.x = Number(vis.mouthCx) || 0;
        vis.rotor.y = Number(vis.mouthCy) || 0;
        vis.rotor.rotation = (t * speedHz * 1.6 + phase * 0.5) * Math.PI * 2;
        vis.rotor.alpha = Math.max(0.45, Math.min(0.95, 0.55 + intensity * 0.3));
      }

      if (styleId === 'plasma_recycler' && vis.halo) {
        const pulse = 0.5 + 0.5 * Math.sin((t * speedHz * 0.65 + phase) * Math.PI * 2);
        vis.halo.alpha = Math.max(0.15, Math.min(0.9, 0.22 + pulse * 0.55));
        vis.halo.scale.set(0.92 + pulse * 0.16, 0.92 + pulse * 0.16);
      }
    });
  }

  clampFrameDelta(dtMs: number) {
    const perfCfg = this.config?.display?.performance || {};
    const maxFrameDtMs = Number(perfCfg.maxFrameDtMs ?? 50);
    if (!Number.isFinite(maxFrameDtMs) || maxFrameDtMs <= 0) {
      return Math.max(0, Number(dtMs) || 0);
    }
    return Math.max(0, Math.min(Number(dtMs) || 0, maxFrameDtMs));
  }

  updateBackground(dtMs: number) {
    if (!this.backgroundVisual) {
      return;
    }
    const texCfg = this.config?.display?.backgroundTexture || {};
    const factor = Number(texCfg.scrollFactor ?? 0);
    if (!Number.isFinite(factor) || factor === 0) {
      return;
    }
    const dt = Math.max(0, Number(dtMs) || 0) / 1000;
    const shiftX = Number(texCfg.scrollX ?? 16) * factor * dt;
    const shiftY = Number(texCfg.scrollY ?? 0) * factor * dt;
    try {
      this.backgroundVisual.tilePosition.x += shiftX;
      this.backgroundVisual.tilePosition.y += shiftY;
    } catch (_) {
      // ignore
    }
  }

  _resolveClearAnimationConfig() {
    const cfg = (this.config?.display?.clearAnimation && typeof this.config.display.clearAnimation === 'object')
      ? this.config.display.clearAnimation
      : {};
    const coinCfg = (cfg.coin && typeof cfg.coin === 'object') ? cfg.coin : {};
    return {
      enable: cfg.enable === true,
      timeoutMs: Math.max(120, Number(cfg.timeoutMs ?? cfg.durationMs ?? 720)),
      risePx: Math.max(0, Number(cfg.risePx ?? 28)),
      startOffsetYPx: Math.max(0, Number(cfg.startOffsetYPx ?? 10)),
      textColor: cfg.textColor ?? '#ffe082',
      textStrokeColor: cfg.textStrokeColor ?? '#4a2f05',
      textStrokeThickness: Math.max(0, Number(cfg.textStrokeThickness ?? 4)),
      textFontFamily: String(cfg.textFontFamily ?? '"Trebuchet MS", "Verdana", "Arial Black", sans-serif'),
      textFontWeight: String(cfg.textFontWeight ?? '900'),
      textMinSizePx: Math.max(8, Number(cfg.textMinSizePx ?? 16)),
      textMaxSizePx: Math.max(10, Number(cfg.textMaxSizePx ?? 40)),
      textSizeFactor: Math.max(0.05, Number(cfg.textSizeFactor ?? 0.62)),
      textShadowColor: cfg.textShadowColor ?? '#000000',
      textShadowBlur: Math.max(0, Number(cfg.textShadowBlur ?? 1)),
      textShadowDistance: Math.max(0, Number(cfg.textShadowDistance ?? 2)),
      coin: {
        enable: coinCfg.enable !== false,
        showInPointsAnimation: coinCfg.showInPointsAnimation !== false,
        showInHud: coinCfg.showInHud !== false,
        sizePx: Math.max(6, Number(coinCfg.sizePx ?? 20)),
        gapPx: Math.max(0, Number(coinCfg.gapPx ?? 5)),
        rimColor: coinCfg.rimColor ?? '#b8860b',
        bodyColor: coinCfg.bodyColor ?? '#facc15',
        shineColor: coinCfg.shineColor ?? '#fef3c7',
        shadowColor: coinCfg.shadowColor ?? '#a16207',
        symbolColor: coinCfg.symbolColor ?? '#92400e',
        ridgeCount: Math.max(8, Math.min(48, Number(coinCfg.ridgeCount ?? 18))),
      },
    };
  }

  _seedFromValue(input: any, fallback: number = 1) {
    const text = String(input ?? '');
    if (!text) {
      return (fallback >>> 0) || 1;
    }
    let hash = 2166136261 >>> 0;
    for (let i = 0; i < text.length; i += 1) {
      hash ^= text.charCodeAt(i);
      hash = Math.imul(hash, 16777619) >>> 0;
    }
    return hash || (fallback >>> 0) || 1;
  }

  _drawCoinPrimitive(target: PIXI.Graphics, sizePx: number, coinCfg: Record<string, any>, seed: number = 1) {
    const size = Math.max(6, Number(sizePx) || 6);
    const r = size * 0.5;
    const rimColor = toPixiColor(coinCfg?.rimColor ?? '#b8860b');
    const bodyColor = toPixiColor(coinCfg?.bodyColor ?? '#facc15');
    const shineColor = toPixiColor(coinCfg?.shineColor ?? '#fef3c7');
    const shadowColor = toPixiColor(coinCfg?.shadowColor ?? '#a16207');
    const symbolColor = toPixiColor(coinCfg?.symbolColor ?? '#92400e');
    const ridgeCount = Math.max(8, Math.min(48, Number(coinCfg?.ridgeCount ?? 18)));

    let local = (Number(seed) >>> 0) || 1;
    const rand = () => {
      local ^= (local << 13) >>> 0;
      local ^= local >>> 17;
      local ^= (local << 5) >>> 0;
      return (local >>> 0) / 0x100000000;
    };

    target.beginFill(rimColor, 1);
    target.drawCircle(0, 0, r);
    target.endFill();

    target.beginFill(bodyColor, 1);
    target.drawCircle(0, 0, Math.max(1, r * 0.82));
    target.endFill();

    target.beginFill(shineColor, 0.42);
    target.drawEllipse(-r * 0.22, -r * 0.3, Math.max(1, r * 0.42), Math.max(1, r * 0.24));
    target.endFill();

    target.beginFill(shadowColor, 0.24);
    target.drawEllipse(r * 0.18, r * 0.22, Math.max(1, r * 0.42), Math.max(1, r * 0.25));
    target.endFill();

    for (let i = 0; i < ridgeCount; i += 1) {
      const baseAngle = (Math.PI * 2 * i) / ridgeCount;
      const jitter = (rand() - 0.5) * 0.055;
      const angle = baseAngle + jitter;
      const outer = r * 0.98;
      const inner = r * 0.87;
      const x0 = Math.cos(angle) * inner;
      const y0 = Math.sin(angle) * inner;
      const x1 = Math.cos(angle) * outer;
      const y1 = Math.sin(angle) * outer;
      target.lineStyle(Math.max(1, size * 0.03), shadowColor, 0.34);
      target.moveTo(x0, y0);
      target.lineTo(x1, y1);
      target.lineStyle(0, 0, 0);
    }

    const symbolSize = Math.max(1, r * 0.54);
    target.lineStyle(Math.max(1, size * 0.09), symbolColor, 0.65);
    target.moveTo(-symbolSize * 0.5, -symbolSize * 0.65);
    target.lineTo(symbolSize * 0.5, symbolSize * 0.65);
    target.moveTo(symbolSize * 0.5, -symbolSize * 0.65);
    target.lineTo(-symbolSize * 0.5, symbolSize * 0.65);
    target.lineStyle(0, 0, 0);
  }

  _resolveHudCoinSize(text: any, uiCfg: Record<string, any>, clearCfg: Record<string, any>) {
    const explicit = Number(clearCfg?.coin?.hudSizePx);
    if (Number.isFinite(explicit)) {
      return Math.max(6, explicit);
    }
    const lineHeight = Math.max(
      8,
      Number(uiCfg?.hudLineHeight ?? text?.style?.lineHeight ?? text?.style?.fontSize ?? 16)
    );
    let capHeight = 0;
    try {
      capHeight = Number(PIXI.TextMetrics.measureText('M', text?.style).height) || 0;
    } catch (_) {
      capHeight = 0;
    }
    const fallbackCap = lineHeight * 0.72;
    const baseCap = capHeight > 0 ? capHeight : fallbackCap;
    const scale = Math.max(0.5, Math.min(1.5, Number(clearCfg?.coin?.hudSizeScale ?? 0.95)));
    // Keep coin close to uppercase letter height and safely within line box.
    return Math.max(6, Math.min(lineHeight * 0.92, baseCap * scale));
  }

  queueClearEffects(clearEvents: any[] = []) {
    if (!Array.isArray(clearEvents) || clearEvents.length === 0) {
      return;
    }
    const clearCfg = this._resolveClearAnimationConfig();
    if (!clearCfg.enable) {
      return;
    }
    const perfCfg = this.config?.display?.performance || {};
    const maxEffects = Math.max(0, Number(perfCfg.maxActiveEffects ?? 180));
    clearEvents.forEach((entry) => {
      if (this.effectVisuals.length >= maxEffects) {
        this.perfStats.effectDropsSkipped += 1;
        return;
      }
      const points = Math.max(0, Number(entry?.value ?? 0));
      const width = Math.max(1, Number(entry?.width ?? this.config?.display?.brickWidth ?? 1));
      const height = Math.max(1, Number(entry?.height ?? this.config?.display?.brickHeight ?? 1));
      const centerX = Number(entry?.x ?? 0) + width * 0.5;
      const centerY = Number(entry?.y ?? 0) + height * 0.5;
      const startY = centerY - Math.max(1, height * 0.2) - clearCfg.startOffsetYPx;
      const label = `+${Math.max(0, Math.round(points))}`;
      const textSize = Math.max(
        clearCfg.textMinSizePx,
        Math.min(clearCfg.textMaxSizePx, height * clearCfg.textSizeFactor)
      );
      const container = new PIXI.Container();
      container.x = this.pixelSnapBricks ? Math.round(centerX) : centerX;
      container.y = this.pixelSnapBricks ? Math.round(startY) : startY;

      const text = new PIXI.Text(label, {
        fill: toPixiColor(clearCfg.textColor),
        fontSize: textSize,
        fontFamily: clearCfg.textFontFamily,
        fontWeight: clearCfg.textFontWeight as PIXI.TextStyleFontWeight,
        stroke: toPixiColor(clearCfg.textStrokeColor),
        strokeThickness: clearCfg.textStrokeThickness,
        dropShadow: true,
        dropShadowColor: toPixiColor(clearCfg.textShadowColor),
        dropShadowBlur: clearCfg.textShadowBlur,
        dropShadowDistance: clearCfg.textShadowDistance,
      });

      const showCoin = clearCfg.coin.enable && clearCfg.coin.showInPointsAnimation;
      const coinSize = Math.max(6, Number(clearCfg.coin.sizePx ?? 20));
      const coinGap = Math.max(0, Number(clearCfg.coin.gapPx ?? 5));
      let totalWidth = text.width;
      if (showCoin) {
        totalWidth += coinGap + coinSize;
      }
      const left = -totalWidth * 0.5;
      if (showCoin) {
        const coin = new PIXI.Graphics();
        const seed = this._seedFromValue(`${entry?.brickId ?? ''}|${entry?.conveyorId ?? ''}|${points}`, this.seed);
        this._drawCoinPrimitive(coin, coinSize, clearCfg.coin, seed);
        coin.x = left + coinSize * 0.5;
        coin.y = 0;
        container.addChild(coin);
      }
      text.x = left + (showCoin ? coinSize + coinGap : 0);
      text.y = -text.height * 0.5;
      container.addChild(text);

      this.effectLayer.addChild(container);
      this.effectVisuals.push({
        kind: 'clear_points_pop',
        node: container,
        elapsedMs: 0,
        durationMs: clearCfg.timeoutMs,
        startY: container.y,
        risePx: clearCfg.risePx,
      });
      this.perfStats.clearEffectsQueued += 1;
    });
    this.perfStats.peakActiveEffects = Math.max(this.perfStats.peakActiveEffects, this.effectVisuals.length);
  }

  queuePracticeFeedback(clearEvents: any[] = []) {
    if (!Array.isArray(clearEvents) || clearEvents.length === 0) {
      return;
    }
    const clearCfg = this._resolveClearAnimationConfig();
    if (!clearCfg.enable) {
      return;
    }
    const perfCfg = this.config?.display?.performance || {};
    const maxEffects = Math.max(0, Number(perfCfg.maxActiveEffects ?? 180));

    // Configurable feedback options for hold duration practice
    const practiceUiCfg = this.config?.display?.practiceFeedback || {};
    const binTooFastColor = toPixiColor(practiceUiCfg.colorTooFast ?? '#ef4444');
    const binTooSlowColor = toPixiColor(practiceUiCfg.colorTooSlow ?? '#ef4444');
    const binGoodColor = toPixiColor(practiceUiCfg.colorGood ?? '#22c55e');
    const goodThresholdMin = Number(practiceUiCfg.goodThresholdMin ?? -0.2);
    const goodThresholdMax = Number(practiceUiCfg.goodThresholdMax ?? 0.2);

    const customBins = Array.isArray(practiceUiCfg.bins) ? practiceUiCfg.bins : null;

    clearEvents.forEach((entry) => {
      if (this.effectVisuals.length >= maxEffects) {
        this.perfStats.effectDropsSkipped += 1;
        return;
      }
      const holdDuration = Math.max(0, Number(entry?.hold_ms ?? entry?.holdDurationMs ?? 0));
      const scaledDelta = Number(entry?.scaledPerformanceDelta ?? 0);
      const width = Math.max(1, Number(entry?.width ?? this.config?.display?.brickWidth ?? 1));
      const height = Math.max(1, Number(entry?.height ?? this.config?.display?.brickHeight ?? 1));
      const centerX = Number(entry?.x ?? 0) + width * 0.5;
      const centerY = Number(entry?.y ?? 0) + height * 0.5;
      const startY = centerY - Math.max(1, height * 0.2) - clearCfg.startOffsetYPx;
      
      let label = `${Math.round(holdDuration)} ms`;
      let labelColor = toPixiColor(clearCfg.textColor);

      if (customBins) {
        // Find the matching bin based on scaledDelta
        // Bins should be sorted by 'min' ascending
        const matchingBin = customBins.find((bin: any) => {
          const min = bin.min !== undefined ? Number(bin.min) : Number.NEGATIVE_INFINITY;
          const max = bin.max !== undefined ? Number(bin.max) : Number.POSITIVE_INFINITY;
          return scaledDelta >= min && scaledDelta < max;
        });

        if (matchingBin) {
          if (matchingBin.label) {
            label = matchingBin.label;
          }
          if (matchingBin.color) {
            labelColor = toPixiColor(matchingBin.color);
          }
        }
      } else {
        if (scaledDelta < goodThresholdMin) {
          labelColor = binTooFastColor;
        } else if (scaledDelta > goodThresholdMax) {
          labelColor = binTooSlowColor;
        } else {
          labelColor = binGoodColor;
        }
      }

      const textSize = Math.max(
        clearCfg.textMinSizePx,
        Math.min(clearCfg.textMaxSizePx, height * clearCfg.textSizeFactor)
      );
      const container = new PIXI.Container();
      container.x = this.pixelSnapBricks ? Math.round(centerX) : centerX;
      container.y = this.pixelSnapBricks ? Math.round(startY) : startY;

      const text = new PIXI.Text(label, {
        fill: labelColor,
        fontSize: textSize,
        fontFamily: clearCfg.textFontFamily,
        fontWeight: clearCfg.textFontWeight as PIXI.TextStyleFontWeight,
        stroke: toPixiColor(clearCfg.textStrokeColor),
        strokeThickness: clearCfg.textStrokeThickness,
        dropShadow: true,
        dropShadowColor: toPixiColor(clearCfg.textShadowColor),
        dropShadowBlur: clearCfg.textShadowBlur,
        dropShadowDistance: clearCfg.textShadowDistance,
      });

      const totalWidth = text.width;
      const left = -totalWidth * 0.5;
      text.x = left;
      text.y = -text.height * 0.5;
      container.addChild(text);

      this.effectLayer.addChild(container);
      this.effectVisuals.push({
        kind: 'clear_points_pop',
        node: container,
        elapsedMs: 0,
        durationMs: clearCfg.timeoutMs,
        startY: container.y,
        risePx: clearCfg.risePx,
      });
      this.perfStats.clearEffectsQueued += 1;
    });
    this.perfStats.peakActiveEffects = Math.max(this.perfStats.peakActiveEffects, this.effectVisuals.length);
  }

  queueDropEffects(dropEvents: any[] = []) {
    if (!Array.isArray(dropEvents) || dropEvents.length === 0) {
      return;
    }
    const missCfg = this.config?.display?.missAnimation || {};
    const mode = String(missCfg.mode ?? 'none').toLowerCase();
    if (!['snap', 'furnace', 'disintegrate'].includes(mode)) {
      return;
    }
    const brickDurationMs = Math.max(80, Number(missCfg.durationMs ?? 190));
    const markerFlashMs = Math.max(50, Number(missCfg.markerFlashMs ?? 120));
    const markerColor = toPixiColor(missCfg.flashColor ?? '#ef4444');
    const perfCfg = this.config?.display?.performance || {};
    const maxEffects = Math.max(0, Number(perfCfg.maxActiveEffects ?? 180));

    dropEvents.forEach((drop) => {
      if (this.effectVisuals.length >= maxEffects) {
        this.perfStats.effectDropsSkipped += 1;
        return;
      }
      const width = Math.max(1, Number(drop.width ?? 1));
      const height = Math.max(1, Number(drop.height ?? 1));
      const cornerRadius = Math.max(0, Number(this.config.display.brickCornerRadius ?? 0));
      const color = toPixiColor(drop.color ?? this.config.display.brickColor);
      const borderColor = toPixiColor(drop.borderColor ?? this.config.display.brickBorderColor ?? 0x0f172a);
      const shape = normalizeBrickShape(drop.shape ?? this.config.display.brickShape);

      const conveyorId = String(drop.conveyorId ?? '');
      const marker = this.dueMarkerAnchors.get(conveyorId);
      const furnace = this.furnaceAnchors.get(conveyorId);

      if (mode === 'furnace' && furnace) {
        const brickFx = new PIXI.Graphics();
        brickFx.beginFill(color, 1);
        this._drawBrickPrimitive(brickFx, shape, width, height, cornerRadius);
        brickFx.endFill();
        brickFx.lineStyle(1.1, borderColor, 0.55);
        this._drawBrickPrimitive(brickFx, shape, width, height, cornerRadius);
        brickFx.lineStyle(0, 0, 0);
        brickFx.x = Number(drop.x ?? 0);
        brickFx.y = Number(drop.y ?? 0);
        this.effectLayer.addChild(brickFx);
        this.effectVisuals.push({
          kind: 'furnace_ingest',
          node: brickFx,
          elapsedMs: 0,
          durationMs: Math.max(100, brickDurationMs + 40),
          startX: brickFx.x,
          startY: brickFx.y,
          endX: furnace.mouthX + 1,
          endY: furnace.mouthY + (furnace.mouthHeight - height) * 0.5
        });

        const glowFx = new PIXI.Graphics();
        glowFx.beginFill(0xfb923c, 0.9);
        glowFx.drawRect(
          furnace.mouthX + 1,
          furnace.mouthY + 1,
          Math.max(2, furnace.mouthWidth - 2),
          Math.max(2, furnace.mouthHeight - 2)
        );
        glowFx.endFill();
        this.effectLayer.addChild(glowFx);
        this.effectVisuals.push({
          kind: 'furnace_glow',
          node: glowFx,
          elapsedMs: 0,
          durationMs: Math.max(100, markerFlashMs + 80)
        });

        for (let i = 0; i < 3; i += 1) {
          const spark = new PIXI.Graphics();
          spark.beginFill(0xfacc15, 0.95);
          spark.drawRect(0, 0, 3, 3);
          spark.endFill();
          spark.x = furnace.mouthX + furnace.mouthWidth * 0.5;
          spark.y = furnace.mouthY + furnace.mouthHeight * 0.5;
          this.effectLayer.addChild(spark);
          this.effectVisuals.push({
            kind: 'furnace_spark',
            node: spark,
            elapsedMs: 0,
            durationMs: 170 + i * 30,
            vx: -28 - i * 14,
            vy: -10 - i * 9
          });
        }
      } else if (mode === 'snap') {
        const brickFx = new PIXI.Graphics();
        brickFx.beginFill(color, 1);
        this._drawBrickPrimitive(brickFx, shape, width, height, cornerRadius);
        brickFx.endFill();
        brickFx.lineStyle(1.1, borderColor, 0.55);
        this._drawBrickPrimitive(brickFx, shape, width, height, cornerRadius);
        brickFx.lineStyle(0, 0, 0);
        brickFx.pivot.set(width, 0);
        brickFx.x = Number(drop.x ?? 0) + width;
        brickFx.y = Number(drop.y ?? 0);
        this.effectLayer.addChild(brickFx);
        this.effectVisuals.push({
          kind: 'drop_snap',
          node: brickFx,
          elapsedMs: 0,
          durationMs: brickDurationMs
        });
      } else {
        const disCfg = missCfg?.disintegrate || {};
        const shardCount = Math.max(4, Math.min(24, Math.floor(Number(disCfg.shardCount ?? 10))));
        const gravity = Math.max(10, Number(disCfg.gravityPxPerSec2 ?? 640));
        const speedMin = Math.max(10, Number(disCfg.speedMinPxPerSec ?? 110));
        const speedMax = Math.max(speedMin, Number(disCfg.speedMaxPxPerSec ?? 230));
        const shardLifeMs = Math.max(90, Number(disCfg.durationMs ?? Math.max(140, brickDurationMs + 40)));
        const mouthBias = Math.max(0, Math.min(1, Number(disCfg.furnaceBias ?? 0.72)));

        const originX = Number(drop.x ?? 0);
        const originY = Number(drop.y ?? 0);
        const targetX = furnace ? (furnace.mouthX + furnace.mouthWidth * 0.5) : (originX + width + 24);
        const targetY = furnace ? (furnace.mouthY + furnace.mouthHeight * 0.5) : (originY + height * 0.5);

        const flashFx = new PIXI.Graphics();
        flashFx.beginFill(0xf59e0b, 0.55);
        this._drawBrickPrimitive(flashFx, shape, width, height, cornerRadius);
        flashFx.endFill();
        flashFx.x = originX;
        flashFx.y = originY;
        this.effectLayer.addChild(flashFx);
        this.effectVisuals.push({
          kind: 'disintegrate_flash',
          node: flashFx,
          elapsedMs: 0,
          durationMs: Math.max(80, Math.floor(shardLifeMs * 0.45))
        });

        const cols = Math.max(2, Math.round(Math.sqrt(shardCount * (width / Math.max(1, height)))));
        const rows = Math.max(2, Math.ceil(shardCount / cols));
        const shardW = Math.max(2, Math.floor(width / cols));
        const shardH = Math.max(2, Math.floor(height / rows));
        let emitted = 0;
        for (let row = 0; row < rows && emitted < shardCount; row += 1) {
          for (let col = 0; col < cols && emitted < shardCount; col += 1) {
            const sx = col * shardW;
            const sy = row * shardH;
            if (sx >= width || sy >= height) {
              continue;
            }
            const wPart = Math.max(1, Math.min(shardW, width - sx));
            const hPart = Math.max(1, Math.min(shardH, height - sy));
            const shard = new PIXI.Graphics();
            shard.beginFill(color, 1);
            shard.drawRect(0, 0, wPart, hPart);
            shard.endFill();
            shard.lineStyle(1, borderColor, 0.35);
            shard.drawRect(0, 0, wPart, hPart);
            shard.lineStyle(0, 0, 0);
            shard.x = originX + sx;
            shard.y = originY + sy;
            this.effectLayer.addChild(shard);

            const cx = shard.x + wPart * 0.5;
            const cy = shard.y + hPart * 0.5;
            const toMouthX = targetX - cx;
            const toMouthY = targetY - cy;
            const mag = Math.max(1, Math.hypot(toMouthX, toMouthY));
            const dirX = toMouthX / mag;
            const dirY = toMouthY / mag;
            const randomAngle = (this._nextRand() - 0.5) * Math.PI * 0.9;
            const randomSpeed = speedMin + (speedMax - speedMin) * this._nextRand();
            const spreadSpeed = randomSpeed * (0.55 + this._nextRand() * 0.7);
            const spreadVX = Math.cos(randomAngle) * spreadSpeed;
            const spreadVY = Math.sin(randomAngle) * spreadSpeed;
            const vx = (dirX * randomSpeed * mouthBias) + (spreadVX * (1 - mouthBias));
            const vy = (dirY * randomSpeed * mouthBias) + (spreadVY * (1 - mouthBias)) - 30;
            this.effectVisuals.push({
              kind: 'drop_shard',
              node: shard,
              elapsedMs: 0,
              durationMs: shardLifeMs + Math.floor(this._nextRand() * 90),
              vx,
              vy,
              gravity
            });
            emitted += 1;
          }
        }

        if (furnace) {
          const mouthPulse = new PIXI.Graphics();
          mouthPulse.beginFill(0xfb923c, 0.9);
          mouthPulse.drawRect(
            furnace.mouthX + 1,
            furnace.mouthY + 1,
            Math.max(2, furnace.mouthWidth - 2),
            Math.max(2, furnace.mouthHeight - 2)
          );
          mouthPulse.endFill();
          this.effectLayer.addChild(mouthPulse);
          this.effectVisuals.push({
            kind: 'furnace_glow',
            node: mouthPulse,
            elapsedMs: 0,
            durationMs: Math.max(100, markerFlashMs + 90)
          });
        }
      }

      if (marker) {
        const flashFx = new PIXI.Graphics();
        const flashWidth = Math.max(2, Number(marker.width ?? 3) + 2);
        const flashHeight = Math.max(8, Number(marker.height ?? height) + 4);
        flashFx.beginFill(markerColor, 0.95);
        flashFx.drawRoundedRect(
          Number(marker.x) - flashWidth / 2,
          Number(marker.y) - flashHeight / 2,
          flashWidth,
          flashHeight,
          Math.min(4, flashWidth / 2)
        );
        flashFx.endFill();
        this.effectLayer.addChild(flashFx);
        this.effectVisuals.push({
          kind: 'marker_flash',
          node: flashFx,
          elapsedMs: 0,
          durationMs: markerFlashMs
        });
      }

      const lostPoints = Number(drop.lostPoints ?? 0);
      const dropPenaltyCfg = (this.config?.bricks?.dropPenalty || {}) as Record<string, unknown>;
      if (lostPoints > 0 && dropPenaltyCfg.showCoinAnimation !== false) {
        if (this.effectVisuals.length < Math.max(0, Number((this.config?.display?.performance || {} as any).maxActiveEffects ?? 180))) {
          const clearCfg = this._resolveClearAnimationConfig();
          const popW = Math.max(1, Number(drop.width ?? 1));
          const popH = Math.max(1, Number(drop.height ?? 1));
          const centerX = Number(drop.x ?? 0) + popW * 0.5;
          const centerY = Number(drop.y ?? 0) + popH * 0.5;
          const startY = centerY - Math.max(1, popH * 0.2) - clearCfg.startOffsetYPx;
          const textSize = Math.max(
            clearCfg.textMinSizePx,
            Math.min(clearCfg.textMaxSizePx, popH * clearCfg.textSizeFactor)
          );
          const label = `-${Math.round(lostPoints)}`;
          const showCoin = clearCfg.coin.enable && clearCfg.coin.showInPointsAnimation;
          const coinSize = Math.max(6, Number(clearCfg.coin.sizePx ?? 20));
          const coinGap = Math.max(0, Number(clearCfg.coin.gapPx ?? 5));

          const popContainer = new PIXI.Container();
          popContainer.x = this.pixelSnapBricks ? Math.round(centerX) : centerX;
          popContainer.y = this.pixelSnapBricks ? Math.round(startY) : startY;

          const lossText = new PIXI.Text(label, {
            fill: toPixiColor(dropPenaltyCfg.lossTextColor ?? '#ef4444'),
            fontSize: textSize,
            fontFamily: clearCfg.textFontFamily,
            fontWeight: clearCfg.textFontWeight as PIXI.TextStyleFontWeight,
            stroke: toPixiColor(clearCfg.textStrokeColor),
            strokeThickness: clearCfg.textStrokeThickness,
            dropShadow: true,
            dropShadowColor: toPixiColor(clearCfg.textShadowColor),
            dropShadowBlur: clearCfg.textShadowBlur,
            dropShadowDistance: clearCfg.textShadowDistance,
          });

          let totalWidth = lossText.width;
          if (showCoin) totalWidth += coinGap + coinSize;
          const left = -totalWidth * 0.5;

          if (showCoin) {
            const coin = new PIXI.Graphics();
            const seed = this._seedFromValue(`drop|${drop.brickId ?? ''}|${lostPoints}`, this.seed);
            this._drawCoinPrimitive(coin, coinSize, clearCfg.coin, seed);
            coin.x = left + coinSize * 0.5;
            coin.y = 0;
            popContainer.addChild(coin);
          }
          lossText.x = left + (showCoin ? coinSize + coinGap : 0);
          lossText.y = -lossText.height * 0.5;
          popContainer.addChild(lossText);

          this.effectLayer.addChild(popContainer);
          this.effectVisuals.push({
            kind: 'clear_points_pop',
            node: popContainer,
            elapsedMs: 0,
            durationMs: clearCfg.timeoutMs,
            startY: popContainer.y,
            risePx: clearCfg.risePx,
          });
        }
      }
    });
    this.perfStats.peakActiveEffects = Math.max(this.perfStats.peakActiveEffects, this.effectVisuals.length);
  }

  updateEffects(dtMs: number) {
    this._updateHoldProgress();

    if (!this.effectVisuals.length) {
      return;
    }
    const dt = Math.max(0, Number(dtMs) || 0);
    let writeIndex = 0;
    for (let readIndex = 0; readIndex < this.effectVisuals.length; readIndex += 1) {
      const effect = this.effectVisuals[readIndex];
      const node = effect.node;
      if (!node) {
        continue;
      }
      effect.elapsedMs += dt;
      const t = Math.max(0, Math.min(1, effect.elapsedMs / Math.max(1, effect.durationMs)));
      if (effect.kind === 'drop_snap') {
        const eased = 1 - Math.pow(1 - t, 3);
        node.scale.x = Math.max(0.01, 1 - eased);
        node.alpha = Math.max(0, 1 - t * 0.9);
      } else if (effect.kind === 'clear_points_pop') {
        const eased = 1 - Math.pow(1 - t, 3);
        node.y = (Number(effect.startY) || 0) - (Number(effect.risePx) || 0) * eased;
        const scale = 0.92 + (1 - Math.abs(0.5 - t) * 2) * 0.14;
        node.scale.set(scale, scale);
        node.alpha = Math.max(0, 1 - t);
      } else if (effect.kind === 'disintegrate_flash') {
        node.alpha = Math.max(0, 0.55 * (1 - t));
      } else if (effect.kind === 'drop_shard') {
        const dtSec = dt / 1000;
        effect.vy += (Number(effect.gravity) || 0) * dtSec;
        node.x += (Number(effect.vx) || 0) * dtSec;
        node.y += (Number(effect.vy) || 0) * dtSec;
        node.alpha = Math.max(0, 1 - t * 1.05);
        node.rotation += (Number(effect.vx) || 0) * 0.0006;
      } else if (effect.kind === 'furnace_ingest') {
        const eased = 1 - Math.pow(1 - t, 3);
        node.x = effect.startX + (effect.endX - effect.startX) * eased;
        node.y = effect.startY + (effect.endY - effect.startY) * eased;
        node.scale.x = Math.max(0.15, 1 - t * 0.85);
        node.scale.y = Math.max(0.25, 1 - t * 0.75);
        node.alpha = Math.max(0, 1 - t * 0.95);
      } else if (effect.kind === 'furnace_glow') {
        node.alpha = 0.25 + 0.7 * Math.sin((1 - t) * Math.PI);
      } else if (effect.kind === 'furnace_spark') {
        node.x += (Number(effect.vx) || 0) * (dt / 1000);
        node.y += (Number(effect.vy) || 0) * (dt / 1000);
        node.alpha = Math.max(0, 1 - t);
      } else if (effect.kind === 'marker_flash') {
        node.alpha = Math.max(0, 0.95 * (1 - t));
      }
      if (t < 1) {
        this.effectVisuals[writeIndex] = effect;
        writeIndex += 1;
      } else {
        node.destroy();
        this.perfStats.effectsDestroyed += 1;
      }
    }
    this.effectVisuals.length = writeIndex;
    this.perfStats.peakActiveEffects = Math.max(this.perfStats.peakActiveEffects, this.effectVisuals.length);
  }

  _updateHoldProgress() {
    if (!this.holdProgressGraphics) return;
    this.holdProgressGraphics.clear();

    const practiceUiCfg = this.config?.display?.practiceFeedback || {};
    if (practiceUiCfg.showHoldProgressCircle !== true) return;

    // Check spotlight
    let hold = this.spotlightHoldStart;
    let pos = this.spotlightPointerPos;

    // Check conveyors if no spotlight hold
    if (!hold || hold.mode !== 'hold_duration') {
      for (const [cid, h] of this.conveyorHoldStart) {
        if (h.mode === 'hold_duration') {
          hold = h;
          pos = this.conveyorPointerPos.get(cid) ?? { x: null, y: null };
          break;
        }
      }
    }

    // Check direct brick holds if still no hold
    if (!hold || hold.mode !== 'hold_duration') {
      for (const [bid, h] of this.brickHoldStart) {
        hold = { brickId: bid, t: h.t, mode: 'hold_duration' };
        pos = { x: h.x, y: h.y };
        break;
      }
    }

    if (!hold || hold.mode !== 'hold_duration' || hold.t === null) return;
    
    let drawX = pos.x;
    let drawY = pos.y;
    if (this.pointerInCanvas && this.pointerCanvasPos.x !== null && this.pointerCanvasPos.y !== null) {
      drawX = this.pointerCanvasPos.x;
      drawY = this.pointerCanvasPos.y;
    }

    if (drawX === null || drawY === null) return;

    const sprite = this.brickSprites.get(hold.brickId);
    const targetMs = Math.max(50, Number(sprite?.targetHoldMs ?? this.config.bricks.completionParams?.target_hold_ms ?? 700));
    const elapsedMs = performance.now() - hold.t;
    const progress = elapsedMs / targetMs;

    const radius = Number(practiceUiCfg.holdProgressCircleRadius ?? 24);
    const thickness = Number(practiceUiCfg.holdProgressCircleThickness ?? 4);
    const color = toPixiColor(practiceUiCfg.holdProgressCircleColor ?? '#3b82f6');
    const colorOvertime = toPixiColor(practiceUiCfg.holdProgressCircleColorOvertime ?? '#ef4444');
    const bgColor = practiceUiCfg.holdProgressCircleBgColor ? toPixiColor(practiceUiCfg.holdProgressCircleBgColor) : 0xffffff;
    const bgAlpha = Number(practiceUiCfg.holdProgressCircleBgAlpha ?? 0.2);

    // Draw background circle
    this.holdProgressGraphics.beginFill(bgColor, bgAlpha);
    this.holdProgressGraphics.drawCircle(drawX, drawY, radius);
    this.holdProgressGraphics.endFill();

    // Draw progress arc
    if (progress > 0) {
      const startAngle = -Math.PI / 2;
      
      if (progress <= 1) {
        // First lap
        this.holdProgressGraphics.lineStyle(thickness, color, 1);
        const endAngle = startAngle + (Math.PI * 2 * progress);
        this.holdProgressGraphics.arc(drawX, drawY, radius - thickness / 2, startAngle, endAngle);
      } else {
        // Overtime - Second lap (or more)
        // 1. Draw full circle of the base color
        this.holdProgressGraphics.lineStyle(thickness, color, 1);
        this.holdProgressGraphics.drawCircle(drawX, drawY, radius - thickness / 2);
        
        // 2. Draw the overshoot arc on top
        const overProgress = progress % 1;
        this.holdProgressGraphics.lineStyle(thickness, colorOvertime, 1);
        const endAngle = startAngle + (Math.PI * 2 * (overProgress === 0 ? 1 : overProgress));
        this.holdProgressGraphics.arc(drawX, drawY, radius - thickness / 2, startAngle, endAngle);
      }
      this.holdProgressGraphics.lineStyle(0);
    }
  }

  _setupHUD() {
    const uiCfg = this.config?.display?.ui ?? this.config?.ui ?? {};
    if (uiCfg.showHUD === false) {
      return;
    }
    const hudFontFamily = String(uiCfg.hudFontFamily || uiCfg.hudFont || 'Inter, Arial, sans-serif');
    const hudFontSize = Number(uiCfg.hudFontSize ?? 16);
    const hudColor = toPixiColor(uiCfg.hudColor ?? '#f5f6fa');
    const panelEnabled = uiCfg.hudPanel !== false;
    if (panelEnabled) {
      const panel = new PIXI.Graphics();
      panel.x = Number(uiCfg.hudOffsetX ?? 10);
      panel.y = Number(uiCfg.hudOffsetY ?? 10);
      this.hudLayer.addChild(panel);
      this.hudBackground = panel;
    }
    const hudStyle = new PIXI.TextStyle({
      fill: hudColor,
      fontSize: Number.isFinite(hudFontSize) ? hudFontSize : 16,
      fontFamily: hudFontFamily,
      fontWeight: String(uiCfg.hudFontWeight || '500') as PIXI.TextStyleFontWeight,
      lineHeight: Number(uiCfg.hudLineHeight ?? 22)
    });
    // Pixi v7 Text constructor signature: (text, style)
    const hudText = new PIXI.Text('', hudStyle);
    hudText.x = Number(uiCfg.hudOffsetX ?? 10);
    hudText.y = Number(uiCfg.hudOffsetY ?? 10);
    this.hudLayer.addChild(hudText);
    this.hudElements.status = hudText;
  }

  /**
   * Synchronises PIXI sprites with the logical bricks iterable.
   */
  syncBricks(bricks: Iterable<any>, completionMode: string, completionParams: any, focusState: any = null) {
    this._spriteSyncEpoch += 1;
    const syncEpoch = this._spriteSyncEpoch;
    const interactionMode = this._getInteractionTargetMode();
    const conveyorWideHitArea = interactionMode === 'conveyor';
    const spotlightWideHitArea = interactionMode === 'spotlight';
    this.bricksByConveyor.clear();
    const focusEnabled = Boolean(focusState?.enabled);
    this.activeBrickId = focusEnabled ? focusState?.activeBrickId ?? null : null;
    for (const brick of bricks) {
      const cid = String(brick.conveyorId ?? '');
      if (!this.bricksByConveyor.has(cid)) {
        this.bricksByConveyor.set(cid, []);
      }
      this.bricksByConveyor.get(cid)!.push(brick);

      let sprite = this.brickSprites.get(brick.id);
      if (!sprite) {
        sprite = this._createBrickSprite(brick);
        this.brickSprites.set(brick.id, sprite);
        this.brickLayer.addChild(sprite);
      }
      sprite.targetHoldMs = brick.targetHoldMs;

      // Late-initialize baseline if not already present (for existing bricks during transition)
      if (sprite.initialSimX === undefined) {
        sprite.initialSimX = Number(brick.x ?? 0);
        const conveyorIdx = Number(String(brick.conveyorId ?? '').replace(/\D/g, ''));
        const vis = this.beltVisuals[conveyorIdx];
        sprite.initialRendererOffsetX = vis ? Number(vis.offsetX ?? 0) : 0;
      }
      const desiredFill = toPixiColor(brick.color ?? this.config.display.brickColor);
      const desiredBorder = toPixiColor(brick.borderColor ?? this.config.display.brickBorderColor ?? 0x0f172a);
      const desiredShape = normalizeBrickShape(brick.shape ?? this.config.display.brickShape);
      const progressChanged = sprite.progressValue !== brick.clearProgress;
      const needsProgressRedraw =
        progressChanged &&
        (completionMode === 'hold_duration' || completionMode === 'hover_to_clear' || completionMode === 'hold_to_clear' || completionMode === 'task_sequence') &&
        !sprite.usesProgressMask;
      if (
        sprite.modeValue !== completionMode ||
        sprite.fillColorValue !== desiredFill ||
        sprite.borderColorValue !== desiredBorder ||
        sprite.textureStyleValue !== normalizeTextureStyleId(brick.textureStyle ?? '') ||
        sprite.shapeValue !== desiredShape ||
        sprite.brickWidth !== brick.width ||
        sprite.brickHeight !== brick.height ||
        needsProgressRedraw
      ) {
        this._drawBrickGraphics(sprite, brick, completionMode);
      }
      this._updateBrickProgressVisual(sprite, brick, completionMode);

      const resolution = Math.max(1, Number(this.app?.renderer?.resolution ?? 1));
      const step = this.pixelSnapBricks ? 1 : (1 / resolution);

      // Lock visual X to the belt offset to eliminate relative drift jitter.
      const conveyorIdx = Number(String(brick.conveyorId ?? '').replace(/\D/g, ''));
      const vis = this.beltVisuals[conveyorIdx];
      let x = 0;
      if (vis) {
        const relativeX = Number(sprite.initialSimX ?? 0) - Number(sprite.initialRendererOffsetX ?? 0);
        if (this.pixelSnapBricks) {
          // Snap belt offset and relative position separately so they jump pixels at the same moment.
          const snappedBeltOffsetX = this._roundSymmetric(vis.offsetX, step);
          const snappedRelativeX = this._roundSymmetric(relativeX, step);
          x = snappedBeltOffsetX + snappedRelativeX;
        } else {
          // Use exact float offset so sub-pixel motion is smooth at any speed.
          x = vis.offsetX + relativeX;
        }
      } else {
        x = this._roundSymmetric(brick.x, step);
      }
      
      const y = this._roundSymmetric(brick.y, step);

      sprite.position.set(x, y);
      const isFocused = !focusEnabled || brick.id === this.activeBrickId;
      if (conveyorWideHitArea || spotlightWideHitArea) {
        sprite.eventMode = 'none';
        sprite.cursor = 'default';
      } else {
        sprite.eventMode = isFocused ? 'dynamic' : 'none';
        sprite.cursor = isFocused ? 'pointer' : 'default';
      }
      if (completionMode === 'multi_click') {
        sprite.alpha = 1 - Math.min(1, (brick.clicks ?? 0) / Math.max(1, completionParams?.clicks_required ?? 2)) * 0.6;
        sprite.tint = brickProgressTint(brick, completionMode, completionParams);
      } else if (completionMode === 'hold_duration') {
        sprite.alpha = isFocused ? 1 : 0.95;
        sprite.tint = 0xffffff;
      } else {
        sprite.alpha = isFocused ? 1 : 0.95;
        sprite.tint = 0xffffff;
      }
      sprite._syncEpoch = syncEpoch;
    }
    // Remove stale sprites.
    this.brickSprites.forEach((sprite, id) => {
      if (sprite?._syncEpoch !== syncEpoch) {
        sprite?.destroy?.();
        this.brickSprites.delete(id);
      }
    });
    this.perfStats.peakBrickSprites = Math.max(this.perfStats.peakBrickSprites, this.brickSprites.size);
    this._updateSpotlight(focusState);
    this._reconcileStationaryPointerInteractions(completionMode);
    const conveyorHoverReconciled = conveyorWideHitArea && completionMode === 'hover_to_clear' && this.pointerInCanvas;
    if (conveyorWideHitArea && completionMode === 'hover_to_clear' && !conveyorHoverReconciled) {
      this.conveyorHovered.forEach((cid) => {
        const next = this._getConveyorTargetBrickId(cid);
        const prev = this.conveyorHoverTarget.get(cid) || null;
        const pos = this.conveyorPointerPos.get(cid) || { x: null, y: null };
        if (prev && prev !== next) {
          this.onBrickHover(prev, false, pos.x ?? null, pos.y ?? null);
        }
        if (next && next !== prev) {
          this.onBrickHover(next, true, pos.x ?? null, pos.y ?? null);
          this.conveyorHoverTarget.set(cid, next);
        } else if (!next) {
          this.conveyorHoverTarget.delete(cid);
        }
      });
    }
    this._syncSpotlightHoverTarget(completionMode);
  }

  _resetBrickVisualChildren(sprite: any) {
    if (!sprite) {
      return;
    }
    const children = sprite.removeChildren();
    children.forEach((child: any) => child?.destroy?.());
    sprite.mainGraphic = null;
    sprite.progressGraphic = null;
    sprite.progressMask = null;
    sprite.usesProgressMask = false;
    sprite.progressMaxWidth = 0;
    sprite.progressMaskWidth = -1;
  }

  _drawBrickBody(target: PIXI.Graphics, {
    brick,
    shape,
    width,
    height,
    cornerRadius,
    fillColor,
    fillAlpha = 1,
    borderColor,
    borderAlpha = 0.5,
    borderWidth = 1.25,
    withTextureOverlay = true,
  }: { brick: any; shape: string; width: number; height: number; cornerRadius: number; fillColor: number; fillAlpha?: number; borderColor: number; borderAlpha?: number; borderWidth?: number; withTextureOverlay?: boolean }) {
    target.beginFill(fillColor, fillAlpha);
    this._drawBrickPrimitive(target, shape, width, height, cornerRadius);
    target.endFill();
    if (withTextureOverlay) {
      this._drawBrickTextureOverlay(target, brick, shape, width, height, cornerRadius, fillAlpha);
    }
    if (borderWidth > 0 && borderAlpha > 0) {
      target.lineStyle(borderWidth, borderColor, borderAlpha);
      this._drawBrickPrimitive(target, shape, width, height, cornerRadius);
      target.lineStyle(0, 0, 0);
    }
  }

  _shouldUseProgressMask(shape: string, completionMode: string) {
    if (!['hold_duration', 'hover_to_clear', 'hold_to_clear', 'task_sequence'].includes(completionMode)) {
      return false;
    }
    // Circles should deplete via the same right-edge clipping path as rectangles.
    return shape === 'rect' || shape === 'rounded_rect' || shape === 'circle';
  }

  _createBrickSprite(brick: any) {
    const sprite: any = new PIXI.Container();
    sprite.brickId = brick.id;

    // Capture baseline for perfectly locked motion relative to belt.
    sprite.initialSimX = Number(brick.x ?? 0);
    const conveyorIdx = Number(String(brick.conveyorId ?? '').replace(/\D/g, ''));
    const vis = this.beltVisuals[conveyorIdx];
    sprite.initialRendererOffsetX = vis ? Number(vis.offsetX ?? 0) : 0;

    sprite.cursor = 'pointer';
    sprite.eventMode = 'dynamic';
    if (this.config.bricks.completionMode === 'hold_duration') {
      const beginHold = (e: any) => {
        const gx = (e && (e.globalX ?? (e.global && e.global.x))) ?? 0;
        const gy = (e && (e.globalY ?? (e.global && e.global.y))) ?? 0;
        this._emitPointerDebug('brick_hold_begin', brick.id, e);
        this.brickHoldStart.set(brick.id, {
          t: performance.now(),
          x: gx,
          y: gy
        });
      };
      const endHold = (e: any) => {
        const start = this.brickHoldStart.get(brick.id);
        if (!start) {
          return;
        }
        this.brickHoldStart.delete(brick.id);
        const gx = (e && (e.globalX ?? (e.global && e.global.x))) ?? start.x ?? 0;
        const gy = (e && (e.globalY ?? (e.global && e.global.y))) ?? start.y ?? 0;
        const durationMs = Math.max(0, performance.now() - start.t);
        this._emitPointerDebug('brick_hold_end', brick.id, e, { hold_ms: Math.round(durationMs) });
        this.onBrickHold(brick.id, durationMs, gx, gy);
      };
      sprite.on('pointerdown', beginHold);
      // End hold across multiple exit/release cases because bricks move while
      // the pointer is down, which can otherwise drop the release callback.
      sprite.on('pointerup', endHold);
      sprite.on('pointerupoutside', endHold);
      sprite.on('pointerout', (e: any) => {
        this._emitPointerDebug('brick_pointerout', brick.id, e);
      });
      sprite.on('pointerleave', (e: any) => {
        this._emitPointerDebug('brick_pointerleave', brick.id, e);
      });
      sprite.on('pointeroutoutside', (e: any) => {
        this._emitPointerDebug('brick_pointeroutoutside', brick.id, e);
      });
      sprite.on('pointercancel', endHold);
    } else if (this.config.bricks.completionMode === 'hold_to_clear') {
      const beginHold = (e: any) => {
        const gx = (e && (e.globalX ?? (e.global && e.global.x))) ?? 0;
        const gy = (e && (e.globalY ?? (e.global && e.global.y))) ?? 0;
        this._emitPointerDebug('brick_hold_state_begin', brick.id, e);
        this.onBrickHoldState(brick.id, true, gx, gy);
      };
      const endHold = (e: any) => {
        const gx = (e && (e.globalX ?? (e.global && e.global.x))) ?? 0;
        const gy = (e && (e.globalY ?? (e.global && e.global.y))) ?? 0;
        this._emitPointerDebug('brick_hold_state_end', brick.id, e);
        this.onBrickHoldState(brick.id, false, gx, gy);
      };
      sprite.on('pointerdown', beginHold);
      sprite.on('pointerup', endHold);
      sprite.on('pointerupoutside', endHold);
      sprite.on('pointerout', (e: any) => {
        this._emitPointerDebug('brick_pointerout', brick.id, e);
      });
      sprite.on('pointerleave', (e: any) => {
        this._emitPointerDebug('brick_pointerleave', brick.id, e);
      });
      sprite.on('pointeroutoutside', (e: any) => {
        this._emitPointerDebug('brick_pointeroutoutside', brick.id, e);
      });
      sprite.on('pointercancel', endHold);
    } else if (this.config.bricks.completionMode === 'hover_to_clear') {
      const beginHover = (e: any) => {
        const gx = (e && (e.globalX ?? (e.global && e.global.x))) ?? 0;
        const gy = (e && (e.globalY ?? (e.global && e.global.y))) ?? 0;
        this._emitPointerDebug('brick_hover_begin', brick.id, e);
        this.onBrickHover(brick.id, true, gx, gy);
      };
      const endHover = (e: any) => {
        const gx = (e && (e.globalX ?? (e.global && e.global.x))) ?? 0;
        const gy = (e && (e.globalY ?? (e.global && e.global.y))) ?? 0;
        this._emitPointerDebug('brick_hover_end', brick.id, e);
        this.onBrickHover(brick.id, false, gx, gy);
      };
      sprite.on('pointerover', beginHover);
      sprite.on('pointerout', endHover);
      sprite.on('pointeroutoutside', endHover);
      sprite.on('pointercancel', endHover);
    } else {
      const handleClick = (e: any) => {
        // Use pointerdown so moving bricks still register immediately.
        const gx = (e && (e.globalX ?? (e.global && e.global.x))) ?? 0;
        const gy = (e && (e.globalY ?? (e.global && e.global.y))) ?? 0;
        this._emitPointerDebug('brick_click_event', brick.id, e);
        this.onBrickClick(brick.id, gx, gy);
      };
      sprite.on('pointerdown', handleClick);
      // Keep pointertap as a compatibility fallback.
      sprite.on('pointertap', handleClick);
    }

    this._drawBrickGraphics(sprite, brick, this.config.bricks.completionMode);
    return sprite;
  }

  _drawBrickGraphics(sprite: any, brick: any, completionMode: string) {
    const color = toPixiColor(brick.color ?? this.config.display.brickColor);
    const borderColor = toPixiColor(brick.borderColor ?? this.config.display.brickBorderColor ?? 0x0f172a);
    const shape = normalizeBrickShape(brick.shape ?? this.config.display.brickShape);
    const defaultCornerRadius = Math.max(0, Number(this.config.display.brickCornerRadius ?? 0));
    this._resetBrickVisualChildren(sprite);
    const cornerRadius = Math.max(
      0,
      Math.min(Number(defaultCornerRadius) || 0, Number(brick.width) / 2, Number(brick.height) / 2)
    );
    const supportsMaskProgress = this._shouldUseProgressMask(shape, completionMode);

    if (supportsMaskProgress && (completionMode === 'hold_duration' || completionMode === 'hold_to_clear' || completionMode === 'hover_to_clear' || completionMode === 'task_sequence')) {
      const isHover = completionMode === 'hover_to_clear';
      
      const mask = new PIXI.Graphics();
      mask.beginFill(0xffffff, 1);
      this._drawBrickPrimitive(mask, shape, brick.width, brick.height, cornerRadius);
      mask.endFill();
      sprite.addChild(mask);
      sprite.progressMask = mask;
      sprite.usesProgressMask = true;
      sprite.progressMaxWidth = brick.width;
      sprite.progressShapeValue = shape;
      sprite.progressRadiusValue = cornerRadius;

      // 1. Background layer: Border only.
      const bgGraphic = new PIXI.Graphics();
      this._drawBrickBody(bgGraphic, {
        brick,
        shape,
        width: brick.width,
        height: brick.height,
        cornerRadius,
        fillColor: 0,
        fillAlpha: 0,
        borderColor,
        borderAlpha: isHover ? 0.15 : 0.45,
        borderWidth: isHover ? 1 : 1.25,
        withTextureOverlay: false,
      });
      bgGraphic.mask = mask;
      sprite.addChild(bgGraphic);
      sprite.mainGraphic = bgGraphic;

      // 2. Progress layer: Fill and Texture.
      const progressGraphic = new PIXI.Graphics();
      this._drawBrickBody(progressGraphic, {
        brick,
        shape,
        width: brick.width,
        height: brick.height,
        cornerRadius,
        fillColor: color,
        fillAlpha: isHover ? 0.96 : 1,
        borderColor,
        borderAlpha: 0,
        borderWidth: 0,
      });
      progressGraphic.mask = mask;
      sprite.addChild(progressGraphic);
      sprite.progressGraphic = progressGraphic;

    } else if (completionMode === 'hold_duration' || completionMode === 'hold_to_clear' || completionMode === 'task_sequence') {
      const legacyGraphic = new PIXI.Graphics();
      const remainingWidth = getBrickVisibleWidth(brick, completionMode);
      const legacyRadius = Math.max(0, Math.min(cornerRadius, remainingWidth / 2, brick.height / 2));
      if (remainingWidth > 0) {
        this._drawBrickBody(legacyGraphic, {
          brick,
          shape,
          width: remainingWidth,
          height: brick.height,
          cornerRadius: legacyRadius,
          fillColor: color,
          fillAlpha: 1,
          borderColor,
          borderAlpha: 0.45,
        });
      }
      sprite.addChild(legacyGraphic);
      sprite.mainGraphic = legacyGraphic;
    } else if (completionMode === 'hover_to_clear') {
      const legacyGraphic = new PIXI.Graphics();
      const remainingWidth = getBrickVisibleWidth(brick, completionMode);
      if (remainingWidth > 0) {
        this._drawBrickBody(legacyGraphic, {
          brick,
          shape,
          width: remainingWidth,
          height: brick.height,
          cornerRadius: Math.max(0, Math.min(cornerRadius, remainingWidth / 2)),
          fillColor: color,
          fillAlpha: 0.96,
          borderColor,
          borderAlpha: 0,
          borderWidth: 0,
        });
      }
      sprite.addChild(legacyGraphic);
      sprite.mainGraphic = legacyGraphic;
    } else {
      const mainGraphic = new PIXI.Graphics();
      this._drawBrickBody(mainGraphic, {
        brick,
        shape,
        width: brick.width,
        height: brick.height,
        cornerRadius,
        fillColor: color,
        fillAlpha: 1,
        borderColor,
        borderAlpha: 0.5,
      });
      sprite.addChild(mainGraphic);
      sprite.mainGraphic = mainGraphic;
    }
    sprite.hitArea = this._buildBrickHitArea(shape, brick.width, brick.height);
    sprite.modeValue = completionMode;
    sprite.fillColorValue = color;
    sprite.borderColorValue = borderColor;
    sprite.textureStyleValue = normalizeTextureStyleId(brick.textureStyle ?? '');
    sprite.shapeValue = shape;
    sprite.brickWidth = brick.width;
    sprite.brickHeight = brick.height;
    sprite.progressValue = brick.clearProgress;
    sprite.progressMaskWidth = -1;
    sprite.progressMaskBypassed = false;
  }

  _updateBrickProgressVisual(sprite: any, brick: any, completionMode: string) {
    sprite.progressValue = brick.clearProgress;
    if (!sprite.usesProgressMask || !sprite.progressMask || !sprite.progressGraphic) {
      return;
    }
    const resolution = Math.max(1, Number(this.app?.renderer?.resolution ?? 1));
    const remainingWidth = getBrickVisibleWidth(brick, completionMode);
    const maxWidth = Math.max(1, Number(sprite.progressMaxWidth ?? brick.width) || 1);
    const width = Math.max(0, Math.min(maxWidth, remainingWidth));
    const h = Math.max(1, Number(brick.height) || 1);

    const renderedWidth = this.pixelSnapBricks ? Math.round(width) : width;

    // Avoid clipping at full width to prevent right-edge artifacts.
    // Use a tiny epsilon to ensure mask is off when progress is negligible.
    if (renderedWidth >= maxWidth - (1 / resolution) * 0.05) {
      if (sprite.progressGraphic.mask) {
        sprite.progressGraphic.mask = null;
        if (sprite.mainGraphic) sprite.mainGraphic.mask = null;
        sprite.progressMask.visible = false;
      }
      sprite.progressMaskWidth = renderedWidth;
      return;
    }

    if (sprite.progressGraphic.mask !== sprite.progressMask) {
      sprite.progressGraphic.mask = sprite.progressMask;
      if (sprite.mainGraphic) sprite.mainGraphic.mask = sprite.progressMask;
    }
    sprite.progressMask.visible = true;

    if (renderedWidth === sprite.progressMaskWidth && sprite.progressMask.height === h) {
      return;
    }

    sprite.progressMaskWidth = renderedWidth;
    
    // Scaling the Graphics mask achieves silky smooth sub-pixel clipping without jitter.
    const scaleX = maxWidth > 0 ? renderedWidth / maxWidth : 0;
    sprite.progressMask.scale.set(scaleX, 1);
    sprite.progressMask.position.set(0, 0);
  }

  _resolveBrickTextureOverlayConfig(brick: any) {
    const base = this.config?.display?.brickTextureOverlay || {};
    if (base.enable !== true) {
      return null;
    }
    const styleId = normalizeTextureStyleId(brick?.textureStyle ?? base?.style ?? '');
    if (!styleId) {
      return base;
    }
    const customStyles = base?.styles && typeof base.styles === 'object' ? base.styles : {};
    const custom = this._findCustomStyle(customStyles, styleId);
    const builtin = (BUILTIN_BRICK_TEXTURE_STYLES as Record<string, any>)?.[styleId];
    const override = custom && typeof custom === 'object'
      ? custom
      : (builtin && typeof builtin === 'object' ? builtin : null);
    if (!override) {
      return base;
    }
    return { ...base, ...override };
  }

  _drawTextureLabelPatch(target: PIXI.Graphics, w: number, h: number, inset: number, alphaBase: number, cfg: Record<string, any>) {
    if (cfg.labelPatch !== true) {
      return;
    }
    const patchW = Math.max(8, Math.round(w * 0.26));
    const patchH = Math.max(5, Math.round(h * 0.2));
    const px = Math.round(w - patchW - inset - 1);
    const py = Math.round(inset + 1);
    const patchColor = toPixiColor(cfg.labelPatchColor ?? '#f8fafc');
    const patchAlpha = Math.max(0, Math.min(1, Number(cfg.labelPatchAlpha ?? 0.8)));
    const patchBorder = toPixiColor(cfg.labelPatchBorderColor ?? '#334155');
    const barcodeColor = toPixiColor(cfg.labelBarcodeColor ?? '#111827');
    target.beginFill(patchColor, alphaBase * patchAlpha);
    target.drawRoundedRect(px, py, patchW, patchH, 1);
    target.endFill();
    target.beginFill(patchBorder, alphaBase * 0.35);
    target.drawRect(px, py + patchH - 1, patchW, 1);
    target.endFill();
    for (let i = 0; i < 4; i += 1) {
      const bx = px + 2 + i * Math.max(1, Math.floor((patchW - 4) / 4));
      const bw = Math.max(1, (i % 2 === 0 ? 1 : 2));
      target.beginFill(barcodeColor, alphaBase * 0.55);
      target.drawRect(bx, py + Math.max(1, Math.floor(patchH * 0.34)), bw, Math.max(1, patchH - 3));
      target.endFill();
    }
  }

  _drawTextureBandAndPlate(target: PIXI.Graphics, w: number, h: number, inset: number, alphaBase: number, cfg: Record<string, any>) {
    if (cfg.bandColor == null) {
      return;
    }
    const bandColor = toPixiColor(cfg.bandColor);
    const bandAlpha = Math.max(0, Math.min(1, Number(cfg.bandAlpha ?? 0.28)));
    const bandW = Math.max(2, Math.round(w * 0.12));
    target.beginFill(bandColor, alphaBase * bandAlpha);
    target.drawRect(inset, inset, bandW, Math.max(1, h - inset * 2));
    target.drawRect(Math.max(inset, w - inset - bandW), inset, bandW, Math.max(1, h - inset * 2));
    target.endFill();
    const plateColor = toPixiColor(cfg.lockPlateColor ?? '#fef3c7');
    const plateAlpha = Math.max(0, Math.min(1, Number(cfg.lockPlateAlpha ?? 0.68)));
    const plateW = Math.max(3, Math.round(w * 0.14));
    const plateH = Math.max(3, Math.round(h * 0.22));
    target.beginFill(plateColor, alphaBase * plateAlpha);
    target.drawRoundedRect(Math.round((w - plateW) * 0.5), Math.round((h - plateH) * 0.5), plateW, plateH, 1);
    target.endFill();
  }

  _drawTexturePizza(target: PIXI.Graphics, w: number, h: number, inset: number, alphaBase: number, phase: number, idNum: number, cfg: Record<string, any>) {
    const crustColor = toPixiColor(cfg.crustColor ?? '#a16207');
    const sauceColor = toPixiColor(cfg.sauceColor ?? '#b91c1c');
    const cheeseColor = toPixiColor(cfg.cheeseColor ?? '#facc15');
    const toppingColor = toPixiColor(cfg.toppingColor ?? '#7f1d1d');
    const sliceLineColor = toPixiColor(cfg.sliceLineColor ?? '#7c2d12');
    const sliceCount = Math.max(4, Math.min(12, Math.floor(Number(cfg.sliceCount ?? 6))));
    const toppingCount = Math.max(0, Math.min(24, Math.floor(Number(cfg.toppingCount ?? 7))));
    const cx = w * 0.5;
    const cy = h * 0.5;
    const rx = Math.max(2, w * 0.5 - inset);
    const ry = Math.max(2, h * 0.5 - inset);
    const crustThickness = Math.max(2, Math.round(Math.min(rx, ry) * 0.13));
    const sauceInset = crustThickness + 1;
    const cheeseInset = crustThickness + Math.max(2, Math.round(crustThickness * 0.7));

    target.beginFill(crustColor, alphaBase * 0.98);
    target.drawEllipse(cx, cy, rx, ry);
    target.endFill();

    target.beginFill(sauceColor, alphaBase * 0.78);
    target.drawEllipse(cx, cy, Math.max(1, rx - sauceInset), Math.max(1, ry - sauceInset));
    target.endFill();

    target.beginFill(cheeseColor, alphaBase * 0.72);
    target.drawEllipse(cx, cy, Math.max(1, rx - cheeseInset), Math.max(1, ry - cheeseInset));
    target.endFill();

    const seamWidth = Math.max(1, Number(cfg.seamWidthPx ?? 1));
    target.lineStyle(Math.max(1, seamWidth), sliceLineColor, alphaBase * 0.5);
    for (let i = 0; i < sliceCount; i += 1) {
      const angle = (Math.PI * 2 * i) / sliceCount + phase * Math.PI * 0.3;
      const ex = cx + Math.cos(angle) * Math.max(1, rx - sauceInset - 1);
      const ey = cy + Math.sin(angle) * Math.max(1, ry - sauceInset - 1);
      target.moveTo(cx, cy);
      target.lineTo(ex, ey);
    }
    target.lineStyle(0, 0, 0);

    let local = ((idNum || 1) * 2654435761) >>> 0;
    const rand = () => {
      local ^= (local << 13) >>> 0;
      local ^= local >>> 17;
      local ^= (local << 5) >>> 0;
      return (local >>> 0) / 0x100000000;
    };
    const toppingRadius = Math.max(1.2, Math.min(5, Math.min(w, h) * 0.06));
    for (let i = 0; i < toppingCount; i += 1) {
      const a = rand() * Math.PI * 2;
      const r = Math.sqrt(rand()) * 0.72;
      const tx = cx + Math.cos(a) * (rx - cheeseInset - toppingRadius) * r;
      const ty = cy + Math.sin(a) * (ry - cheeseInset - toppingRadius) * r;
      target.beginFill(toppingColor, alphaBase * 0.86);
      target.drawCircle(tx, ty, toppingRadius);
      target.endFill();
    }
  }

  _drawTextureGiftWrap(target: PIXI.Graphics, w: number, h: number, inset: number, alphaBase: number, seamColor: number, seamWidth: number, cfg: Record<string, any>) {
    const ribbonColor = toPixiColor(cfg.ribbonColor ?? '#fef3c7');
    const ribbonAlpha = Math.max(0, Math.min(1, Number(cfg.ribbonAlpha ?? 1)));
    const ribbonWidthRatio = Math.max(0.08, Math.min(0.5, Number(cfg.ribbonWidthRatio ?? 0.24)));
    const ribbonInsetPx = Math.max(0, Number(cfg.ribbonInsetPx ?? inset));
    const bowBorderColor = toPixiColor(cfg.bowBorderColor ?? seamColor);
    const bowBorderAlpha = Math.max(0, Math.min(1, Number(cfg.bowBorderAlpha ?? 0.7)));
    const bowBorderWidth = Math.max(1, Number(cfg.bowBorderWidthPx ?? seamWidth));
    const ribbonW = Math.max(3, Math.round(w * ribbonWidthRatio));
    const ribbonH = Math.max(3, Math.round(h * ribbonWidthRatio));
    const cx = Math.round((w - ribbonW) * 0.5);
    const cy = Math.round((h - ribbonH) * 0.5);
    const usableW = Math.max(1, w - ribbonInsetPx * 2);
    const usableH = Math.max(1, h - ribbonInsetPx * 2);
    const paperPatternColor = toPixiColor(cfg.paperPatternColor ?? '#ffffff');
    const paperPatternAlpha = Math.max(0, Math.min(0.75, Number(cfg.paperPatternAlpha ?? 0.32)));
    const paperDotStep = Math.max(6, Math.floor(Number(cfg.paperDotStepPx ?? 11)));
    for (let py = ribbonInsetPx + 2; py < ribbonInsetPx + usableH - 1; py += paperDotStep) {
      for (let px = ribbonInsetPx + 2; px < ribbonInsetPx + usableW - 1; px += paperDotStep) {
        target.beginFill(paperPatternColor, alphaBase * paperPatternAlpha);
        target.drawCircle(px + ((Math.floor(py / paperDotStep) % 2) ? 2 : 0), py, 0.8);
        target.endFill();
      }
    }

    target.beginFill(ribbonColor, alphaBase * ribbonAlpha);
    target.drawRect(cx, ribbonInsetPx, ribbonW, usableH);
    target.drawRect(ribbonInsetPx, cy, usableW, ribbonH);
    target.endFill();

    const bowAlpha = alphaBase * Math.max(0.55, ribbonAlpha);
    const bowSize = Math.max(3, Math.round(Math.min(w, h) * 0.18));
    target.beginFill(ribbonColor, bowAlpha);
    target.drawCircle(cx + ribbonW * 0.5 - bowSize, cy + ribbonH * 0.5, bowSize);
    target.drawCircle(cx + ribbonW * 0.5 + bowSize, cy + ribbonH * 0.5, bowSize);
    target.drawCircle(cx + ribbonW * 0.5, cy + ribbonH * 0.5, Math.max(1.2, bowSize * 0.58));
    target.drawPolygon([
      cx + ribbonW * 0.5 - bowSize * 0.2, cy + ribbonH * 0.5 + bowSize * 0.6,
      cx + ribbonW * 0.5 - bowSize * 0.95, cy + ribbonH * 0.5 + bowSize * 1.75,
      cx + ribbonW * 0.5 - bowSize * 0.15, cy + ribbonH * 0.5 + bowSize * 1.2,
    ]);
    target.drawPolygon([
      cx + ribbonW * 0.5 + bowSize * 0.2, cy + ribbonH * 0.5 + bowSize * 0.6,
      cx + ribbonW * 0.5 + bowSize * 0.95, cy + ribbonH * 0.5 + bowSize * 1.75,
      cx + ribbonW * 0.5 + bowSize * 0.15, cy + ribbonH * 0.5 + bowSize * 1.2,
    ]);
    target.endFill();
    target.lineStyle(bowBorderWidth, bowBorderColor, alphaBase * bowBorderAlpha);
    target.drawCircle(cx + ribbonW * 0.5 - bowSize, cy + ribbonH * 0.5, bowSize);
    target.drawCircle(cx + ribbonW * 0.5 + bowSize, cy + ribbonH * 0.5, bowSize);
    target.drawCircle(cx + ribbonW * 0.5, cy + ribbonH * 0.5, Math.max(1.2, bowSize * 0.58));
    target.drawPolygon([
      cx + ribbonW * 0.5 - bowSize * 0.2, cy + ribbonH * 0.5 + bowSize * 0.6,
      cx + ribbonW * 0.5 - bowSize * 0.95, cy + ribbonH * 0.5 + bowSize * 1.75,
      cx + ribbonW * 0.5 - bowSize * 0.15, cy + ribbonH * 0.5 + bowSize * 1.2,
    ]);
    target.drawPolygon([
      cx + ribbonW * 0.5 + bowSize * 0.2, cy + ribbonH * 0.5 + bowSize * 0.6,
      cx + ribbonW * 0.5 + bowSize * 0.95, cy + ribbonH * 0.5 + bowSize * 1.75,
      cx + ribbonW * 0.5 + bowSize * 0.15, cy + ribbonH * 0.5 + bowSize * 1.2,
    ]);
    target.lineStyle(0, 0, 0);
  }

  _drawTextureCheckerboard(target: PIXI.Graphics, w: number, h: number, inset: number, alphaBase: number, phase: number, topSheenAlpha: number, highlightColor: number, radius: number, cfg: Record<string, any>) {
    const colorA = toPixiColor(cfg.checkerColorA ?? '#e2e8f0');
    const colorB = toPixiColor(cfg.checkerColorB ?? '#334155');
    const cellPx = Math.max(4, Math.round(Number(cfg.checkerCellPx ?? 10)));
    const usableW = Math.max(1, w - inset * 2);
    const usableH = Math.max(1, h - inset * 2);
    for (let y = 0; y < usableH; y += cellPx) {
      const row = Math.floor(y / cellPx);
      for (let x = 0; x < usableW; x += cellPx) {
        const col = Math.floor(x / cellPx);
        const fill = ((row + col + Math.floor(phase * 2)) % 2 === 0) ? colorA : colorB;
        target.beginFill(fill, alphaBase * 0.76);
        target.drawRect(
          inset + x,
          inset + y,
          Math.max(1, Math.min(cellPx, usableW - x)),
          Math.max(1, Math.min(cellPx, usableH - y))
        );
        target.endFill();
      }
    }
    if (topSheenAlpha > 0) {
      target.beginFill(highlightColor, alphaBase * topSheenAlpha);
      target.drawRoundedRect(inset, inset, Math.max(1, w - inset * 2), Math.max(1, h * 0.18), Math.max(0, radius * 0.45));
      target.endFill();
    }
    this._drawTextureLabelPatch(target, w, h, inset, alphaBase, cfg);
    this._drawTextureBandAndPlate(target, w, h, inset, alphaBase, cfg);
  }

  _drawTextureCardboardBlock(target: PIXI.Graphics, w: number, h: number, inset: number, alphaBase: number, idNum: number, cfg: Record<string, any>) {
    const speckleColor = toPixiColor(cfg.speckleColor ?? '#7a5b3d');
    const speckleAlpha = Math.max(0, Math.min(1, Number(cfg.speckleAlpha ?? 0.12)));
    const speckleCount = Math.max(0, Math.floor(Number(cfg.speckleCount ?? 12)));
    const tapeColor = cfg.tapeColor != null ? toPixiColor(cfg.tapeColor) : null;
    const tapeAlpha = Math.max(0, Math.min(1, Number(cfg.tapeAlpha ?? 0)));
    const tapeWidthRatio = Math.max(0.04, Math.min(0.45, Number(cfg.tapeWidthRatio ?? 0.16)));
    const tapeInset = Math.max(0, Number(cfg.tapeInsetPx ?? inset));
    const tapeOrientation = String(cfg.tapeOrientation ?? 'vertical').toLowerCase();
    const usableW = Math.max(1, w - inset * 2);
    const usableH = Math.max(1, h - inset * 2);
    let local = ((idNum || 1) * 1103515245) >>> 0;
    const rand = () => {
      local ^= (local << 13) >>> 0;
      local ^= local >>> 17;
      local ^= (local << 5) >>> 0;
      return (local >>> 0) / 0x100000000;
    };
    for (let i = 0; i < speckleCount; i += 1) {
      const px = inset + Math.floor(rand() * usableW);
      const py = inset + Math.floor(rand() * usableH);
      const sw = Math.max(1, Math.floor(1 + rand() * 2));
      const sh = Math.max(1, Math.floor(1 + rand() * 2));
      target.beginFill(speckleColor, alphaBase * (speckleAlpha * (0.6 + rand() * 0.7)));
      target.drawRect(px, py, sw, sh);
      target.endFill();
    }
    if (tapeColor !== null && tapeAlpha > 0) {
      const tapeX = tapeInset;
      const tapeY = tapeInset;
      const tapeW = Math.max(2, Math.round((w - tapeInset * 2) * tapeWidthRatio));
      const tapeH = Math.max(2, Math.round((h - tapeInset * 2) * tapeWidthRatio));
      const vx = Math.round((w - tapeW) * 0.5);
      const hy = Math.round((h - tapeH) * 0.5);
      target.beginFill(tapeColor, alphaBase * tapeAlpha);
      if (tapeOrientation === 'horizontal' || tapeOrientation === 'cross') {
        target.drawRect(tapeX, hy, Math.max(1, w - tapeInset * 2), tapeH);
      }
      if (tapeOrientation === 'vertical' || tapeOrientation === 'cross') {
        target.drawRect(vx, tapeY, tapeW, Math.max(1, h - tapeInset * 2));
      }
      target.endFill();
    }
    this._drawTextureLabelPatch(target, w, h, inset, alphaBase, cfg);
    this._drawTextureBandAndPlate(target, w, h, inset, alphaBase, cfg);
  }

  _drawTextureWoodPlanks(target: PIXI.Graphics, w: number, h: number, inset: number, alphaBase: number, phase: number, topSheenAlpha: number, highlightColor: number, radius: number, seamColor: number, seamWidth: number, plankCount: number, grainCount: number, nailRadius: number, cfg: Record<string, any>) {
    // Top sheen (optional; can create a strong two-tone look if too high).
    if (topSheenAlpha > 0) {
      target.beginFill(highlightColor, alphaBase * topSheenAlpha);
      target.drawRoundedRect(inset, inset, Math.max(1, w - inset * 2), Math.max(1, h * 0.2), Math.max(0, radius * 0.55));
      target.endFill();
    }

    // Horizontal plank seams.
    for (let i = 1; i < plankCount; i += 1) {
      const y = Math.round((h * i) / plankCount);
      target.beginFill(seamColor, alphaBase * 0.62);
      target.drawRect(inset, y - seamWidth / 2, Math.max(1, w - inset * 2), seamWidth);
      target.endFill();
    }

    // Light grain streaks.
    for (let i = 0; i < grainCount; i += 1) {
      const y = Math.round(inset + ((h - inset * 2) * ((i + phase) % grainCount)) / Math.max(1, grainCount));
      const streakW = Math.max(6, Math.round(w * (0.28 + ((i + phase) % 3) * 0.11)));
      const x = inset + ((i * 13 + Math.floor(phase * 17)) % Math.max(1, Math.floor(w - inset * 2 - streakW)));
      target.beginFill(highlightColor, alphaBase * 0.18);
      target.drawRect(x, y, streakW, 1);
      target.endFill();
    }

    // Small corner nails.
    const nailAlpha = alphaBase * 0.7;
    const nailOffsetX = Math.max(inset + nailRadius + 1, w * 0.13);
    const nailOffsetY = Math.max(inset + nailRadius + 1, h * 0.2);
    const nailYBottom = Math.max(nailOffsetY, h - nailOffsetY);
    target.beginFill(seamColor, nailAlpha);
    target.drawCircle(nailOffsetX, nailOffsetY, nailRadius);
    target.drawCircle(Math.max(nailOffsetX, w - nailOffsetX), nailOffsetY, nailRadius);
    target.drawCircle(nailOffsetX, nailYBottom, nailRadius);
    target.drawCircle(Math.max(nailOffsetX, w - nailOffsetX), nailYBottom, nailRadius);
    target.endFill();

    this._drawTextureLabelPatch(target, w, h, inset, alphaBase, cfg);
    this._drawTextureBandAndPlate(target, w, h, inset, alphaBase, cfg);
  }

  _drawBrickTextureOverlay(target: PIXI.Graphics, brick: any, shape: string, width: number, height: number, cornerRadius: number, fillAlpha: number = 1) {
    const cfg = this._resolveBrickTextureOverlayConfig(brick);
    if (!cfg || cfg.enable !== true) {
      return;
    }
    const isRectangular = ['rect', 'rounded_rect'].includes(shape);
    const isCircular = shape === 'circle';
    if (!isRectangular && !isCircular) {
      return;
    }
    const w = Math.max(1, Number(width) || 1);
    const h = Math.max(1, Number(height) || 1);
    if (w < 8 || h < 8) {
      return;
    }
    const pattern = String(cfg.pattern ?? 'wood_planks').toLowerCase();
    const idNum = Number(String(brick?.id ?? '').replace(/\D+/g, '')) || 0;
    const phase = (idNum % 7) / 7;
    const alphaBase = Math.max(0, Math.min(1, Number(cfg.alpha ?? 0.16))) * Math.max(0.25, Math.min(1, fillAlpha));
    const baseFillAlpha = Math.max(0, Math.min(1, Number(cfg.baseFillAlpha ?? 0)));
    const baseFillColor = toPixiColor(cfg.baseFillColor ?? '#8b6f4e');
    const seamColor = toPixiColor(cfg.seamColor ?? '#111827');
    const highlightColor = toPixiColor(cfg.highlightColor ?? '#f8fafc');
    const plankCount = Math.max(1, Math.min(5, Math.floor(Number(cfg.plankCount ?? 3))));
    const seamWidth = Math.max(1, Number(cfg.seamWidthPx ?? 1));
    const grainCount = Math.max(0, Math.floor(Number(cfg.grainCount ?? 5)));
    const nailRadius = Math.max(0.5, Number(cfg.nailRadiusPx ?? 1.2));
    const inset = Math.max(1, Number(cfg.insetPx ?? 3));
    const topSheenAlpha = Math.max(0, Math.min(1, Number(cfg.topSheenAlpha ?? 0.42)));
    const radius = Math.max(0, Math.min(Number(cornerRadius) || 0, w / 2, h / 2));

    if (baseFillAlpha > 0) {
      target.beginFill(baseFillColor, baseFillAlpha * Math.max(0.25, Math.min(1, fillAlpha)));
      this._drawBrickPrimitive(target, shape, w, h, radius);
      target.endFill();
    }

    if (pattern === 'pizza') {
      if (isCircular) {
        this._drawTexturePizza(target, w, h, inset, alphaBase, phase, idNum, cfg);
      }
      return;
    }

    if (pattern === 'gift_wrap') {
      if (isRectangular) {
        this._drawTextureGiftWrap(target, w, h, inset, alphaBase, seamColor, seamWidth, cfg);
      }
      return;
    }

    if (pattern === 'checkerboard') {
      if (isRectangular) {
        this._drawTextureCheckerboard(target, w, h, inset, alphaBase, phase, topSheenAlpha, highlightColor, radius, cfg);
      }
      return;
    }

    if (pattern === 'cardboard_block') {
      if (isRectangular) {
        this._drawTextureCardboardBlock(target, w, h, inset, alphaBase, idNum, cfg);
      }
      return;
    }

    if (isRectangular) {
      this._drawTextureWoodPlanks(target, w, h, inset, alphaBase, phase, topSheenAlpha, highlightColor, radius, seamColor, seamWidth, plankCount, grainCount, nailRadius, cfg);
    }
  }

  _drawBrickPrimitive(sprite: PIXI.Graphics, shape: string, width: number, height: number, cornerRadius: number) {
    const w = Math.max(1, Number(width) || 1);
    const h = Math.max(1, Number(height) || 1);
    const radius = Math.max(0, Math.min(Number(cornerRadius) || 0, w / 2, h / 2));
    const cx = w / 2;
    const cy = h / 2;
    if (shape === 'circle') {
      sprite.drawEllipse(cx, cy, w / 2, h / 2);
      return;
    }
    if (shape === 'diamond') {
      sprite.drawPolygon([cx, 0, w, cy, cx, h, 0, cy]);
      return;
    }
    if (shape === 'hexagon') {
      sprite.drawPolygon([w * 0.25, 0, w * 0.75, 0, w, cy, w * 0.75, h, w * 0.25, h, 0, cy]);
      return;
    }
    if (shape === 'rect') {
      sprite.drawRect(0, 0, w, h);
      return;
    }
    sprite.drawRoundedRect(0, 0, w, h, radius);
  }

  _buildBrickHitArea(shape: string, width: number, height: number) {
    const w = Math.max(1, Number(width) || 1);
    const h = Math.max(1, Number(height) || 1);
    if (shape === 'circle') {
      return new PIXI.Ellipse(w / 2, h / 2, w / 2, h / 2);
    }
    if (shape === 'diamond') {
      return new PIXI.Polygon([w / 2, 0, w, h / 2, w / 2, h, 0, h / 2]);
    }
    if (shape === 'hexagon') {
      return new PIXI.Polygon([w * 0.25, 0, w * 0.75, 0, w, h / 2, w * 0.75, h, w * 0.25, h, 0, h / 2]);
    }
    return new PIXI.Rectangle(0, 0, w, h);
  }

  _updateSpotlight(focusState: any) {
    if (!this._isSpotlightHitAreaEnabled()) {
      this._teardownSpotlightZone();
    }
    if (!focusState?.enabled || !focusState.activeBrickId) {
      if (this.spotlightGraphics) {
        this.spotlightGraphics.clear();
      }
      if (this.spotlightRing) {
        this.spotlightRing.clear();
      }
      if (this._isSpotlightHitAreaEnabled()) {
        this._teardownSpotlightZone();
      }
      this.spotlightRect = null;
      this._lastSpotlightSignature = '';
      return;
    }
    if (!this.spotlightGraphics) {
      this.spotlightGraphics = new PIXI.Graphics();
      this.spotlightGraphics.eventMode = 'none';
      this.spotlightLayer.addChild(this.spotlightGraphics);
    }
    if (!this.spotlightRing) {
      this.spotlightRing = new PIXI.Graphics();
      this.spotlightRing.eventMode = 'none';
      this.spotlightLayer.addChild(this.spotlightRing);
    }
    const sprite = this.brickSprites.get(focusState.activeBrickId);
    if (!sprite) {
      this.spotlightGraphics.clear();
      this.spotlightRing.clear();
      this.spotlightRect = null;
      return;
    }
    const spotlightCfg = this.config?.display?.spotlight || {};
    const pad = Math.max(0, Number(focusState.spotlightPadding ?? spotlightCfg.paddingPx ?? 18));
    const dimAlpha = Math.max(0, Math.min(0.95, Number(focusState.dimAlpha ?? spotlightCfg.dimAlpha ?? 0.45)));
    const baseCornerRadius = Math.max(0, Number(spotlightCfg.cornerRadiusPx ?? 10));
    const ringWidth = Math.max(1, Number(spotlightCfg.ringWidthPx ?? 3));
    const ringAlpha = Math.max(0, Math.min(1, Number(spotlightCfg.ringAlpha ?? 0.95)));
    const ringColor = toPixiColor(spotlightCfg.ringColor ?? '#f8fafc');
    const snapMode = this._resolveSpotlightSnapMode();
    const rawHoleX = sprite.x - pad;
    const rawHoleY = sprite.y - pad;
    const rawHoleW = sprite.brickWidth + pad * 2;
    const rawHoleH = sprite.brickHeight + pad * 2;
    const cornerRadiusRaw = Math.min(baseCornerRadius, rawHoleW / 2, rawHoleH / 2);
    const resolution = Math.max(1, Number(this.app?.renderer?.resolution ?? 1));
    const holeX = this._snapSpotlightGeometry(rawHoleX, snapMode);
    const holeY = this._snapSpotlightGeometry(rawHoleY, snapMode);
    const holeW = Math.max(1, this._snapSpotlightGeometry(rawHoleW, snapMode));
    const holeH = Math.max(1, this._snapSpotlightGeometry(rawHoleH, snapMode));
    const cornerRadius = Math.max(0, this._snapSpotlightGeometry(cornerRadiusRaw, snapMode));
    this.spotlightRect = { x: holeX, y: holeY, w: holeW, h: holeH };
    const canvasW = this.config.display.canvasWidth;
    const canvasH = this.config.display.canvasHeight;
    const signatureStepRaw = Number(spotlightCfg.signatureQuantizePx);
    const signatureStep = Number.isFinite(signatureStepRaw)
      ? Math.max(0.001, signatureStepRaw)
      : (snapMode === 'none' ? 0.01 : (1 / resolution));
    const signature = [
      this._quantizeSpotlightSignature(holeX, signatureStep),
      this._quantizeSpotlightSignature(holeY, signatureStep),
      this._quantizeSpotlightSignature(holeW, signatureStep),
      this._quantizeSpotlightSignature(holeH, signatureStep),
      this._quantizeSpotlightSignature(cornerRadius, signatureStep),
      Math.round(dimAlpha * 1000),
      Math.round(ringWidth * 1000),
      Math.round(ringAlpha * 1000),
      ringColor,
      canvasW,
      canvasH
    ].join('|');
    if (signature === this._lastSpotlightSignature) {
      return;
    }
    this._lastSpotlightSignature = signature;

    this.spotlightGraphics.clear();
    this.spotlightGraphics.beginFill(0x000000, dimAlpha);
    this.spotlightGraphics.drawRect(0, 0, canvasW, canvasH);
    if (typeof this.spotlightGraphics.beginHole === 'function' && typeof this.spotlightGraphics.endHole === 'function') {
      this.spotlightGraphics.beginHole();
      // Use native: true for the hole edge if snapping is none to avoid AA smearing
      if (snapMode === 'none') {
        this.spotlightGraphics.lineStyle({ width: 0, native: true });
      }
      this.spotlightGraphics.drawRoundedRect(holeX, holeY, holeW, holeH, cornerRadius);
      this.spotlightGraphics.endHole();
    } else {
      // Basic 4-rect fallback for environments without beginHole()
      this.spotlightGraphics.drawRect(0, 0, canvasW, Math.max(0, holeY));
      this.spotlightGraphics.drawRect(0, Math.max(0, holeY + holeH), canvasW, Math.max(0, canvasH - (holeY + holeH)));
      this.spotlightGraphics.drawRect(0, Math.max(0, holeY), Math.max(0, holeX), Math.max(0, holeH));
      this.spotlightGraphics.drawRect(
        Math.max(0, holeX + holeW),
        Math.max(0, holeY),
        Math.max(0, canvasW - (holeX + holeW)),
        Math.max(0, holeH)
      );
    }
    this.spotlightGraphics.endFill();

    this.spotlightRing.clear();
    this.spotlightRing.lineStyle(ringWidth, ringColor, ringAlpha);
    this.spotlightRing.drawRoundedRect(holeX, holeY, holeW, holeH, cornerRadius);
    this._ensureSpotlightZone(holeX, holeY, holeW, holeH, cornerRadius);
  }

  _updateHudPointsAdornment(lines: any[], text: any, uiCfg: Record<string, any>, clearCfg: Record<string, any> | null = null, layout: Record<string, any> | null = null) {
    const resolvedClearCfg = clearCfg || this._resolveClearAnimationConfig();
    const showPoints = uiCfg?.showPoints === true;
    const shouldShow = resolvedClearCfg.enable && showPoints && resolvedClearCfg.coin.enable && resolvedClearCfg.coin.showInHud;
    if (!shouldShow) {
      if (this.hudPointsAdornment) {
        this.hudPointsAdornment.visible = false;
      }
      this._lastHudPointsAdornmentSignature = '';
      return;
    }

    const lineIndex = Array.isArray(lines)
      ? lines.findIndex((line) => typeof line === 'string' && (line.includes('Points:') || line.includes('Coins:')))
      : -1;
    if (lineIndex < 0) {
      if (this.hudPointsAdornment) {
        this.hudPointsAdornment.visible = false;
      }
      this._lastHudPointsAdornmentSignature = '';
      return;
    }

    if (!this.hudPointsAdornment) {
      this.hudPointsAdornment = new PIXI.Graphics();
      this.hudLayer.addChild(this.hudPointsAdornment);
    }
    const coinSize = Number.isFinite(Number(layout?.coinSize))
      ? Math.max(6, Number(layout!.coinSize))
      : this._resolveHudCoinSize(text, uiCfg, resolvedClearCfg);
    const coinGap = Number.isFinite(Number(layout?.coinGap))
      ? Math.max(0, Number(layout!.coinGap))
      : Math.max(4, Number(resolvedClearCfg.coin.gapPx ?? 5));
    const pointsLineWidthMeasured = Number.isFinite(Number(layout?.pointsLineWidth))
      ? Math.max(0, Number(layout!.pointsLineWidth))
      : 0;
    const pointsLineWidth = pointsLineWidthMeasured > 0 ? pointsLineWidthMeasured : Number(text.width);
    const panelEnabled = uiCfg.hudPanel !== false;
    const lineHeight = Math.max(8, Number(uiCfg.hudLineHeight ?? 22));
    const x = panelEnabled
      ? (Number(text.x) + pointsLineWidth + coinGap + coinSize * 0.5)
      : (Number(text.x) + pointsLineWidth + coinGap + coinSize * 0.5);
    const y = Number(text.y) + lineIndex * lineHeight + lineHeight * 0.5;
    const signature = [
      Math.round(x * 100) / 100,
      Math.round(y * 100) / 100,
      Math.round(coinSize * 100) / 100,
      Math.round(coinGap * 100) / 100,
      Math.round(pointsLineWidth * 100) / 100,
      String(resolvedClearCfg.coin.rimColor),
      String(resolvedClearCfg.coin.bodyColor),
      String(resolvedClearCfg.coin.shineColor),
      String(resolvedClearCfg.coin.shadowColor),
      String(resolvedClearCfg.coin.symbolColor),
      Number(resolvedClearCfg.coin.ridgeCount),
      lineIndex,
      panelEnabled ? 1 : 0
    ].join('|');
    if (signature === this._lastHudPointsAdornmentSignature) {
      this.hudPointsAdornment.visible = true;
      return;
    }
    this._lastHudPointsAdornmentSignature = signature;
    this.hudPointsAdornment.clear();
    this._drawCoinPrimitive(this.hudPointsAdornment, coinSize, resolvedClearCfg.coin, this.seed ^ 0x41d29be5);
    this.hudPointsAdornment.x = this.pixelSnapBricks ? Math.round(x) : x;
    this.hudPointsAdornment.y = this.pixelSnapBricks ? Math.round(y) : y;
    this.hudPointsAdornment.alpha = 0.96;
    this.hudPointsAdornment.visible = true;
  }

  updateHUD(stats: any, remainingMs: any, blockInfo: any) {
    const text = this.hudElements.status;
    if (!text) {
      return;
    }
    const uiCfg = this.config?.display?.ui ?? this.config?.ui ?? {};
    const clearCfg = this._resolveClearAnimationConfig();
    const useCoinsLabel = clearCfg.enable && clearCfg.coin.enable;
    const hudUiConfig = useCoinsLabel
      ? { ...uiCfg, pointsLabel: 'Coins' }
      : uiCfg;
    const lines = buildHUDLines({
      stats,
      remainingMs,
      blockLabel: blockInfo?.label,
      drtStats: blockInfo?.drtStats,
      focusInfo: blockInfo?.focusInfo,
      uiConfig: hudUiConfig,
      drtEnabled: Boolean(blockInfo?.drtEnabled),
      roundsRemaining: blockInfo?.roundsRemaining,
    });
    const nextText = lines.join('\n');
    if (nextText !== this._lastHudText) {
      text.text = nextText;
      this._lastHudText = nextText;
    }

    const pointsLineIndex = lines.findIndex((line) => typeof line === 'string' && (line.includes('Points:') || line.includes('Coins:')));
    const showHudCoin = clearCfg.enable && uiCfg.showPoints === true && clearCfg.coin.enable && clearCfg.coin.showInHud && pointsLineIndex >= 0;
    const coinSize = this._resolveHudCoinSize(text, uiCfg, clearCfg);
    const coinGap = Math.max(4, Number(clearCfg.coin.gapPx ?? 5));
    const pointsLineText = pointsLineIndex >= 0 ? String(lines[pointsLineIndex] ?? '') : '';
    let pointsLineWidth = 0;
    if (showHudCoin && pointsLineText) {
      try {
        pointsLineWidth = Number(PIXI.TextMetrics.measureText(pointsLineText, text.style).width) || 0;
      } catch (_) {
        pointsLineWidth = 0;
      }
    }
    const coinExtendedLineWidth = showHudCoin ? (Math.max(0, pointsLineWidth) + coinGap + coinSize) : 0;
    if (this.hudBackground) {
      const padX = Math.max(2, Number(uiCfg.hudPanelPaddingX ?? 10));
      const padY = Math.max(2, Number(uiCfg.hudPanelPaddingY ?? 8));
      const bgAlpha = Math.max(0, Math.min(1, Number(uiCfg.hudPanelAlpha ?? 0.42)));
      const bgColor = toPixiColor(uiCfg.hudPanelColor ?? '#0f172a');
      const radius = Math.max(0, Number(uiCfg.hudPanelRadius ?? 8));
      const contentW = showHudCoin ? Math.max(Number(text.width) || 0, coinExtendedLineWidth) : (Number(text.width) || 0);
      const panelW = Math.max(8, contentW + padX * 2);
      const panelH = Math.max(8, text.height + padY * 2);
      const panelSignature = `${padX}|${padY}|${bgAlpha}|${bgColor}|${radius}|${panelW}|${panelH}|${contentW}|${coinExtendedLineWidth}`;
      if (panelSignature !== this._lastHudPanelSignature) {
        this.hudBackground.clear();
        this.hudBackground.beginFill(bgColor, bgAlpha);
        this.hudBackground.drawRoundedRect(-padX, -padY, panelW, panelH, radius);
        this.hudBackground.endFill();
        this._lastHudPanelSignature = panelSignature;
      }
    }
    this._updateHudPointsAdornment(lines, text, uiCfg, clearCfg, {
      pointsLineWidth,
      coinGap,
      coinSize
    });
  }

  /**
   * Shows or hides the visual DRT indicator.
   */
  toggleVisualDRT(show: any, config: any) {
    if (!config) {
      return;
    }
    if (!this.drtGraphics) {
      this.drtGraphics = new PIXI.Graphics();
      this.drtLayer.addChild(this.drtGraphics);
    }
    this.drtGraphics.clear();
    if (show) {
      const { shape, color, size_px, x, y } = config;
      const tint = toPixiColor(color || '#ffffff');
      this.drtGraphics.beginFill(tint, 0.9);
      if (shape === 'circle') {
        this.drtGraphics.drawCircle(x, y, size_px / 2);
      } else {
        this.drtGraphics.drawRoundedRect(x - size_px / 2, y - size_px / 2, size_px, size_px, size_px * 0.2);
      }
      this.drtGraphics.endFill();
    }
  }

  async _prepareBackgroundTexture() {
    try {
      const texCfg = this.config?.display?.backgroundTexture || {};
      if (!texCfg.enable) {
        this.backgroundTexture = null;
        this.backgroundTextureOwned = false;
        return;
      }
      const renderMode = String(texCfg.renderMode ?? 'image').toLowerCase();
      if (renderMode === 'procedural_warehouse') {
        const styleCfg = this._resolveWarehouseProceduralStyleConfig(texCfg);
        const key = makeMaterialKey(
          'background:procedural_warehouse',
          styleCfg,
          (this.seed ^ 0x1f123bb5) >>> 0
        );
        this.backgroundTexture = getOrCreateProceduralTexture(this.app?.renderer, key, () =>
          this._buildProceduralWarehouseTexture(styleCfg)
        );
        this.backgroundTextureOwned = false;
        return;
      }
      const src = texCfg.src || 'assets/warehouse-tile.svg';
      this.backgroundTexture = await loadCachedImageTexture(src);
      this.backgroundTextureOwned = false;
    } catch (error) {
      console.warn('Failed to load background texture; using backgroundColor only.', error);
      this.backgroundTexture = null;
      this.backgroundTextureOwned = false;
    }
  }

  _drawBackground() {
    if (!this.backgroundLayer) {
      return;
    }
    this.backgroundLayer.removeChildren();
    this.backgroundVisual = null;
    const texCfg = this.config?.display?.backgroundTexture || {};
    const useTexture = Boolean(texCfg.enable && this.backgroundTexture);
    if (!useTexture) {
      return;
    }
    const width = this.config.display.canvasWidth;
    const height = this.config.display.canvasHeight;
    let sprite;
    try {
      sprite = new (PIXI.TilingSprite as any)({ texture: this.backgroundTexture, width, height });
    } catch (_) {
      sprite = new PIXI.TilingSprite(this.backgroundTexture!, width, height);
    }
    const alpha = Number(texCfg.alpha ?? 1);
    const scaleX = Number(texCfg.scaleX ?? texCfg.scale ?? 1);
    const scaleY = Number(texCfg.scaleY ?? texCfg.scale ?? 1);
    sprite.alpha = Number.isFinite(alpha) ? Math.max(0, Math.min(1, alpha)) : 1;
    if (texCfg.tint) {
      sprite.tint = toPixiColor(texCfg.tint);
    }
    try {
      sprite.tileScale.set(scaleX, scaleY);
      sprite.tilePosition.set(0, 0);
    } catch (_) {
      // ignore API differences across Pixi versions
    }
    this.backgroundLayer.addChild(sprite);
    this.backgroundVisual = sprite;
  }

  destroy() {
    this.conveyorHoldStart.clear();
    this.conveyorHovered.clear();
    this.conveyorHoverTarget.clear();
    this.conveyorPointerPos.clear();
    this._teardownSpotlightZone();
    this.bricksByConveyor.clear();
    this.conveyorZones.clear();
    this._clearBrickHoverState();
    this.brickHoldStart.clear();
    this.brickSprites.forEach((sprite: any) => sprite.destroy());
    this.brickSprites.clear();
    this.effectVisuals.forEach((effect: any) => effect?.node?.destroy?.());
    this.effectVisuals = [];
    this.dueMarkerAnchors.clear();
    this.furnaceVisuals.clear();
    if (this.app) {
      // Do not destroy textures from the global Assets cache here.
      // Destroying cached BaseTextures breaks subsequent trial loads; if cleanup is
      // needed, use PIXI.Assets.unload() on specific asset keys instead.
      this.app.destroy(true, { children: true, texture: false, baseTexture: false });
      const view = (this.app as any).canvas || (this.app as any).view;
      if (this.root && view && (view as any).parentNode === this.root) {
        this.root.removeChild(view as Node);
      }
    }
    if (this._teardownCanvasPointerTracking) {
      this._teardownCanvasPointerTracking();
      this._teardownCanvasPointerTracking = null;
    }
    if (this.backgroundTextureOwned && this.backgroundTexture?.destroy) {
      this.backgroundTexture.destroy(true);
    }
    if (this.beltTextureOwned && this.beltTexture?.destroy) {
      this.beltTexture.destroy(true);
    }
    this.app = null;
    this.backgroundVisual = null;
    this.backgroundTexture = null;
    this.backgroundTextureOwned = false;
    this.beltTexture = null;
    this.beltTextureOwned = false;
    this.hudPointsAdornment = null;
    this._lastHudPointsAdornmentSignature = '';
    this.canvasView = null;
    this.pointerInCanvas = false;
    this.pointerCanvasPos = { x: null, y: null };
    this.spotlightRect = null;
  }

  getPerformanceSnapshot() {
    return {
      ...this.perfStats,
      activeEffects: this.effectVisuals.length,
      activeBrickSprites: this.brickSprites.size
    };
  }
}
