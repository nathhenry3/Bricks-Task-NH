import { isAutoResponderEnabled, sampleAutoContinueDelayMs, sampleAutoResponse } from "../runtime/autoresponder";
import { asObject, asString } from "../utils/coerce";
import type { CoreConfig, JSONObject } from "../api/types";
import { normalizeKey as normalizeKeyBase } from "../infrastructure/keys";
import { getElementBySafeId } from "./domUtils";

export interface TimedResponse {
  key: string | null;
  rtMs: number | null;
}

export interface CaptureTimedResponseArgs {
  allowedKeys: string[];
  totalDurationMs: number;
  startMs?: number;
  endMs?: number;
}

export interface ContinuePromptOptions {
  buttonId?: string;
  buttonLabel?: string;
  buttonStyle?: ButtonStyleOverrides;
  autoFocusButton?: boolean;
  cardWidth?: string;
  cardMinHeight?: string;
  cardBackground?: string;
  cardBorder?: string;
  cardBorderRadius?: string;
  cardColor?: string;
  cardFontSize?: string;
  cardFontFamily?: string;
  /** When true, card uses auto sizing (no fixed width/min-height) to wrap html content naturally. */
  htmlContent?: boolean;
}

export interface ContinueChoiceOption {
  id: string;
  label: string;
  action: "continue" | "exit";
}

export interface ContinueChoicePromptOptions {
  buttons: ContinueChoiceOption[];
  buttonStyle?: ButtonStyleOverrides;
  autoFocusFirstButton?: boolean;
  cardWidth?: string;
  cardMinHeight?: string;
  cardBackground?: string;
  cardBorder?: string;
  cardBorderRadius?: string;
  cardColor?: string;
  cardFontSize?: string;
  cardFontFamily?: string;
  /** When true, card uses auto sizing (no fixed width/min-height) to wrap html content naturally. */
  htmlContent?: boolean;
}

export interface ButtonStyleOverrides {
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
  textTransform?: string;
}

export interface CenteredNoticeOptions {
  title: string;
  message?: string;
}

export interface FixedTrialFrameOptions {
  aperturePx: number;
  innerHtml?: string;
  cueHtml?: string | null;
  paddingYPx?: number;
  cueHeightPx?: number;
  cueMarginBottomPx?: number;
  canvasBackground?: string;
  canvasBorder?: string;
}

export interface CenteredMessageFrameOptions extends FixedTrialFrameOptions {
  message: string;
  messageColor?: string;
  fontSizePx?: number;
  fontWeight?: number;
}

export interface CanvasFrameLayoutOptions {
  aperturePx: number;
  paddingYPx?: number;
  cueHeightPx?: number;
  cueMarginBottomPx?: number;
}

export interface CanvasFrameLayout {
  aperturePx: number;
  paddingYPx: number;
  cueHeightPx: number;
  cueMarginBottomPx: number;
  frameTopPx: number;
  totalHeightPx: number;
}

export interface CanvasFrameDrawOptions {
  cueText?: string;
  cueColor?: string;
  frameBackground?: string;
  frameBorder?: string;
}

export interface CanvasFrameContentContext {
  ctx: CanvasRenderingContext2D;
  layout: CanvasFrameLayout;
  centerX: number;
  centerY: number;
  frameLeft: number;
  frameTop: number;
  frameSize: number;
}

export interface MountCanvasElementArgs {
  container: HTMLElement;
  width: number;
  height: number;
  wrapperClassName?: string;
  canvasClassName?: string;
}

export interface MountedCanvasElement {
  wrapper: HTMLDivElement;
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
}

export interface CanvasCenteredMessageOptions extends CanvasFrameDrawOptions {
  message: string;
  messageColor?: string;
  fontSizePx?: number;
  fontWeight?: number;
}

export interface CanvasHostHandle {
  stageShell: HTMLElement;
  container: HTMLElement;
  updateScale: () => void;
  dispose: () => void;
}

export interface CreateScaledCanvasHostArgs {
  displayElement: HTMLElement;
  canvasWidth: number;
  canvasHeight: number;
  viewportPaddingPx?: number;
}

/**
 * Manages browser environment state (cursor visibility, scroll blocking, key blocking)
 * during task execution. Provides a single cleanup() method for the terminate handler,
 * eliminating the need for scattered module-level mutable disposer variables.
 */
export class TaskEnvironmentGuard {
  private disposers: Array<() => void> = [];

  /** Install a key scroll blocker for the given response keys. */
  installKeyScrollBlocker(allowedKeys: string[]): void {
    const remove = installKeyScrollBlocker(allowedKeys);
    this.disposers.push(remove);
  }

