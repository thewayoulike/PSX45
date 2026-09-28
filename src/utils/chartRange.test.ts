import { describe, expect, it } from 'vitest';
import { barsWithinLatestDaySpan } from './chartRange';

/** UTC ms for a Pakistan wall-clock time (UTC+5, no DST). */
const pkt = (y: number, m: number, d: number, h: number, min: number) =>
  Date.UTC(y, m - 1, d, h, min) - 5 * 60 * 60 * 1000;

describe('barsWithinLatestDaySpan', () => {
  const sep18 = pkt(2026, 9, 18, 15, 0);
  const sep19 = pkt(2026, 9, 19, 10, 0);
  const sep23 = pkt(2026, 9, 23, 15, 45);
  const bars = [{ time: sep18 }, { time: sep19 }, { time: sep23 }];

  it('keeps the last 5 Pakistan days measured from the newest bar, not from today', () => {
    // Newest bar is 23 Sep. A clock on 28 Sep must not drop that session.
    expect(barsWithinLatestDaySpan(bars, 5).map((b) => b.time)).toEqual([sep19, sep23]);
  });

  it('keeps only the newest session for a 1-day span', () => {
    expect(barsWithinLatestDaySpan(bars, 1).map((b) => b.time)).toEqual([sep23]);
  });

  it('returns every bar when the span is open-ended', () => {
    expect(barsWithinLatestDaySpan(bars, 0)).toEqual(bars);
  });
});
