/** Horizontal viewport helpers — including empty space past the latest bar. */

/** Default recent-window cap (pan for older bars). */
export const DEFAULT_MAX_VISIBLE_BARS = 300;

/** Hard cap when “fit all” is on — larger SVG series freezes the UI. */
export const FIT_ALL_MAX_BARS = 2000;

const ZOOM_STEPS = [1, 1.25, 1.5, 2, 3, 4, 6, 8, 12] as const;
const MIN_WINDOW = 12;

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
  return Math.max(MIN_WINDOW, Math.min(maxVisible, Math.floor(total / factor)));
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