  /** Lock page scrolling (overflow: hidden on html/body). */
  installPageScrollLock(): void {
    const remove = lockPageScroll();
    this.disposers.push(remove);
  }

  /** Register an arbitrary cleanup function to run on cleanup(). */
  addDisposer(fn: () => void): void {
    this.disposers.push(fn);
  }

  /** Restore cursor, remove all scroll/key blockers, and run any registered disposers. */
  cleanup(): void {
    setCursorHidden(false);
    for (const dispose of this.disposers) {
      try { dispose(); } catch { /* ignore */ }
    }
    this.disposers = [];
  }
}

export function resolvePageBackground(args: {
  coreConfig?: CoreConfig | null;
  taskConfig?: JSONObject | null;
}): string | null {
  const taskUi = asObject(asObject(args.taskConfig)?.ui);
  const coreUi = asObject(asObject(args.coreConfig as unknown)?.ui);
  return asString(taskUi?.pageBackground) ?? asString(coreUi?.pageBackground) ?? null;
}

const CANVAS_CENTER_STYLE_ID = "exp-jspsych-canvas-center-style";
const CURSOR_HIDDEN_STYLE_ID = "exp-jspsych-cursor-hidden-style";
const CURSOR_HIDDEN_CLASS = "exp-jspsych-cursor-hidden";

function ensureCursorHiddenStyles(): void {
  if (document.getElementById(CURSOR_HIDDEN_STYLE_ID)) return;
  const style = document.createElement("style");
  style.id = CURSOR_HIDDEN_STYLE_ID;
  style.textContent = `
    .${CURSOR_HIDDEN_CLASS},
    .${CURSOR_HIDDEN_CLASS} * {
      cursor: none !important;
    }
  `;
  document.head.appendChild(style);
}

export function setCursorHidden(hidden: boolean): void {
  ensureCursorHiddenStyles();
  document.documentElement.classList.toggle(CURSOR_HIDDEN_CLASS, hidden);
}

/**
 * Determines whether the cursor should be hidden during a given jsPsych trial phase.
 * Common phases like fixation, blank, stimulus, response, and feedback hide the cursor
 * so participants aren't distracted. Instruction and continue screens should NOT hide
 * the cursor (they need button clicks), and this function returns false for any phase
 * not in the explicit list.
 */
export function shouldHideCursorForPhase(phase: unknown): boolean {
  if (typeof phase !== "string") return false;
  return /(fixation|blank|stimulus|response|feedback)/.test(phase.toLowerCase());
}

/** Computes percentage accuracy (0-100) with one decimal place. */
export function computeAccuracy(correct: number, total: number): number {
  if (total <= 0) return 0;
  return Math.round((correct / total) * 1000) / 10;
}

/**
 * Extract and normalize the response key and RT from a jsPsych trial data object.
 * Used by jsPsych-based RT tasks (SFT, Stroop, NBack) to standardize response extraction.
 */
export function extractJsPsychTrialResponse(data: Record<string, unknown>): { key: string | null; rtMs: number | null } {
  const rawKey = data.response;
  const rawRt = data.rt;
  const key = typeof rawKey === "string" ? normalizeKey(rawKey) : null;
  const rtMs = typeof rawRt === "number" && Number.isFinite(rawRt) ? rawRt : null;
  return { key, rtMs };
}

export function normalizeKey(key: string): string {
  return normalizeKeyBase(key);
}

export function toJsPsychKey(key: string): string {
  const normalized = normalizeKey(key);
  if (normalized === "space") return " ";
  return normalized;
}

export function toJsPsychChoices(keys: string[]): string[] {
  const output: string[] = [];
  const seen = new Set<string>();
  for (const key of keys ?? []) {
    const mapped = toJsPsychKey(key);
    if (!mapped || seen.has(mapped)) continue;
    seen.add(mapped);
    output.push(mapped);
  }
  return output;
}

function isEditableKeyTarget(target: EventTarget | null): boolean {
  if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement) return true;
  if (target instanceof HTMLElement && target.isContentEditable) return true;
  return false;
}

export function installKeyScrollBlocker(allowedKeys: string[]): () => void {
  const blocked = new Set((allowedKeys ?? []).map((key) => normalizeKey(key)).filter(Boolean));
  if (blocked.size === 0) return () => {};
  const onKeyDown = (ev: KeyboardEvent) => {
    if (isEditableKeyTarget(ev.target)) return;
    const key = normalizeKey(ev.key);
    if (!blocked.has(key)) return;
    ev.preventDefault();
  };
  window.addEventListener("keydown", onKeyDown, { capture: true });
  return () => {
    window.removeEventListener("keydown", onKeyDown, { capture: true });
  };
}

