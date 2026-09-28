import { PK_TIMEZONE } from './dates';

const DAY_MS = 24 * 60 * 60 * 1000;
const PK_OFFSET_MS = 5 * 60 * 60 * 1000;

/** Midnight at the start of this timestamp's Pakistan calendar day. */
export function pakistanDayStartMs(time: number): number {
  const day = new Intl.DateTimeFormat('en-CA', {
    timeZone: PK_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(time));
  const [year, month, date] = day.split('-').map(Number);
  return Date.UTC(year, month - 1, date) - PK_OFFSET_MS;
}

/**
 * Bars inside the last `daySpan` Pakistan calendar days, counted back from the
 * newest bar. A lagging feed or a weekend does not drop the last session.
 * `daySpan <= 0` keeps every bar.
 */
export function barsWithinLatestDaySpan<T extends { time: number }>(bars: T[], daySpan: number): T[] {
  if (daySpan <= 0 || bars.length === 0) return bars;
  let latest = bars[0].time;
  for (const bar of bars) if (bar.time > latest) latest = bar.time;
  const cutoff = pakistanDayStartMs(latest) - (daySpan - 1) * DAY_MS;
  return bars.filter((bar) => bar.time >= cutoff);
}
