import type { HistoryRow } from './cardHistory';

export const valueRanges = ['1D', '1W', '1M', '6M', 'YTD', '1Y', 'MAX'] as const;
export type ValueRange = typeof valueRanges[number];
export type ValuePoint = { date: string; value: number };

/** Saved account valuations only; missing prices are never substituted with zero. */
export function portfolioValueSeries(rows: HistoryRow[], range: ValueRange, asOf: string): ValuePoint[] {
  const end = Date.parse(asOf + 'T12:00:00Z');
  if (!Number.isFinite(end)) return [];
  const start = new Date(end);
  if (range === '1W') start.setUTCDate(start.getUTCDate() - 7);
  if (range === '1M') start.setUTCMonth(start.getUTCMonth() - 1);
  if (range === '6M') start.setUTCMonth(start.getUTCMonth() - 6);
  if (range === 'YTD') start.setUTCMonth(0, 1);
  if (range === '1Y') start.setUTCFullYear(start.getUTCFullYear() - 1);
  const from = range === 'MAX' ? -Infinity : start.getTime();
  const unique = new Map<string, ValuePoint>();
  for (const row of rows) {
    const date = row.rawDate;
    if (!date || typeof row.netWorth !== 'number' || !Number.isFinite(row.netWorth)) continue;
    const time = Date.parse(date + 'T12:00:00Z');
    if (time >= from && time <= end) unique.set(date, { date, value: row.netWorth });
  }
  return [...unique.values()].sort((a, b) => a.date.localeCompare(b.date));
}
