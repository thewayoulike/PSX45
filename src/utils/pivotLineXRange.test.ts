import { describe, expect, it } from 'vitest';
import { pivotLineXRange } from './pivotLineXRange';

describe('pivotLineXRange', () => {
  const xAt = (i: number) => 10 + i * 10;
  const barTimes = [
    Date.UTC(2026, 7, 3), // Aug 3
    Date.UTC(2026, 7, 15),
    Date.UTC(2026, 8, 1), // Sep 1
    Date.UTC(2026, 8, 6),
  ];

  it('extends newest period lines to the plot right edge', () => {
    const r = pivotLineXRange({
      startTime: Date.UTC(2026, 8, 1),
      endTime: Date.UTC(2026, 8, 6),
      barTimes,
      barCount: 4,
      xAt,
      plotLeft: 10,
      plotRight: 400,
      isNewest: true,
    });
    expect(r).not.toBeNull();
    expect(r!.x1).toBe(xAt(2)); // Sep 1
    expect(r!.x2).toBe(400); // full right edge, not just last Sep bar
  });

  it('keeps historical periods clipped to their bars', () => {
    const r = pivotLineXRange({
      startTime: Date.UTC(2026, 7, 3),
      endTime: Date.UTC(2026, 7, 15),
      barTimes,
      barCount: 4,
      xAt,
      plotLeft: 10,
      plotRight: 400,
      isNewest: false,
    });
    expect(r).toEqual({ x1: xAt(0), x2: xAt(1) });
  });

  it('draws full-width for newest when period bars are off-screen', () => {
    const r = pivotLineXRange({
      startTime: Date.UTC(2026, 9, 1),
      endTime: Date.UTC(2026, 9, 30),
      barTimes,
      barCount: 4,
      xAt,
      plotLeft: 10,
      plotRight: 400,
      isNewest: true,
    });
    expect(r).toEqual({ x1: 10, x2: 400 });
  });
});
