import { describe, expect, it } from 'vitest';
import type { OhlcBar } from '../services/psxData';
import { DEFAULT_AUTO_TRENDLINES } from './autoTrendlines';
import { computeChartBreakouts, mapBreakoutsToViewport } from './chartBreakouts';

function bar(i: number, high: number, low: number, close?: number): OhlcBar {
  const mid = (high + low) / 2;
  return {
    time: 1_700_000_000_000 + i * 86_400_000,
    open: mid,
    high,
    low,
    close: close ?? mid,
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

  return highs.map((h, i) => {
    const lo = Math.min(lows[i], h - 1);
    const hi = Math.max(h, lo + 1);
    return bar(i, hi, lo);
  });
}

const enabledSettings = {
  ...DEFAULT_AUTO_TRENDLINES,
  enabled: true,
  pivotLength: 2,
  minBarsBetween: 5,
  breakAndRebuild: false,
};

describe('computeChartBreakouts', () => {
  it('marks the first close crossing above resistance after the second pivot', () => {
    const bars = seriesWithPivots({
      highPivots: [
        { i: 5, price: 60 },
        { i: 12, price: 58 },
      ],
      len: 17,
    });
    bars[13] = { ...bars[13], close: 57 };
    bars[14] = { ...bars[14], close: 57 };
    bars[15] = { ...bars[15], high: 59, close: 58 };
    bars[16] = { ...bars[16], high: 60, close: 59 };

    expect(computeChartBreakouts(bars, enabledSettings)).toEqual([
      { i: 15, kind: 'breakout', linePrice: 57.142857142857146, confirmed: true },
    ]);
  });

  it('marks the first close crossing below support after the second pivot', () => {
    const bars = seriesWithPivots({
      lowPivots: [
        { i: 5, price: 30 },
        { i: 12, price: 32 },
      ],
      len: 17,
    });
    bars[13] = { ...bars[13], close: 33 };
    bars[14] = { ...bars[14], close: 33 };
    bars[15] = { ...bars[15], low: 30, close: 31 };

    expect(computeChartBreakouts(bars, enabledSettings)).toEqual([
      { i: 15, kind: 'breakdown', linePrice: 32.857142857142854, confirmed: true },
    ]);
  });

  it('computes markers even when the auto trendline overlay is disabled', () => {
    const bars = seriesWithPivots({
      highPivots: [
        { i: 5, price: 60 },
        { i: 12, price: 58 },
      ],
      len: 17,
    });
    bars[15] = { ...bars[15], high: 59, close: 58 };

    expect(computeChartBreakouts(bars, { ...enabledSettings, enabled: false }).map((m) => m.i)).toEqual([15]);
  });

  it('still marks historical breaks when break-and-rebuild would drop the broken line', () => {
    const bars = seriesWithPivots({
      highPivots: [
        { i: 5, price: 60 },
        { i: 12, price: 58 },
      ],
      len: 17,
    });
    bars[15] = { ...bars[15], high: 59, close: 58 };

    // Active trendline overlay may hide a broken line; markers must still show the break.
    expect(computeChartBreakouts(bars, { ...enabledSettings, breakAndRebuild: true }).map((m) => m.i)).toEqual([
      15,
    ]);
  });

  it('marks unconfirmed and confirmed breaks when volume confirmation is enabled', () => {
    const bars = seriesWithPivots({
      highPivots: [
        { i: 5, price: 60 },
        { i: 12, price: 58 },
      ],
      len: 17,
    });
    bars[15] = { ...bars[15], high: 59, close: 58 };
    const volumeSpikeFlags = Array.from({ length: bars.length }, () => false);

    expect(computeChartBreakouts(bars, enabledSettings, { volumeConfirmBreaks: true, volumeSpikeFlags })).toEqual([
      { i: 15, kind: 'breakout', linePrice: 57.142857142857146, confirmed: false },
    ]);

    volumeSpikeFlags[15] = true;
    expect(computeChartBreakouts(bars, enabledSettings, { volumeConfirmBreaks: true, volumeSpikeFlags })).toEqual([
      { i: 15, kind: 'breakout', linePrice: 57.142857142857146, confirmed: true },
    ]);
  });

  it('maps full-series breakout indices into the visible window', () => {
    const markers = [
      { i: 10, kind: 'breakout' as const, linePrice: 50, confirmed: true },
      { i: 25, kind: 'breakdown' as const, linePrice: 40, confirmed: false },
      { i: 40, kind: 'breakout' as const, linePrice: 55, confirmed: true },
    ];
    expect(mapBreakoutsToViewport(markers, 20, 15)).toEqual([
      { i: 5, kind: 'breakdown', linePrice: 40, confirmed: false },
    ]);
  });
});
