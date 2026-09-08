import { PK_TIMEZONE } from './dates';

export type CandleInterval = '1m' | '5m' | '15m' | '1h' | 'day' | 'week' | 'month';

const PK_DATE: Intl.DateTimeFormatOptions = { timeZone: PK_TIMEZONE };
const PK_DAY: Intl.DateTimeFormatOptions = {
  ...PK_DATE,
  month: 'short',
  day: 'numeric',
  year: 'numeric',
};
const PK_MONTH: Intl.DateTimeFormatOptions = {
  ...PK_DATE,
  month: 'short',
  year: 'numeric',
};
const PK_INTRA: Intl.DateTimeFormatOptions = {
  ...PK_DATE,
  month: 'short',
  day: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
};

/** TradingView-style sparse date labels — PSX calendar day (Asia/Karachi), not browser TZ. */
export function fmtChartAxisDate(ms: number, interval: CandleInterval): string {
  if (interval === '1m' || interval === '5m' || interval === '15m' || interval === '1h') {
    return new Date(ms).toLocaleString('en-US', PK_INTRA);
  }
  if (interval === 'month') {
    return new Date(ms).toLocaleDateString('en-US', PK_MONTH);
  }
  return new Date(ms).toLocaleDateString('en-US', PK_DAY);
}

/**
 * Pick bar indices for X-axis labels with minimum pixel spacing (not every bar).
 * Always includes first and last when possible.
 */
export function pickChartXTickIndices(barCount: number, slotPx: number, minGapPx = 96): number[] {
  if (barCount <= 0) return [];
  if (barCount === 1) return [0];
  const plotWidth = barCount * Math.max(slotPx, 1);
  const maxTicks = Math.max(2, Math.min(7, Math.floor(plotWidth / minGapPx) + 1));
  if (maxTicks <= 2) return [0, barCount - 1];
  const out: number[] = [];
  for (let t = 0; t < maxTicks; t++) {
    const idx = Math.round((t / (maxTicks - 1)) * (barCount - 1));
    if (out.length === 0 || out[out.length - 1] !== idx) out.push(idx);
  }
  return out;
}

/** Recharts category ticks — label strings at sparse indices only. */
export function rechartsSparseTickLabels(times: number[], interval: CandleInterval, slotPx: number): string[] {
  const indices = pickChartXTickIndices(times.length, slotPx);
  return indices.map((i) => fmtChartAxisDate(times[i], interval));
}
