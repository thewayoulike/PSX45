import { describe, expect, it } from 'vitest';
import { portfolioValueSeries } from './portfolioValueSeries';
import { investedCapitalHistory } from './peakCapital';
describe('recorded portfolio values', () => {
  it('keeps missing prices out, includes cash-inclusive values and sorts without inventing points', () => {
    expect(portfolioValueSeries([{ rawDate: '2026-10-28', netWorth: 200 }, { rawDate: '2026-10-27', netWorth: null }, { rawDate: '2026-10-26', netWorth: 0 }, { rawDate: '2026-10-30', netWorth: 500 }], 'MAX', '2026-10-29')).toEqual([{ date: '2026-10-26', value: 0 }, { date: '2026-10-28', value: 200 }]);
  });
  it('filters the selected calendar range, removes duplicates and never extends limited history', () => {
    const rows = [{ rawDate: '2025-12-31', netWorth: 80 }, { rawDate: '2026-01-01', netWorth: 100 }, { rawDate: '2026-10-23', netWorth: 120 }, { rawDate: '2026-10-23', netWorth: 125 }];
    expect(portfolioValueSeries(rows, '1W', '2026-10-29')).toEqual([{ date: '2026-10-23', value: 125 }]);
    expect(portfolioValueSeries(rows, 'YTD', '2026-10-29')).toHaveLength(2);
    expect(portfolioValueSeries(rows, '1D', '2026-10-29')).toEqual([]);
  });
  it('pairs saved valuations with invested capital at that date, including capital before the visible range', () => {
    const invested = investedCapitalHistory([
      { date: '2026-01-01', type: 'IN', amount: 1000, originalIndex: 0 },
      { date: '2026-10-24', type: 'IN', amount: 500, originalIndex: 1 },
      { date: '2026-11-01', type: 'IN', amount: 9000, originalIndex: 2 },
    ], false).points;
    const rows = [
      { rawDate: '2026-10-23', netWorth: 1100 },
      { rawDate: '2026-10-26', netWorth: 1400 },
      { rawDate: '2026-10-27', netWorth: null },
      { rawDate: '2026-10-28', netWorth: 1600 },
    ];
    for (const range of ['1W', '6M', 'YTD', 'MAX'] as const) {
      const points = portfolioValueSeries(rows, range, '2026-10-29', invested);
      expect(points.map(p => p.netInvested)).toEqual([1000, 1500, 1500]);
      expect(points.map(p => p.value - p.netInvested!)).toEqual([100, -100, 100]);
    }
  });
  it('distinguishes a zero invested balance from an unavailable comparison', () => {
    const rows = [{ rawDate: '2026-10-29', netWorth: 10 }];
    expect(portfolioValueSeries(rows, 'MAX', '2026-10-29', [])[0].netInvested).toBe(0);
    expect(portfolioValueSeries(rows, 'MAX', '2026-10-29')[0].netInvested).toBeUndefined();
  });
});
