import { describe, expect, it } from 'vitest';
import { portfolioValueSeries } from './portfolioValueSeries';
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
});
