// @ts-nocheck
/**
 * Hit detection helper for pointer interaction. Coordinates are in canvas space.
 */
export const isPointInsideBrick = (brick, x, y) => {
  if (!brick) {
    return false;
  }
  return (
    x >= brick.x &&
    x <= brick.x + brick.width &&
    y >= brick.y &&
    y <= brick.y + brick.height
  );
};

/**
 * Returns the width of the currently visible brick body.
 * The interactive hit area stays full-width, but completion modes with
 * progressive visual depletion shrink the visible mass from the right edge.
 */
export const getBrickVisibleWidth = (brick, completionMode) => {
  const baseWidth = Math.max(0, Number(brick?.width ?? 0) || 0);
  if (baseWidth <= 0) {
    return 0;
  }
  if (completionMode === 'hover_to_clear' || completionMode === 'hold_duration' || completionMode === 'hold_to_clear' || completionMode === 'click_to_clear' || completionMode === 'task_sequence') {
    const progress = Math.max(0, Math.min(1, Number(brick?.clearProgress ?? 0) || 0));
    return Math.max(0, baseWidth * (1 - progress));
  }
  return baseWidth;
};

const normalizeColor = (value, fallback) => {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value & 0xffffff;
  }
  if (typeof value === 'string') {
    let hex = value.trim();
    if (!hex) {
      return fallback;
    }
    if (hex.startsWith('#')) {
      hex = hex.slice(1);
    } else if (hex.startsWith('0x') || hex.startsWith('0X')) {
      hex = hex.slice(2);
    }
    const parsed = Number.parseInt(hex, 16);
    if (Number.isFinite(parsed)) {
      return parsed & 0xffffff;
    }
  }
  return fallback;
};

/**
 * Returns a PIXI-compatible tint for the given completion progress. The exact
 * visuals are handled in the renderer, but keeping the logic here keeps the
 * renderer clean.
 */
export const brickProgressTint = (brick, completionMode, params = {}) => {
  if (completionMode !== 'multi_click') {
    return 0xffffff;
  }
  const required = Math.max(1, Number(params.clicks_required ?? 2));
  const fraction = Math.min(1, (brick.clicks ?? 0) / required);
  // Linearly interpolate between white and brick color (darker as work remains).
  const base = 0xffffff;
  const target = normalizeColor(brick?.color, 0xf39c12);
  const mixChannel = (mask, shift) => {
    const b = (base >> shift) & mask;
    const t = (target >> shift) & mask;
    return ((t - b) * fraction + b) & mask;
  };
  const r = mixChannel(0xff, 16);
  const g = mixChannel(0xff, 8);
  const b = mixChannel(0xff, 0);
  return (r << 16) | (g << 8) | b;
};
