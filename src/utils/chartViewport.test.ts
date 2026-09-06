import { describe, expect, it } from 'vitest';
import { applyViewport, maxViewStart, rightPadBars } from './chartViewport';

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
    // 100 bars, window of 40 → data end start=60, plus pad 20 → 80
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
    // start=7, count=6 → only indices 7,8,9 (3 bars); caller keeps 6 slots
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
