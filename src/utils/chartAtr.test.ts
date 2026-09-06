import { describe, expect, it } from 'vitest';
import type { OhlcBar } from '../services/psxData';
import { computeChartAtr } from './chartAtr';

function bar(i: number, high: number, low: number, close: number): OhlcBar {
  return {
    time: 1_700_000_000_000 + i * 86_400_000,
    open: close,
    high,
    low,
    close,
    volume: 1000,
  };
}

describe('computeChartAtr', () => {
  it('computes Wilder ATR with a simple average seed then recursive smoothing', () => {
    const bars = [
      bar(0, 10, 8, 9),
      bar(1, 12, 9, 11),
      bar(2, 13, 10, 12),
      bar(3, 14, 11, 13),
      bar(4, 18, 14, 17),
    ];

    const atr = computeChartAtr(bars, 3);
    expect(atr.slice(0, 2)).toEqual([0, 0]);
    expect(atr[2]).toBeCloseTo(8 / 3);
    expect(atr[3]).toBeCloseTo(25 / 9);
    expect(atr[4]).toBeCloseTo(95 / 27);
  });

  it('defaults to ATR(14)', () => {
    const bars = Array.from({ length: 14 }, (_, i) => bar(i, 10 + i, 8 + i, 9 + i));

    expect(computeChartAtr(bars).at(-1)).toBe(2);
  });
});
