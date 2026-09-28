/** Horizontal viewport helpers — including empty space past the latest bar. */

/** Default recent-window cap (pan for older bars). */
export const DEFAULT_MAX_VISIBLE_BARS = 300;

/** Hard cap when “fit all” is on — larger SVG series freezes the UI. */
export const FIT_ALL_MAX_BARS = 2000;

const ZOOM_STEPS = [1, 1.25, 1.5, 2, 3, 4, 6, 8, 12] as const;
const MIN_WINDOW = 12;

/** Smallest continuous window. Short series can be narrower than this. */
export const MIN_VISIBLE_BARS = MIN_WINDOW;

export function clampVisibleBars(visible: number, dataLen: number, maxVisible: number): number {
  if (dataLen <= 0) return 0;
  const cap = Math.min(dataLen, Math.max(1, maxVisible));
  const floor = Math.min(MIN_VISIBLE_BARS, cap);
  if (!Number.isFinite(visible)) return cap;
  return Math.max(floor, Math.min(cap, visible));
}

export function clampViewOrigin(origin: number, visible: number, dataLen: number): number {
  const max = maxViewStart(dataLen, Math.max(visible, 0));
  if (!Number.isFinite(origin)) return 0;
  return Math.max(0, Math.min(max, origin));
}

/** Drag right (positive dx) reveals older bars. One bar of drag moves one bar. */
export function panOriginByPixels(
  origin: number,
  dxPx: number,
  plotWidth: number,
  visible: number,
  dataLen: number
): number {
  if (!(plotWidth > 0) || !(visible > 0)) return clampViewOrigin(origin, visible, dataLen);
  return clampViewOrigin(origin - (dxPx * visible) / plotWidth, visible, dataLen);
}

/**
 * Zoom time around the cursor. `factor` > 1 shows fewer bars (zoom in).
 * The data index under `cursorX` stays under that pixel.
 */
export function zoomVisibleAtCursor(
  origin: number,
  visible: number,
  cursorX: number,
  plotWidth: number,
  factor: number,
  dataLen: number,
  maxVisible: number
): { origin: number; visible: number } {
  const safeFactor = Number.isFinite(factor) && factor > 0 ? factor : 1;
  const ratio = plotWidth > 0 ? Math.max(0, Math.min(1, cursorX / plotWidth)) : 0.5;
  const index = origin + ratio * visible;
  const nextVisible = clampVisibleBars(visible / safeFactor, dataLen, maxVisible);
  const nextOrigin = clampViewOrigin(index - ratio * nextVisible, nextVisible, dataLen);
  return { origin: nextOrigin, visible: nextVisible };
}

/** Integer slice that covers a fractional left edge and visible width. */
export function viewportSlice(origin: number, visible: number): { start: number; count: number; frac: number } {
  const start = Math.max(0, Math.floor(Number.isFinite(origin) ? origin : 0));
  const frac = (Number.isFinite(origin) ? origin : 0) - start;
  const end = Math.ceil((Number.isFinite(origin) ? origin : 0) + Math.max(0, visible) - 1e-9);
  return { start, count: Math.max(0, end - start), frac };
}

/** Empty slots past the last candle so the latest bar can sit mid-chart. */
export function rightPadBars(viewCount: number): number {
  if (viewCount <= 0) return 0;
  return Math.floor(viewCount / 2);
}

/**
 * Max left-edge index for the visible window.
 * Includes right-pad so the user can drag past the latest candle.
 */
export function maxViewStart(dataLen: number, viewCount: number, rightPad = rightPadBars(viewCount)): number {
  if (dataLen <= 0 || viewCount <= 0) return 0;
  return Math.max(0, dataLen - viewCount) + Math.max(0, rightPad);
}

/**
 * Slice bars for the viewport. Does not clamp `start` back to data-end —
 * a start near the end returns fewer bars; leave empty slots on the right.
 */
export function applyViewport<T>(arr: T[], start: number, count: number): T[] {
  if (!arr.length || count <= 0) return [];
  const s = Math.max(0, start);
  if (s >= arr.length) return [];
  return arr.slice(s, Math.min(arr.length, s + count));
}

export function canFitAllTime(dataLen: number, fitAllMax = FIT_ALL_MAX_BARS): boolean {
  return dataLen > 0 && dataLen <= fitAllMax;
}

/** Recent-window size from zoom (ignores fit-all). */
export function windowCount(
  total: number,
  zoomIdx: number,
  maxVisible = DEFAULT_MAX_VISIBLE_BARS
): number {
  if (total === 0) return 0;
  if (zoomIdx <= 0) return Math.min(total, maxVisible);
  const factor = ZOOM_STEPS[Math.min(zoomIdx, ZOOM_STEPS.length - 1)] ?? 1;
  return Math.min(total, maxVisible, Math.max(MIN_WINDOW, Math.floor(Math.min(total, maxVisible) / factor)));
}

/**
 * Visible bar count for the chart.
 * fitAll + small enough series → show everything; otherwise recent-window zoom.
 */
export function effectiveViewCount(
  dataLen: number,
  zoomIdx: number,
  fitAll: boolean,
  maxVisible = DEFAULT_MAX_VISIBLE_BARS,
  fitAllMax = FIT_ALL_MAX_BARS
): number {
  if (fitAll && canFitAllTime(dataLen, fitAllMax)) return dataLen;
  return windowCount(dataLen, zoomIdx, maxVisible);
}
