import { describe, expect, it } from 'vitest';
import type { OhlcBar } from '../services/psxData';
import {
  DEFAULT_AUTO_TRENDLINES,
  cloneAutoTrendlineSettings,
  computeAutoTrendlines,
  extendTrendlineToIndex,
  findSwingPivots,
  isLineBroken,
  normalizeAutoTrendlineSettings,
} from './autoTrendlines';

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

/** Build a series with isolated pivot highs/lows at given indices (pivotLength=2). */
function seriesWithPivots(opts: {
  highPivots: { i: number; price: number }[];
  lowPivots: { i: number; price: number }[];
  len: number;
  closeFrom?: number;
  closeValue?: number;
}): OhlcBar[] {
  const highs = Array.from({ length: opts.len }, () => 50);
  const lows = Array.from({ length: opts.len }, () => 40);
  for (const p of opts.highPivots) {
    for (let d = -2; d <= 2; d++) {
      if (d === 0) continue;
      const j = p.i + d;
      if (j >= 0 && j < opts.len) highs[j] = Math.min(highs[j], p.price - 2 - Math.abs(d));
    }
    highs[p.i] = p.price;
  }
  for (const p of opts.lowPivots) {
    for (let d = -2; d <= 2; d++) {
      if (d === 0) continue;
      const j = p.i + d;
      if (j >= 0 && j < opts.len) lows[j] = Math.max(lows[j], p.price + 2 + Math.abs(d));
    }
    lows[p.i] = p.price;
  }
  return highs.map((h, i) => {
    const lo = Math.min(lows[i], h - 1);
    const hi = Math.max(h, lo + 1);
    const c =
      opts.closeFrom != null && i >= opts.closeFrom && opts.closeValue != null
        ? opts.closeValue
        : (hi + lo) / 2;
    return bar(i, hi, lo, c);
  });
}

describe('cloneAutoTrendlineSettings', () => {
  it('copies defaults with black colors and structural settings', () => {
    const c = cloneAutoTrendlineSettings(DEFAULT_AUTO_TRENDLINES);
    expect(c.supportColor).toBe('#000000');
    expect(c.resistanceColor).toBe('#000000');
    expect(c.enabled).toBe(false);
    expect(c.breakAndRebuild).toBe(true);
    expect(c.pivotLength).toBe(10);
    expect(c.minBarsBetween).toBe(25);
    c.enabled = true;
    expect(DEFAULT_AUTO_TRENDLINES.enabled).toBe(false);
  });
});

describe('normalizeAutoTrendlineSettings', () => {
  it('fills minBarsBetween from defaults when missing', () => {
    const n = normalizeAutoTrendlineSettings({ enabled: true, pivotLength: 5 });
    expect(n.enabled).toBe(true);
    expect(n.pivotLength).toBe(5);
    expect(n.minBarsBetween).toBe(25);
  });
});

describe('findSwingPivots', () => {
  it('detects crafted pivot highs and lows', () => {
    const bars = seriesWithPivots({
      highPivots: [
        { i: 5, price: 60 },
        { i: 12, price: 62 },
        { i: 19, price: 58 },
      ],
      lowPivots: [
        { i: 5, price: 30 },
        { i: 12, price: 28 },
        { i: 19, price: 32 },
      ],
      len: 25,
    });
    const { highs, lows } = findSwingPivots(bars, 2);
    expect(highs.map((p) => p.i)).toEqual([5, 12, 19]);
    expect(lows.map((p) => p.i)).toEqual([5, 12, 19]);
  });
});

