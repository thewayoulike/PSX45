/**
 * Map a pivot period onto plot X coordinates.
 * Newest (active) levels extend to the right plot edge so they stay visible when
 * zoomed (TradingView-style); older periods stay clipped to their time span.
 */
export function pivotLineXRange(opts: {
  startTime: number;
  endTime: number;
  barTimes: number[] | undefined;
  barCount: number;
  xAt: (i: number) => number;
  plotLeft: number;
  plotRight: number;
  isNewest: boolean;
}): { x1: number; x2: number } | null {
  const { startTime, endTime, barTimes, barCount, xAt, plotLeft, plotRight, isNewest } = opts;

  if (!barTimes || barTimes.length === 0 || !Number.isFinite(startTime)) {
    return { x1: plotLeft, x2: plotRight };
  }

  let i0 = -1;
  let i1 = -1;
  const n = Math.min(barTimes.length, barCount);
  for (let i = 0; i < n; i++) {
    const t = barTimes[i];
    if (t >= startTime && t <= endTime) {
      if (i0 < 0) i0 = i;
      i1 = i;
    }
  }

  if (i0 < 0 || i1 < 0) {
    // Active pivots: still draw full-width when the period isn't in the viewport window.
    if (isNewest) return { x1: plotLeft, x2: plotRight };
    return null;
  }

  const x1 = xAt(i0);
  const x2 = isNewest ? plotRight : xAt(i1);
  if (x2 <= x1) return isNewest ? { x1: plotLeft, x2: plotRight } : null;
  return { x1, x2 };
}