/**
 * Prevent browser scrolling keys during active task runs.
 * This applies task-agnostically so keys like space can be used as responses
 * without moving the page.
 */
export function installGlobalScrollBlocker(
  blockedKeys: string[] = ["space", "arrowup", "arrowdown", "arrowleft", "arrowright", "pageup", "pagedown", "home", "end"],
): () => void {
  const blocked = new Set((blockedKeys ?? []).map((key) => normalizeKey(key)).filter(Boolean));
  if (blocked.size === 0) return () => {};
  const onKeyDown = (ev: KeyboardEvent) => {
    if (isEditableKeyTarget(ev.target)) return;
    const key = normalizeKey(ev.key);
    if (!blocked.has(key)) return;
    ev.preventDefault();
  };
  window.addEventListener("keydown", onKeyDown, { capture: true });
  return () => {
    window.removeEventListener("keydown", onKeyDown, { capture: true });
  };
}

/**
 * Lock page scrolling during active task execution.
 * Returns a disposer that restores prior overflow styles.
 */
export function lockPageScroll(): () => void {
  const docEl = document.documentElement;
  const body = document.body;
  if (!docEl || !body) return () => {};
  const prevDocOverflow = docEl.style.overflow;
  const prevBodyOverflow = body.style.overflow;
  docEl.style.overflow = "hidden";
  body.style.overflow = "hidden";
  return () => {
    docEl.style.overflow = prevDocOverflow;
    body.style.overflow = prevBodyOverflow;
  };
}

export function installFullscreenOnFirstInteraction(container: HTMLElement): () => void {
  let isActive = true;
  let requestInFlight = false;
  let attempts = 0;
  const maxAttempts = 3;
  let pendingContinueButton: HTMLButtonElement | null = null;

  const captureContinueButton = (target: EventTarget | null): void => {
    if (!(target instanceof Element)) {
      pendingContinueButton = null;
      return;
    }
    const button = target.closest("button.exp-continue-btn");
    pendingContinueButton = button instanceof HTMLButtonElement ? button : null;
  };

  const replayPendingContinueButtonClick = (): void => {
    const button = pendingContinueButton;
    pendingContinueButton = null;
    if (!(button instanceof HTMLButtonElement)) return;
    // If the original click already fired, the button/screen is usually removed.
    if (!button.isConnected) return;
    button.click();
  };

  const dispatchFullscreenResize = () => {
    // Some embedded/kiosk browsers do not emit a reliable resize on fullscreen
    // transitions; force a reflow signal so canvas hosts can recenter.
    window.requestAnimationFrame(() => window.dispatchEvent(new Event("resize")));
    window.setTimeout(() => window.dispatchEvent(new Event("resize")), 50);
  };

  const request = async () => {
    if (!isActive || requestInFlight) return;
    if (attempts >= maxAttempts) {
      cleanup();
      return;
    }
    if (document.fullscreenElement) {
      cleanup();
      return;
    }
    requestInFlight = true;
    attempts += 1;
    try {
      const target = document.documentElement;
      await target.requestFullscreen();
    } catch {
      // Ignore browser/user denial; experiment continues without fullscreen.
    } finally {
      requestInFlight = false;
      if (document.fullscreenElement) {
        dispatchFullscreenResize();
        replayPendingContinueButtonClick();
        cleanup();
      }
    }
  };

  const onPointer = (event: PointerEvent) => {
    captureContinueButton(event.target);
    void request();
  };
  const onKey = () => {
    pendingContinueButton = null;
    void request();
  };
  const onFullscreenChange = () => {
    const isFullscreenActive = !!document.fullscreenElement;
    dispatchFullscreenResize();
    if (isFullscreenActive) {
      replayPendingContinueButtonClick();
      cleanup();
    }
  };

  const cleanup = () => {
    if (!isActive) return;
    isActive = false;
    window.removeEventListener("pointerdown", onPointer, true);
    window.removeEventListener("keydown", onKey, true);
    document.removeEventListener("fullscreenchange", onFullscreenChange, true);
  };

  window.addEventListener("pointerdown", onPointer, true);
  window.addEventListener("keydown", onKey, true);
  document.addEventListener("fullscreenchange", onFullscreenChange, true);
  return () => {
    dispatchFullscreenResize();
    cleanup();
  };
}

export function escapeHtml(value: string): string {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, Math.max(0, ms)));
}

