import { describe, expect, it } from 'vitest';
import {
  addDaysYmd,
  candidateNavDates,
  candidatePrevNavDates,
  pkToday,
  previousBusinessDay,
} from './mufapSyncDates.js';

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

  it('previous business day skips Sat/Sun (Mon → Fri)', () => {
    // 2026-09-21 is Monday; prior NAV day is Friday 2026-09-18
    expect(previousBusinessDay('2026-09-21')).toBe('2026-09-18');
    expect(previousBusinessDay('2026-09-22')).toBe('2026-09-21');
    expect(previousBusinessDay('2026-09-19')).toBe('2026-09-18'); // Sat → Fri
  });

  it('prev-NAV candidates prefer business days before weekends', () => {
    expect(candidatePrevNavDates('2026-09-21', 3)).toEqual([
      '2026-09-18',
      '2026-09-17',
      '2026-09-16',
    ]);
  });

  it('pkToday returns YYYY-MM-DD', () => {
    expect(pkToday(new Date('2026-09-21T18:00:00Z'))).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});
