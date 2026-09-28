import { describe, expect, it } from 'vitest';
import type { OhlcBar } from '../services/psxData';
import { computeChartProjection, PROJECTION_HORIZONS } from './chartProjection';

export function projectionBars(count = 900): OhlcBar[] {
  return Array.from({ length: count }, (_, i) => ({ time: Date.UTC(2022, 0, 1 + i, 4), open: 100 + i, high: 102 + i, low: 98 + i, close: 100 + i, volume: 1000 }));
}
const now = Date.UTC(2026, 8, 28, 14);
describe('historical chart projection', () => {
  it.each(PROJECTION_HORIZONS)('keeps h=%s prices in chart units without extra widening factors', horizon => {
    const result = computeChartProjection(projectionBars(), horizon, now);
    expect(result.data).not.toBeNull();
    for (const p of result.data!.points) {
      // Constant ATR and +1/session => every historical quantile maps to close+h.
      expect(p.samples).toBe(750);
      for (const value of [p.lower, p.innerLower, p.median, p.innerUpper, p.upper]) expect(value).toBeCloseTo(999 + p.session);
    }
  });
  it('does not allow future candles to change a past reference or sample', () => {
    const bars = projectionBars(300), cutoff = bars[270].time + 10 * 3600000;
    expect(computeChartProjection(bars, 8, cutoff)).toEqual(computeChartProjection(bars.slice(0, 271), 8, cutoff));
  });
  it('withholds the unfinished daily candle until 18:00 PKT', () => {
    const bars = projectionBars(300), day = bars[299].time - 4 * 3600000;
    expect(computeChartProjection(bars, 8, day + 12 * 3600000).data!.referenceTime).toBe(bars[298].time);
    expect(computeChartProjection(bars, 8, day + 13 * 3600000).data!.referenceTime).toBe(bars[299].time);
  });
  it('requires enough usable history and refuses zero-ATR series', () => {
    expect(computeChartProjection(projectionBars(60), 8, now).data).toBeNull();
    const flat = projectionBars(300).map(b => ({ ...b, open: 100, high: 100, low: 100, close: 100 }));
    expect(computeChartProjection(flat, 8, now).data).toBeNull();
  });
  it('sorts, deduplicates and excludes malformed prices before calculating ordered bands', () => {
    const clean = projectionBars(300).map((b, i) => { const c = 150 + Math.sin(i / 5) * 10; return { ...b, open: c, high: c + 3, low: c - 3, close: c }; });
    const noisy = [...clean.slice().reverse(), clean[10], { ...clean[20], time: now, close: NaN }];
    expect(computeChartProjection(noisy, 8, now)).toEqual(computeChartProjection(clean, 8, now));
    for (const p of computeChartProjection(clean, 8, now).data!.points) expect([p.lower, p.innerLower, p.median, p.innerUpper, p.upper]).toEqual([p.lower, p.innerLower, p.median, p.innerUpper, p.upper].sort((a, b) => a - b));
  });
});