describe('computeAutoTrendlines', () => {
  it('returns empty when fewer than two swings', () => {
    const bars = Array.from({ length: 20 }, (_, i) => bar(i, 10 + i * 0.1, 9 + i * 0.1));
    expect(computeAutoTrendlines(bars, { ...DEFAULT_AUTO_TRENDLINES, enabled: true, pivotLength: 5 })).toEqual({
      support: null,
      resistance: null,
    });
  });

  it('builds resistance/support from last two pivots', () => {
    const bars = seriesWithPivots({
      highPivots: [
        { i: 5, price: 60 },
        { i: 12, price: 62 },
        { i: 19, price: 64 },
      ],
      lowPivots: [
        { i: 5, price: 30 },
        { i: 12, price: 28 },
        { i: 19, price: 26 },
      ],
      len: 25,
    });
    const out = computeAutoTrendlines(bars, {
      ...DEFAULT_AUTO_TRENDLINES,
      enabled: true,
      pivotLength: 2,
      breakAndRebuild: false,
    });
    expect(out.resistance).toEqual({ kind: 'resistance', i0: 12, price0: 62, i1: 19, price1: 64 });
    expect(out.support).toEqual({ kind: 'support', i0: 12, price0: 28, i1: 19, price1: 26 });
  });

  it('respects showSupport / showResistance flags', () => {
    const bars = seriesWithPivots({
      highPivots: [
        { i: 5, price: 60 },
        { i: 12, price: 62 },
      ],
      lowPivots: [
        { i: 5, price: 30 },
        { i: 12, price: 28 },
      ],
      len: 20,
    });
    const onlyRes = computeAutoTrendlines(bars, {
      ...DEFAULT_AUTO_TRENDLINES,
      enabled: true,
      pivotLength: 2,
      showSupport: false,
      showResistance: true,
      breakAndRebuild: false,
    });
    expect(onlyRes.support).toBeNull();
    expect(onlyRes.resistance).not.toBeNull();
  });

  it('returns nulls when disabled', () => {
    expect(computeAutoTrendlines([bar(0, 10, 9)], DEFAULT_AUTO_TRENDLINES)).toEqual({
      support: null,
      resistance: null,
    });
  });

  it('break-and-rebuild: falls back to earlier resistance pair when newest is broken', () => {
    // Newest 12→19 descends faster; close pierces it but stays under older 5→12.
    const bars = seriesWithPivots({
      highPivots: [
        { i: 5, price: 70 },
        { i: 12, price: 68 },
        { i: 19, price: 60 },
      ],
      lowPivots: [{ i: 8, price: 40 }],
      len: 28,
      closeFrom: 20,
      closeValue: 61,
    });
    const newest = { kind: 'resistance' as const, i0: 12, price0: 68, i1: 19, price1: 60 };
    const older = { kind: 'resistance' as const, i0: 5, price0: 70, i1: 12, price1: 68 };
    expect(isLineBroken(bars, newest, 'resistance')).toBe(true);
    expect(isLineBroken(bars, older, 'resistance')).toBe(false);

    const withBreak = computeAutoTrendlines(bars, {
      ...DEFAULT_AUTO_TRENDLINES,
      enabled: true,
      pivotLength: 2,
      minBarsBetween: 5,
      breakAndRebuild: true,
      showSupport: false,
      showResistance: true,
    });
    expect(withBreak.resistance).toEqual(older);

    const noBreak = computeAutoTrendlines(bars, {
      ...DEFAULT_AUTO_TRENDLINES,
      enabled: true,
      pivotLength: 2,
      breakAndRebuild: false,
      showSupport: false,
      showResistance: true,
    });
    expect(noBreak.resistance).toEqual(newest);
  });

  it('break-and-rebuild: falls back to earlier support pair when newest is broken', () => {
    const bars = seriesWithPivots({
      highPivots: [{ i: 8, price: 60 }],
      lowPivots: [
        { i: 5, price: 30 },
        { i: 12, price: 32 },
        { i: 19, price: 40 },
      ],
      len: 28,
      closeFrom: 20,
      closeValue: 38,
    });
    const newest = { kind: 'support' as const, i0: 12, price0: 32, i1: 19, price1: 40 };
    const older = { kind: 'support' as const, i0: 5, price0: 30, i1: 12, price1: 32 };
    expect(isLineBroken(bars, newest, 'support')).toBe(true);
    expect(isLineBroken(bars, older, 'support')).toBe(false);

    const out = computeAutoTrendlines(bars, {
      ...DEFAULT_AUTO_TRENDLINES,
      enabled: true,
      pivotLength: 2,
      minBarsBetween: 5,
      breakAndRebuild: true,
      showSupport: true,
      showResistance: false,
    });
    expect(out.support).toEqual(older);
  });

  it('prefers longer structural resistance from major peak over last two local swings', () => {
    // Major peak at 5, later lower highs; short last pair 40→50 is unbroken but short.
    const bars = seriesWithPivots({
      highPivots: [
        { i: 5, price: 100 },
        { i: 30, price: 80 },
        { i: 40, price: 72 },
        { i: 50, price: 70 },
      ],
      lowPivots: [{ i: 20, price: 40 }],
      len: 60,
    });
    const out = computeAutoTrendlines(bars, {
      ...DEFAULT_AUTO_TRENDLINES,
      enabled: true,
      pivotLength: 2,
      minBarsBetween: 20,
      breakAndRebuild: true,
      showSupport: false,
      showResistance: true,
    });
    // Prefer 5→50 (or 5→40) over stubby 40→50
    expect(out.resistance?.i0).toBe(5);
    expect(out.resistance!.i1).toBeGreaterThanOrEqual(40);
  });
});

describe('extendTrendlineToIndex', () => {
  it('projects price at a later bar index', () => {
    const seg = { kind: 'resistance' as const, i0: 0, price0: 10, i1: 10, price1: 20 };
    expect(extendTrendlineToIndex(seg, 20)).toBe(30);
  });
});
