import { describe, it, expect } from 'vitest';
import { computePositionPeakCapital } from './positionPeakCapital';

const t = (day: number, seq: number) => new Date(Date.UTC(2026, 0, day, 5, 0, seq)).toISOString();

describe('computePositionPeakCapital', () => {
  it('counts a same-day round trip once so a closed day-trade still has an ROI base', () => {
    // Buy 10,000 then sell it back, ten times over ten days. Flat at every close.
    const rows = Array.from({ length: 10 }).flatMap((_, i) => [
      { date: `2026-01-${String(i + 1).padStart(2, '0')}`, createdAt: t(i + 1, 1), costDelta: 10_000 },
      { date: `2026-01-${String(i + 1).padStart(2, '0')}`, createdAt: t(i + 1, 2), costDelta: -10_000 },
    ]);
    expect(computePositionPeakCapital(rows)).toBe(10_000); // not 0, and not 100,000
  });

  it('does not treat a same-day buy as peak when most of it is sold that day', () => {
    const rows = [
      { date: '2026-05-20', createdAt: t(20, 1), costDelta: 200_000 },
      { date: '2026-05-29', createdAt: t(29, 1), costDelta: 905_000 },
      { date: '2026-05-29', createdAt: t(29, 2), costDelta: -802_000 },
    ];
    expect(computePositionPeakCapital(rows)).toBe(303_000);
  });

  it('tracks the high-water mark across overlapping lots and partial sells', () => {
    const rows = [
      { date: '2026-01-01', createdAt: t(1, 1), costDelta: 10_000 }, // open 10k
      { date: '2026-01-02', createdAt: t(2, 1), costDelta: 5_000 },  // open 15k  <- peak
      { date: '2026-01-03', createdAt: t(3, 1), costDelta: -6_000 }, // open 9k
      { date: '2026-01-04', createdAt: t(4, 1), costDelta: 4_000 },  // open 13k
    ];
    expect(computePositionPeakCapital(rows)).toBe(15_000);
  });

  it('orders by date first, then entry time, regardless of input order', () => {
    const rows = [
      { date: '2026-01-02', createdAt: t(2, 1), costDelta: -8_000 },
      { date: '2026-01-01', createdAt: t(1, 2), costDelta: 3_000 },
      { date: '2026-01-01', createdAt: t(1, 1), costDelta: 8_000 },
    ];
    expect(computePositionPeakCapital(rows)).toBe(11_000);
  });

  it('includes transferred-in cost and never goes negative', () => {
    const rows = [
      { date: '2026-01-01', createdAt: t(1, 1), costDelta: 20_000 }, // transfer in
      { date: '2026-01-02', createdAt: t(2, 1), costDelta: -25_000 }, // oversized release clamps to 0
      { date: '2026-01-03', createdAt: t(3, 1), costDelta: 5_000 },
    ];
    expect(computePositionPeakCapital(rows)).toBe(20_000);
  });

  it('returns 0 with no activity', () => {
    expect(computePositionPeakCapital([])).toBe(0);
  });
});