export function resolveButtonStyleOverrides(raw: unknown): ButtonStyleOverrides | undefined {
  const node = asObject(raw);
  if (!node) return undefined;
  const style: ButtonStyleOverrides = {};
  const assignString = (target: keyof ButtonStyleOverrides, ...keys: string[]) => {
    for (const key of keys) {
      const value = asString((node as Record<string, unknown>)[key]);
      if (value && value.trim().length > 0) {
        (style as Record<string, unknown>)[target] = value.trim();
        return;
      }
    }
  };
  assignString("padding", "padding");
  assignString("fontSize", "fontSize", "font_size");
  assignString("border", "border");
  assignString("borderRadius", "borderRadius", "border_radius");
  assignString("color", "color");
  assignString("background", "background");
  assignString("minWidth", "minWidth", "min_width");
  assignString("minHeight", "minHeight", "min_height");
  assignString("outline", "outline");
  assignString("boxShadow", "boxShadow", "box_shadow");
  assignString("textTransform", "textTransform", "text_transform");
  const fontWeightRaw = (node as Record<string, unknown>).fontWeight ?? (node as Record<string, unknown>).font_weight;
  if (typeof fontWeightRaw === "string" || typeof fontWeightRaw === "number") {
    style.fontWeight = fontWeightRaw;
  }
  return Object.keys(style).length > 0 ? style : undefined;
}

export function applyButtonStyleOverrides(button: HTMLButtonElement, style: ButtonStyleOverrides | undefined): void {
  if (!style) return;
  if (style.padding !== undefined) button.style.padding = style.padding;
  if (style.fontSize !== undefined) button.style.fontSize = style.fontSize;
  if (style.fontWeight !== undefined) button.style.fontWeight = String(style.fontWeight);
  if (style.border !== undefined) button.style.border = style.border;
  if (style.borderRadius !== undefined) button.style.borderRadius = style.borderRadius;
  if (style.color !== undefined) button.style.color = style.color;
  if (style.background !== undefined) button.style.background = style.background;
  if (style.minWidth !== undefined) button.style.minWidth = style.minWidth;
  if (style.minHeight !== undefined) button.style.minHeight = style.minHeight;
  if (style.outline !== undefined) button.style.outline = style.outline;
  if (style.boxShadow !== undefined) button.style.boxShadow = style.boxShadow;
  if (style.textTransform !== undefined) button.style.textTransform = style.textTransform;
}


const DEFAULT_CONTINUE_KEYS = ["space", "enter", "arrowright"];

function isContinueActivationKey(key: string): boolean {
  return DEFAULT_CONTINUE_KEYS.includes(normalizeKey(key));
}

function buildContinueScreenHtml(
  contentHtml: string,
  actionsHtml: string,
  options: { cardWidth?: string; cardMinHeight?: string; cardBackground?: string; cardBorder?: string; cardBorderRadius?: string; cardColor?: string; cardFontSize?: string; cardFontFamily?: string; htmlContent?: boolean },
): string {
  if (options.htmlContent) {
    const screenStyle = "width:100%;padding:24px;box-sizing:border-box;display:flex;flex-direction:column;align-items:center;text-align:center;";
    return `<div class="exp-continue-screen" style="${screenStyle}"><div class="exp-continue-body" style="display:flex;flex-direction:column;align-items:center;"><div class="exp-continue-content">${contentHtml}</div><p class="exp-continue-actions" style="margin-top:1.5rem;margin-bottom:0;">${actionsHtml}</p></div></div>`;
  }
  const width = options.cardWidth ?? "860px";
  const minHeight = options.cardMinHeight ?? "420px";
  const bgOverride = options.cardBackground ? `background:${options.cardBackground};` : "";
  const borderOverride = options.cardBorder ? `border:${options.cardBorder};` : "";
  const radiusOverride = options.cardBorderRadius ? `border-radius:${options.cardBorderRadius};` : "";
  const colorOverride = options.cardColor ? `color:${options.cardColor};` : "";
  const fontSizeOverride = options.cardFontSize ? `font-size:${options.cardFontSize};` : "";
  const fontFamilyOverride = options.cardFontFamily ? `font-family:${options.cardFontFamily};` : "";
  const cardStyle = `width:${width};max-width:calc(100% - 48px);min-height:${minHeight};padding:24px 32px;display:flex;flex-direction:column;${bgOverride}${borderOverride}${radiusOverride}${colorOverride}${fontSizeOverride}${fontFamilyOverride}`;
  const screenStyle = "width:100%;min-height:70vh;display:flex;align-items:center;justify-content:center;text-align:center;";
  return `<div class="exp-continue-screen" style="${screenStyle}"><div class="exp-continue-body card" style="${cardStyle}"><div class="exp-continue-content" style="white-space:pre-line;flex:1;">${contentHtml}</div><p class="exp-continue-actions" style="margin-top:auto;padding-top:1.5rem;margin-bottom:0;">${actionsHtml}</p></div></div>`;
}

