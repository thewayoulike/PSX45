import { describe, expect, it, beforeEach } from 'vitest';
import {
  consumeDailyQuota,
  filterImportTickersForFree,
  karachiDayKey,
  peekChartViewsToday,
  peekDailyQuota,
  peekProfileOpens,
  tryRecordChartView,
  tryRecordProfileOpen,
} from './freemiumQuotas';

const STORE: Record<string, string> = {};

beforeEach(() => {
  for (const k of Object.keys(STORE)) delete STORE[k];
  (globalThis as any).localStorage = {
    getItem: (k: string) => (k in STORE ? STORE[k] : null),
    setItem: (k: string, v: string) => { STORE[k] = String(v); },
    removeItem: (k: string) => { delete STORE[k]; },
  };
});

describe('karachiDayKey', () => {
  it('returns YYYY-MM-DD in Asia/Karachi', () => {
    expect(karachiDayKey(new Date('2026-09-07T20:00:00Z'))).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

describe('tryRecordChartView', () => {
  it('allows up to limit unique symbols per day on Free', () => {
    const limit = 5;
    for (const s of ['OGDC', 'PPL', 'HBL', 'LUCK', 'ENGRO']) {
      expect(tryRecordChartView(s, limit).ok).toBe(true);
    }
    expect(peekChartViewsToday()).toHaveLength(5);
    expect(tryRecordChartView('SYS', limit).ok).toBe(false);
  });

  it('re-viewing the same symbol does not consume another slot', () => {
    expect(tryRecordChartView('OGDC', 5).ok).toBe(true);
    expect(tryRecordChartView('OGDC', 5).ok).toBe(true);
    expect(peekChartViewsToday()).toEqual(['OGDC']);
  });

  it('skips quota when limit is Infinity (Paid)', () => {
    expect(tryRecordChartView('OGDC', Number.POSITIVE_INFINITY).ok).toBe(true);
    expect(peekChartViewsToday()).toHaveLength(0);
  });
});

describe('consumeDailyQuota', () => {
  it('blocks after limit', () => {
    expect(consumeDailyQuota('export', 1).ok).toBe(true);
    expect(peekDailyQuota('export')).toBe(1);
    expect(consumeDailyQuota('export', 1).ok).toBe(false);
  });

  it('allows unlimited when Infinity', () => {
    expect(consumeDailyQuota('ai', Number.POSITIVE_INFINITY).ok).toBe(true);
    expect(peekDailyQuota('ai')).toBe(0);
  });
});

describe('tryRecordProfileOpen', () => {
  it('caps lifetime unique profiles', () => {
    for (let i = 0; i < 7; i++) {
      expect(tryRecordProfileOpen(`T${i}`, 7).ok).toBe(true);
    }
    expect(peekProfileOpens()).toHaveLength(7);
    expect(tryRecordProfileOpen('T99', 7).ok).toBe(false);
    expect(tryRecordProfileOpen('T0', 7).ok).toBe(true);
  });
});

describe('filterImportTickersForFree', () => {
  it('fills remaining first-3 slots then skips', () => {
    const { accepted, skipped } = filterImportTickersForFree(
      [
        { ticker: 'OGDC' },
        { ticker: 'PPL' },
        { ticker: 'HBL' },
        { ticker: 'SYS' },
      ],
      ['OGDC'],
      3,
    );
    expect(accepted.map((r) => r.ticker)).toEqual(['OGDC', 'PPL', 'HBL']);
    expect(skipped.map((r) => r.ticker)).toEqual(['SYS']);
  });
});
