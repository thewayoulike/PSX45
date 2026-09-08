/** Traditional (floor-trader) pivot levels — same math as chart Awais pivots. */

import type { OhlcBar } from '../services/psxData';

export interface TraditionalPivotLevels {
  p: number;
  r1: number;
  s1: number;
  r2: number;
  s2: number;
}

export function traditionalPivotsFromHLC(h: number, l: number, c: number): TraditionalPivotLevels {
  const p = (h + l + c) / 3;
  const range = h - l;
  return {
    p,
    r1: 2 * p - l,
    s1: 2 * p - h,
    r2: p + range,
    s2: p - range,
  };
}

function monthKey(time: number): string {
  const d = new Date(time);
  return `${d.getUTCFullYear()}-${d.getUTCMonth()}`;
}

/** High/low/close of the last *completed* calendar month (UTC). */
export function lastCompletedMonthHLC(
  bars: OhlcBar[],
): { high: number; low: number; close: number } | null {
  const n = bars.length;
  if (!n) return null;

  const currentKey = monthKey(bars[n - 1].time);
  let i = n - 1;
  while (i >= 0 && monthKey(bars[i].time) === currentKey) i--;

  if (i < 0) {
    const prev = bars[n - 2] ?? bars[n - 1];
    return { high: prev.high, low: prev.low, close: prev.close };
  }

  const prevKey = monthKey(bars[i].time);
  const close = bars[i].close;
  let high = -Infinity;
  let low = Infinity;
  for (; i >= 0 && monthKey(bars[i].time) === prevKey; i--) {
    high = Math.max(high, bars[i].high);
    low = Math.min(low, bars[i].low);
  }
  if (!Number.isFinite(high) || !Number.isFinite(low)) return null;
  return { high, low, close };
}

export interface PivotSupportResistance {
  pivot: number;
  support: number; // S1
  resistance: number; // R1
  s1: number;
  r1: number;
}

/** Monthly traditional pivots → S1 support / R1 resistance (chart-aligned). */
export function monthlyPivotSupportResistance(bars: OhlcBar[]): PivotSupportResistance | null {
  const src = lastCompletedMonthHLC(bars);
  if (!src) return null;
  const levels = traditionalPivotsFromHLC(src.high, src.low, src.close);
  return {
    pivot: levels.p,
    support: levels.s1,
    resistance: levels.r1,
    s1: levels.s1,
    r1: levels.r1,
  };
}