export async function waitForContinue(
  container: HTMLElement,
  html: string,
  options: ContinuePromptOptions = {},
): Promise<void> {
  const buttonId = options.buttonId ?? "exp-continue-btn";
  const buttonLabel = options.buttonLabel ?? "Continue";
  const autoResponderEnabled = isAutoResponderEnabled();
  const buttonHtml = `<button id="${buttonId}" class="exp-continue-btn" type="button">${escapeHtml(buttonLabel)}</button>`;
  container.innerHTML = buildContinueScreenHtml(html, buttonHtml, options);
  const btn = getElementBySafeId(container, buttonId);
  if (!(btn instanceof HTMLButtonElement)) return;
  applyButtonStyleOverrides(btn, options.buttonStyle);
  const clearScreen = () => {
    container.innerHTML = "";
  };

  let onKeyRef: ((ev: KeyboardEvent) => void) | null = null;
  let onClickRef: (() => void) | null = null;

  const cleanup = () => {
    if (onClickRef) btn.removeEventListener("click", onClickRef);
    if (onKeyRef) window.removeEventListener("keydown", onKeyRef);
  };

  await new Promise<void>((resolve) => {
    onKeyRef = (ev: KeyboardEvent) => {
      if (!isContinueActivationKey(ev.key)) return;
      if (!isEditableKeyTarget(ev.target)) ev.preventDefault();
      cleanup();
      resolve();
    };

    onClickRef = () => {
      cleanup();
      resolve();
    };

    if (autoResponderEnabled) {
      void (async () => {
        const delayMs = sampleAutoContinueDelayMs() ?? 0;
        await sleep(delayMs);
        cleanup();
        if (buttonId.includes("complete")) {
          btn.disabled = true;
          btn.style.opacity = "0.5";
        }
        resolve();
      })();
    }

    btn.addEventListener("click", onClickRef);
    window.addEventListener("keydown", onKeyRef);
    if (options.autoFocusButton !== false) {
      btn.focus();
    }
  });

  if (!buttonId.includes("complete")) {
    clearScreen();
  }
}

export async function waitForContinueChoice(
  container: HTMLElement,
  html: string,
  options: ContinueChoicePromptOptions,
): Promise<ContinueChoiceOption> {
  const buttons = options.buttons ?? [];
  if (buttons.length === 0) {
    return { id: "continue", label: "Continue", action: "continue" };
  }
  const buttonsHtml = buttons
    .map(
      (button) =>
        `<button id="${escapeHtml(button.id)}" class="exp-continue-btn" type="button" data-action="${escapeHtml(button.action)}">${escapeHtml(button.label)}</button>`,
    )
    .join(" ");
  container.innerHTML = buildContinueScreenHtml(html, buttonsHtml, options);
  for (const button of buttons) {
    const node = getElementBySafeId(container, button.id);
    if (node instanceof HTMLButtonElement) {
      applyButtonStyleOverrides(node, options.buttonStyle);
    }
  }

  if (isAutoResponderEnabled()) {
    const preferred = buttons.find((b) => b.action === "continue") ?? buttons[0];
    const delayMs = sampleAutoContinueDelayMs() ?? 0;
    await sleep(delayMs);
    container.innerHTML = "";
    return preferred;
  }

  return await new Promise<ContinueChoiceOption>((resolve) => {
    const clearScreen = () => {
      container.innerHTML = "";
    };
    const cleanup = () => {
      window.removeEventListener("keydown", onKey);
      for (const button of buttons) {
        const node = getElementBySafeId(container, button.id);
        if (node instanceof HTMLButtonElement) {
          node.removeEventListener("click", onClick);
        }
      }
    };
    const submit = (selected: ContinueChoiceOption) => {
      cleanup();
      clearScreen();
      resolve(selected);
    };
    const onClick = (event: Event) => {
      const target = event.currentTarget;
      if (!(target instanceof HTMLButtonElement)) return;
      const selected = buttons.find((b) => b.id === target.id);
      if (!selected) return;
      submit(selected);
    };
    const onKey = (event: KeyboardEvent) => {
      if (!isContinueActivationKey(event.key)) return;
      if (!isEditableKeyTarget(event.target)) event.preventDefault();
      const preferred = buttons.find((b) => b.action === "continue") ?? buttons[0];
      submit(preferred);
    };

    for (const button of buttons) {
      const node = getElementBySafeId(container, button.id);
      if (node instanceof HTMLButtonElement) {
        node.addEventListener("click", onClick);
      }
    }
    window.addEventListener("keydown", onKey);

    const firstButton = getElementBySafeId(container, buttons[0]?.id ?? "");
    if (firstButton instanceof HTMLButtonElement && options.autoFocusFirstButton !== false) {
      firstButton.focus();
    }
  });
}

