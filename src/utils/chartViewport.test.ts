import { describe, expect, it } from 'vitest';
import {
  applyViewport,
  canFitAllTime,
  effectiveViewCount,
  FIT_ALL_MAX_BARS,
  maxViewStart,
  rightPadBars,
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
