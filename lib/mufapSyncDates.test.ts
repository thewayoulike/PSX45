import { describe, expect, it } from 'vitest';
import { addDaysYmd, candidateNavDates, pkToday } from './mufapSyncDates.js';

describe('mufapSyncDates', () => {
  it('adds calendar days across month boundaries', () => {
    expect(addDaysYmd('2026-09-21', -1)).toBe('2026-09-20');
    expect(addDaysYmd('2026-10-01', -1)).toBe('2026-09-30');
  });

  it('lists newest-first lookback dates for late NAV publishes', () => {
    expect(candidateNavDates('2026-09-21', 3)).toEqual([
      '2026-09-21',
      '2026-09-20',
      '2026-09-19',
    ]);
  });

  it('pkToday returns YYYY-MM-DD', () => {
    expect(pkToday(new Date('2026-09-21T18:00:00Z'))).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});