export function captureTimedResponse(args: CaptureTimedResponseArgs): Promise<TimedResponse> {
  const allowed = new Set((args.allowedKeys ?? []).map((key) => normalizeKey(key)));
  const totalDurationMs = Math.max(0, args.totalDurationMs);
  const startMs = Math.max(0, args.startMs ?? 0);
  const endMs = Math.max(startMs, args.endMs ?? totalDurationMs);

  if (isAutoResponderEnabled()) {
    const auto = sampleAutoResponse({
      validResponses: args.allowedKeys,
      trialDurationMs: totalDurationMs,
    });
    const delay = Math.max(startMs, Math.min(endMs, auto?.rtMs ?? 0));
    return sleep(delay).then(() => ({
      key: auto?.response ?? null,
      rtMs: auto?.response ? delay : null,
    }));
  }

  return new Promise((resolve) => {
    let active = false;
    let captured: TimedResponse = { key: null, rtMs: null };
    const startAt = performance.now();

    const onKey = (ev: KeyboardEvent) => {
      if (!active) return;
      const key = normalizeKey(ev.key);
      if (!allowed.has(key)) return;
      if (!isEditableKeyTarget(ev.target)) ev.preventDefault();
      if (captured.key) return;
      captured = { key, rtMs: Math.round(performance.now() - startAt) };
    };

    const onTimer = window.setTimeout(() => {
      cleanup();
      resolve(captured);
    }, totalDurationMs);
    const startTimer = window.setTimeout(() => {
      active = true;
    }, startMs);
    const endTimer = window.setTimeout(() => {
      active = false;
    }, endMs);

    window.addEventListener("keydown", onKey);

    const cleanup = () => {
      window.removeEventListener("keydown", onKey);
      window.clearTimeout(onTimer);
      window.clearTimeout(startTimer);
      window.clearTimeout(endTimer);
    };
  });
}

export function renderFixedTrialFrame(options: FixedTrialFrameOptions): string {
  const aperturePx = Math.max(40, Math.round(options.aperturePx));
  const cueHeightPx = Math.max(0, Math.round(options.cueHeightPx ?? 24));
  const cueMarginBottomPx = Math.max(0, Math.round(options.cueMarginBottomPx ?? 6));
  const paddingYPx = Math.max(0, Math.round(options.paddingYPx ?? 16));
  const cueHtml = options.cueHtml ?? "&nbsp;";
  const innerHtml = options.innerHtml ?? "";
  const canvasBackground = options.canvasBackground ?? "#000";
  const canvasBorder = options.canvasBorder ?? "2px solid #444";
  return `<div style="display:flex;justify-content:center;padding:${paddingYPx}px 0;"><div style="width:${aperturePx}px;"><div style="height:${cueHeightPx}px;display:flex;align-items:center;justify-content:center;margin-bottom:${cueMarginBottomPx}px;">${cueHtml}</div><div style="position:relative;width:${aperturePx}px;height:${aperturePx}px;background:${canvasBackground};border:${canvasBorder};">${innerHtml}</div></div></div>`;
}

export function renderCenteredMessageFrame(options: CenteredMessageFrameOptions): string {
  const color = options.messageColor ?? "#ffffff";
  const fontSizePx = Math.max(10, Math.round(options.fontSizePx ?? 28));
  const fontWeight = Math.max(300, Math.min(900, Math.round(options.fontWeight ?? 700)));
  const messageHtml = `<div style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;color:${color};font-size:${fontSizePx}px;font-weight:${fontWeight};line-height:1.2;">${escapeHtml(options.message)}</div>`;
  return renderFixedTrialFrame({
    ...options,
    innerHtml: messageHtml,
  });
}

export function renderCenteredNotice(options: CenteredNoticeOptions): string {
  const title = escapeHtml(options.title);
  const message = options.message ? `<p>${escapeHtml(options.message)}</p>` : "";
  return `<div style="width:100%;min-height:50vh;display:flex;align-items:center;justify-content:center;text-align:center;"><div class="card" style="padding:24px 32px;max-width:800px;margin:0 auto;"><h2>${title}</h2>${message}</div></div>`;
}

function parseBorder(value: string | undefined): { widthPx: number; color: string } {
  const text = String(value || "").trim();
  const match = text.match(/^(\d+(?:\.\d+)?)px\s+\w+\s+(.+)$/i);
  if (!match) return { widthPx: 2, color: "#444444" };
  const widthPx = Number(match[1]);
  return {
    widthPx: Number.isFinite(widthPx) && widthPx > 0 ? widthPx : 2,
    color: match[2].trim() || "#444444",
  };
}

