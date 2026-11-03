import { describe, expect, it } from 'vitest';
import { matchesPatternFilter, scanCandlePatterns } from './candlePatternScan';

const flat = (i: number, close: number) => ({
  time: Date.UTC(2026, 0, 1) + i * 86400000, open: close - 0.5, high: close + 1, low: close - 1, close, volume: 100,
});
/** Plain up-candles (body 50% of range): no doji, hammer or engulfing. */
const series = (closes: number[]) => closes.map((c, i) => flat(i, c));
const engulfAt = (bars: ReturnType<typeof series>, i: number) => {
  const c = bars[i - 1].close;
  bars[i - 1] = { ...bars[i - 1], open: c + 1, close: c, high: c + 1.5, low: c - 0.5 };
  bars[i] = { ...bars[i], open: c - 0.2, close: c + 1.5, high: c + 1.8, low: c - 0.4 };
};

describe('candle pattern scan', () => {
  it('finds a pattern on the latest candle and reports its past record', () => {
    const bars = series(Array.from({ length: 60 }, () => 100));
    // After 10 and 20 price is higher 5 sessions later; after 30 it is lower.
    for (let i = 11; i < 20; i++) bars[i] = flat(i, 110);
    for (let i = 20; i < 30; i++) bars[i] = flat(i, 120);
    for (let i = 31; i < 58; i++) bars[i] = flat(i, 90);
    for (const i of [10, 20, 30, 59]) engulfAt(bars, i);

    const { hits, baseline, candleTime } = scanCandlePatterns(bars, { filter: 'bullish' });
    expect(candleTime).toBe(bars[59].time);
    expect(hits).toHaveLength(1);
    expect(hits[0]).toMatchObject({ type: 'bullishEngulfing', direction: 'bullish', sessionsAgo: 0 });
    expect(hits[0].record.samples).toBe(3);
    expect(hits[0].record.rose).toBe(2);
    expect(hits[0].record.risePct).toBeCloseTo(66.67, 1);
    expect(baseline.samples).toBe(55);
  });

  it('respects the filter and the recent-sessions window', () => {
    const bars = series(Array.from({ length: 40 }, () => 100));
    engulfAt(bars, 37);
    expect(scanCandlePatterns(bars, { filter: 'bullish' }).hits).toHaveLength(0);
    expect(scanCandlePatterns(bars, { filter: 'bullish', within: 3 }).hits[0].sessionsAgo).toBe(2);
    expect(scanCandlePatterns(bars, { filter: 'bearish', within: 3 }).hits).toHaveLength(0);
  });

  it('has no record when the pattern never appeared before', () => {
    const bars = series(Array.from({ length: 30 }, () => 100));
    engulfAt(bars, 29);
    const hit = scanCandlePatterns(bars).hits[0];
    expect(hit.record).toEqual({ samples: 0, rose: 0, risePct: null, avgMovePct: null });
  });

  it('matches filters by direction or exact type', () => {
    const m = { type: 'hammer' as const, direction: 'bullish' as const };
    expect(matchesPatternFilter(m, 'bullish')).toBe(true);
    expect(matchesPatternFilter(m, 'hammer')).toBe(true);
    expect(matchesPatternFilter(m, 'doji')).toBe(false);
    expect(matchesPatternFilter(m, 'any')).toBe(true);
  });
});
