const DAY = 86400000;

export type HistoryRange = '1D' | '1M' | '6M' | 'YTD' | '1Y' | '3Y' | '5Y';

export function historyStart(range: HistoryRange, now: Date): number | null {
  if (range === '1D') return null;
  if (range === 'YTD') return Date.UTC(now.getUTCFullYear(), 0, 1);
  const days = range === '1M' ? 31 : range === '6M' ? 183 : range === '1Y' ? 366 : range === '3Y' ? 366 * 3 : range === '5Y' ? 366 * 5 : null;
  return days == null ? null : now.getTime() - days * DAY;
}

export function clipHistory<T extends { time: number }>(points: T[], range: HistoryRange, now = new Date()): T[] {
  const start = historyStart(range, now);
  if (start == null) return points;
  return points.filter(point => point.time >= start);
}