export function computeCanvasFrameLayout(options: CanvasFrameLayoutOptions): CanvasFrameLayout {
  const aperturePx = Math.max(40, Math.round(options.aperturePx));
  const paddingYPx = Math.max(0, Math.round(options.paddingYPx ?? 16));
  const cueHeightPx = Math.max(0, Math.round(options.cueHeightPx ?? 24));
  const cueMarginBottomPx = Math.max(0, Math.round(options.cueMarginBottomPx ?? 6));
  const frameTopPx = paddingYPx + cueHeightPx + cueMarginBottomPx;
  const totalHeightPx = frameTopPx + aperturePx + paddingYPx;
  return {
    aperturePx,
    paddingYPx,
    cueHeightPx,
    cueMarginBottomPx,
    frameTopPx,
    totalHeightPx,
  };
}

export function drawCanvasTrialFrame(
  ctx: CanvasRenderingContext2D,
  layout: CanvasFrameLayout,
  options: CanvasFrameDrawOptions = {},
): void {
  const cueText = options.cueText ?? "";
  const cueColor = options.cueColor ?? "#0f172a";
  const frameBackground = options.frameBackground ?? "#ffffff";
  const frameBorder = options.frameBorder ?? "1px solid #ddd";
  const border = parseBorder(frameBorder);

  ctx.clearRect(0, 0, layout.aperturePx, layout.totalHeightPx);
  
  // Fill entire canvas with a neutral background if we want consistency
  // but for now let's just fill the frame area
  ctx.fillStyle = frameBackground;
  ctx.fillRect(0, layout.frameTopPx, layout.aperturePx, layout.aperturePx);

  if (cueText) {
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.font = "16px sans-serif";
    ctx.fillStyle = cueColor;
    ctx.fillText(cueText, layout.aperturePx / 2, layout.paddingYPx + layout.cueHeightPx / 2);
  }

  // Draw border using lines to ensure crisp 1px edges on all sides
  ctx.lineWidth = border.widthPx;
  ctx.strokeStyle = border.color;
  
  const halfWidth = border.widthPx / 2;
  const left = Math.round(halfWidth);
  const right = Math.round(layout.aperturePx - halfWidth);
  const top = Math.round(layout.frameTopPx + halfWidth);
  const bottom = Math.round(layout.frameTopPx + layout.aperturePx - halfWidth);

  ctx.beginPath();
  ctx.moveTo(left, top);
  ctx.lineTo(right, top);
  ctx.lineTo(right, bottom);
  ctx.lineTo(left, bottom);
  ctx.closePath();
  ctx.stroke();
}

export function drawCanvasFramedScene(
  ctx: CanvasRenderingContext2D,
  layout: CanvasFrameLayout,
  options: CanvasFrameDrawOptions,
  drawContent?: (args: CanvasFrameContentContext) => void,
): void {
  drawCanvasTrialFrame(ctx, layout, options);
  if (!drawContent) return;
  drawContent({
    ctx,
    layout,
    centerX: layout.aperturePx / 2,
    centerY: layout.frameTopPx + layout.aperturePx / 2,
    frameLeft: 0,
    frameTop: layout.frameTopPx,
    frameSize: layout.aperturePx,
  });
}

export function drawCanvasCenteredText(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  text: string,
  options: { color?: string; fontSizePx?: number; fontWeight?: number } = {},
): void {
  const color = options.color ?? "#111111";
  const fontSizePx = Math.max(10, Math.round(options.fontSizePx ?? 28));
  const fontWeight = Math.max(300, Math.min(900, Math.round(options.fontWeight ?? 700)));
  ctx.fillStyle = color;
  ctx.font = `${fontWeight} ${fontSizePx}px sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(text, x, y);
}

export function drawCenteredCanvasMessage(
  ctx: CanvasRenderingContext2D,
  layout: CanvasFrameLayout,
  options: CanvasCenteredMessageOptions,
): void {
  drawCanvasTrialFrame(ctx, layout, options);
  const message = options.message ?? "";
  const messageColor = options.messageColor ?? "#ffffff";
  const fontSizePx = Math.max(10, Math.round(options.fontSizePx ?? 28));
  const fontWeight = Math.max(300, Math.min(900, Math.round(options.fontWeight ?? 700)));
  ctx.fillStyle = messageColor;
  ctx.font = `${fontWeight} ${fontSizePx}px sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(message, layout.aperturePx / 2, layout.frameTopPx + layout.aperturePx / 2);
}

