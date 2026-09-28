import { describe, expect, it } from 'vitest';
import {
  applyViewport,
  canFitAllTime,
  clampViewOrigin,
  clampVisibleBars,
  effectiveViewCount,
  FIT_ALL_MAX_BARS,
  maxViewStart,
  MIN_VISIBLE_BARS,
  panOriginByPixels,
  rightPadBars,
  viewportSlice,
  zoomVisibleAtCursor,
  DEFAULT_MAX_VISIBLE_BARS,
} from './chartViewport';

describe('rightPadBars', () => {
  it('is about half the visible window', () => {
    expect(rightPadBars(50)).toBe(25);
    expect(rightPadBars(51)).toBe(25);
    expect(rightPadBars(12)).toBe(6);
  });

  it('is zero for empty window', () => {
    expect(rightPadBars(0)).toBe(0);
  });
});

describe('maxViewStart', () => {
  it('allows panning past the last bar by the right pad', () => {
    expect(maxViewStart(100, 40)).toBe(60 + 20);
  });

  it('still allows right margin when all bars fit on screen', () => {
    expect(maxViewStart(40, 40)).toBe(20);
  });

  it('is zero when no data', () => {
    expect(maxViewStart(0, 40)).toBe(0);
  });
});

describe('applyViewport', () => {
  const arr = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9];

  it('slices a normal window', () => {
    expect(applyViewport(arr, 2, 4)).toEqual([2, 3, 4, 5]);
  });

  it('returns a shorter slice when start leaves empty space past the end', () => {
    expect(applyViewport(arr, 7, 6)).toEqual([7, 8, 9]);
  });

  it('does not clamp start back to data-end (that blocked right margin)', () => {
    expect(applyViewport(arr, 8, 4)).toEqual([8, 9]);
    expect(applyViewport(arr, 8, 4)).not.toEqual([6, 7, 8, 9]);
  });

  it('returns empty when start is past all data', () => {
    expect(applyViewport(arr, 10, 4)).toEqual([]);
  });

  it('returns empty for empty input', () => {
    expect(applyViewport([], 0, 5)).toEqual([]);
  });
});

describe('canFitAllTime', () => {
  it('allows fit when series is within the safety cap', () => {
    expect(canFitAllTime(500)).toBe(true);
    expect(canFitAllTime(FIT_ALL_MAX_BARS)).toBe(true);
  });

  it('blocks fit when series would freeze the UI', () => {
    expect(canFitAllTime(FIT_ALL_MAX_BARS + 1)).toBe(false);
  });
});

describe('effectiveViewCount', () => {
  it('zooms immediately from the phone window even with a long history', () => {
    expect(effectiveViewCount(1500, 0, false, 60)).toBe(60);
    expect(effectiveViewCount(1500, 1, false, 60)).toBe(48);
    expect(effectiveViewCount(1500, 8, false, 60)).toBe(12);
  });

  it('does not invent bars when zooming a short series', () => {
    expect(effectiveViewCount(5, 8, false, 60)).toBe(5);
  });
  it('uses the recent-window cap by default (fitAll off)', () => {
    expect(effectiveViewCount(800, 0, false)).toBe(DEFAULT_MAX_VISIBLE_BARS);
  });

  it('returns full series length when fitAll is on and allowed', () => {
    expect(effectiveViewCount(800, 0, true)).toBe(800);
  });

  it('falls back to capped window when fitAll is on but series is too large', () => {
    expect(effectiveViewCount(FIT_ALL_MAX_BARS + 50, 0, true)).toBe(DEFAULT_MAX_VISIBLE_BARS);
  });
});

describe('clampVisibleBars', () => {
  it('keeps a continuous window between a minimum and the series cap', () => {
    expect(clampVisibleBars(80.4, 500, 2000)).toBeCloseTo(80.4);
    expect(clampVisibleBars(3, 500, 2000)).toBe(MIN_VISIBLE_BARS);
    expect(clampVisibleBars(9000, 500, 2000)).toBe(500);
  });

  it('does not invent bars for a short series', () => {
    expect(clampVisibleBars(50, 8, 2000)).toBe(8);
  });
});

describe('clampViewOrigin', () => {
  it('stays inside the right-pad range', () => {
    expect(clampViewOrigin(-4, 40, 100)).toBe(0);
    expect(clampViewOrigin(90, 40, 100)).toBe(maxViewStart(100, 40));
  });
});

describe('panOriginByPixels', () => {
  it('moves one bar per bar of drag, including a fraction of a candle', () => {
    expect(panOriginByPixels(50, 100, 200, 40, 100)).toBeCloseTo(30);
    expect(panOriginByPixels(50, 25, 200, 40, 100)).toBeCloseTo(45);
  });

  it('does not pan before the first bar', () => {
    expect(panOriginByPixels(2, 200, 200, 40, 100)).toBe(0);
  });
});

describe('zoomVisibleAtCursor', () => {
  it('keeps the bar under the pointer fixed', () => {
    const left = zoomVisibleAtCursor(20, 40, 0, 200, 2, 100, 2000);
    expect(left.visible).toBe(20);
    expect(left.origin).toBeCloseTo(20);

    const mid = zoomVisibleAtCursor(20, 40, 100, 200, 2, 100, 2000);
    expect(mid.visible).toBe(20);
    expect(mid.origin).toBeCloseTo(30);

    const right = zoomVisibleAtCursor(20, 40, 200, 200, 2, 100, 2000);
    expect(right.visible).toBe(20);
    expect(right.origin).toBeCloseTo(40);
  });
});

describe('viewportSlice', () => {
  it('covers the partial bars on both edges of a fractional window', () => {
    const partial = viewportSlice(10.4, 80.3);
    expect(partial.start).toBe(10);
    expect(partial.count).toBe(81);
    expect(partial.frac).toBeCloseTo(0.4);
    expect(viewportSlice(10, 80)).toEqual({ start: 10, count: 80, frac: 0 });
  });
});
