import { describe, expect, it } from 'vitest';
import type { OhlcBar } from '../services/psxData';
import { computeRsiDivergence } from './chartRsiDivergence';

function bar(i: number, high: number, low: number): OhlcBar {
  const mid = (high + low) / 2;
  return {
    time: 1_700_000_000_000 + i * 86_400_000,
    open: mid,
    high,
    low,
    close: mid,
    volume: 1000,
  };
}

function seriesWithPivots(opts: {
  highPivots?: { i: number; price: number }[];
  lowPivots?: { i: number; price: number }[];
  len: number;
}): OhlcBar[] {
  const highs = Array.from({ length: opts.len }, () => 50);
  const lows = Array.from({ length: opts.len }, () => 40);

  for (const p of opts.highPivots ?? []) {
    for (let d = -2; d <= 2; d += 1) {
      if (d === 0) continue;
      const j = p.i + d;
      if (j >= 0 && j < opts.len) highs[j] = Math.min(highs[j], p.price - 2 - Math.abs(d));
    }
    highs[p.i] = p.price;
  }

  for (const p of opts.lowPivots ?? []) {
    for (let d = -2; d <= 2; d += 1) {
      if (d === 0) continue;
      const j = p.i + d;
      if (j >= 0 && j < opts.len) lows[j] = Math.max(lows[j], p.price + 2 + Math.abs(d));
    }
    lows[p.i] = p.price;
  }

  return highs.map((h, i) => bar(i, Math.max(h, lows[i] + 1), Math.min(lows[i], h - 1)));
}

describe('computeRsiDivergence', () => {
  it('marks regular bullish divergence when price makes a lower swing low and RSI makes a higher low', () => {
    const bars = seriesWithPivots({
      lowPivots: [
        { i: 5, price: 30 },
        { i: 12, price: 27 },
      ],
      len: 17,
    });
    const rsi = Array.from({ length: bars.length }, () => 50);
    rsi[5] = 25;
    rsi[12] = 34;

    expect(computeRsiDivergence(bars, rsi, { pivotLength: 2 })).toEqual([{ i: 12, kind: 'bull' }]);
  });

  it('marks regular bearish divergence when price makes a higher swing high and RSI makes a lower high', () => {
    const bars = seriesWithPivots({
      highPivots: [
        { i: 4, price: 62 },
        { i: 11, price: 68 },
      ],
      len: 16,
    });
    const rsi = Array.from({ length: bars.length }, () => 50);
    rsi[4] = 76;
    rsi[11] = 64;

    expect(computeRsiDivergence(bars, rsi, { pivotLength: 2 })).toEqual([{ i: 11, kind: 'bear' }]);
  });

  it('keeps only the most recent markers', () => {
    const bars = seriesWithPivots({
      lowPivots: [
        { i: 3, price: 34 },
        { i: 8, price: 32 },
        { i: 13, price: 30 },
      ],
      len: 18,
    });
    const rsi = Array.from({ length: bars.length }, () => 50);
    rsi[3] = 22;
    rsi[8] = 28;
    rsi[13] = 35;

    expect(computeRsiDivergence(bars, rsi, { pivotLength: 2, maxMarkers: 1 })).toEqual([{ i: 13, kind: 'bull' }]);
  });
});