export function createScaledCanvasHost(args: CreateScaledCanvasHostArgs): CanvasHostHandle {
  const displayElement = args.displayElement;
  const canvasWidth = Math.max(40, Math.round(args.canvasWidth));
  const canvasHeight = Math.max(40, Math.round(args.canvasHeight));
  const viewportPaddingPx = Math.max(0, Math.round(args.viewportPaddingPx ?? 24));

  displayElement.innerHTML = "";
  const stageShell = document.createElement("div");
  stageShell.className = "exp-canvas-stage-shell";
  const container = document.createElement("div");
  container.className = "exp-canvas-container";
  stageShell.appendChild(container);
  displayElement.appendChild(stageShell);

  container.style.width = `${canvasWidth}px`;
  container.style.height = `${canvasHeight}px`;
  container.style.margin = "0";
  container.style.transformOrigin = "top left";

  const updateScale = () => {
    const bounds = displayElement.getBoundingClientRect();
    const availableWidth = Math.max(320, bounds.width - viewportPaddingPx * 2);
    const availableHeight = Math.max(240, bounds.height - viewportPaddingPx * 2);
    const scale = Math.min(1, availableWidth / canvasWidth, availableHeight / canvasHeight);
    const scaledWidth = Math.floor(canvasWidth * scale);
    const scaledHeight = Math.floor(canvasHeight * scale);
    container.style.transform = `scale(${scale})`;
    stageShell.style.width = `${scaledWidth}px`;
    stageShell.style.height = `${scaledHeight}px`;
    stageShell.style.maxWidth = "100%";
    stageShell.style.maxHeight = "100%";
    stageShell.style.overflow = "hidden";
  };

  updateScale();
  window.addEventListener("resize", updateScale);

  const dispose = () => {
    window.removeEventListener("resize", updateScale);
    displayElement.innerHTML = "";
  };

  return { stageShell, container, updateScale, dispose };
}

export function mountCanvasElement(args: MountCanvasElementArgs): MountedCanvasElement {
  const width = Math.max(40, Math.round(args.width));
  const height = Math.max(40, Math.round(args.height));
  const container = args.container;
  container.innerHTML = "";

  const wrapper = document.createElement("div");
  wrapper.className = args.wrapperClassName ?? "exp-canvas-wrapper";
  wrapper.style.display = "flex";
  wrapper.style.justifyContent = "center";

  const canvas = document.createElement("canvas");
  canvas.className = args.canvasClassName ?? "exp-canvas";
  canvas.width = width;
  canvas.height = height;
  canvas.style.width = `${width}px`;
  canvas.style.height = `${height}px`;

  wrapper.appendChild(canvas);
  container.appendChild(wrapper);

  const ctx = canvas.getContext("2d");
  if (!ctx) {
    throw new Error("Failed to create 2D canvas context.");
  }
  return { wrapper, canvas, ctx };
}

export function ensureJsPsychCanvasCentered(container: HTMLElement): void {
  if (!document.getElementById(CANVAS_CENTER_STYLE_ID)) {
    const style = document.createElement("style");
    style.id = CANVAS_CENTER_STYLE_ID;
    style.textContent = `
.exp-jspsych-canvas-centered .jspsych-content-wrapper,
.exp-jspsych-canvas-centered .jspsych-content {
  width: 100%;
}
.exp-jspsych-canvas-centered.jspsych-display-element {
  min-height: 100dvh;
  overflow: hidden;
}
.exp-jspsych-canvas-centered .jspsych-content-wrapper {
  display: flex;
  justify-content: center;
  align-items: center;
  min-height: 100%;
}
.exp-jspsych-canvas-centered .jspsych-content {
  min-height: 100%;
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  margin: auto;
}
.exp-jspsych-canvas-centered #jspsych-canvas-keyboard-response-stimulus {
  display: flex;
  justify-content: center;
  align-items: center;
  width: 100%;
  min-height: 0;
}
.exp-jspsych-canvas-centered #jspsych-canvas-stimulus {
  display: block;
  margin: 0 auto;
}
`;
    document.head.appendChild(style);
  }
  container.classList.add("exp-jspsych-canvas-centered");
}

export function resolveJsPsychContentHost(container: HTMLElement): HTMLElement {
  const host = container.querySelector<HTMLElement>(".jspsych-content");
  return host ?? container;
}

export function pushJsPsychContinueScreen(
  timeline: any[],
  plugin: unknown,
  container: HTMLElement,
  html: string,
  phase: string,
  buttonId: string,
  data: Record<string, unknown> = {},
): void {
  timeline.push({
    type: plugin,
    data: {
      phase,
      ...data,
    },
    async: true,
    func: (done: () => void) => {
      const host = resolveJsPsychContentHost(container);
      void waitForContinue(host, html, { buttonId }).then(done);
    },
  });
}
