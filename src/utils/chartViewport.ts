/** Horizontal viewport helpers — including empty space past the latest bar. */

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
