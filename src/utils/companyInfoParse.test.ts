import { describe, expect, it } from 'vitest';
import {
  parsePipeSeries,
  periodLabels,
  rowsToFinancials,
  rowsToRatios,
  parsePercentValue,
  equitySnapshotFromSections,
  formatCompactPkAmount,
} from './companyInfoParse';
import type { CompanyFundamentalSection } from '../services/financials';

describe('parsePipeSeries', () => {
  it('splits toolkit pipe-separated values', () => {
    expect(parsePipeSeries('193,247,740 | 186,708,958 | 161,666,127')).toEqual([
      '193,247,740',
      '186,708,958',
      '161,666,127',
    ]);
  });

  it('handles empty / dash', () => {
    expect(parsePipeSeries('')).toEqual([]);
    expect(parsePipeSeries('-')).toEqual([]);
  });
});

describe('periodLabels', () => {
  it('marks most recent first', () => {
    expect(periodLabels(4)).toEqual(['Latest', '−1', '−2', '−3']);
  });
});

describe('rowsToFinancials', () => {
  it('builds annual-style rows from metric map', () => {
    const rows = rowsToFinancials({
      Sales: '100 | 90 | 80',
      'Profit after Taxation': '10 | 9 | 8',
      EPS: '2.0 | 1.8 | 1.6',
    });
    expect(rows).toHaveLength(3);
    expect(rows[0]).toMatchObject({
      year: 'Latest',
      sales: '100',
      profitAfterTax: '10',
      eps: '2.0',
    });
    expect(rows[2].sales).toBe('80');
  });
});

describe('rowsToRatios', () => {
  it('builds ratio rows including GPM', () => {
    const rows = rowsToRatios({
      'Gross Profit Margin (%)': '35 | 32',
      'Net Profit Margin (%)': '12 | 16',
      'EPS Growth (%)': '(21) | 17',
      PEG: '0.5 | 0.6',
    });
    expect(rows[0]).toMatchObject({
      year: 'Latest',
      grossProfitMargin: '35',
      netProfitMargin: '12',
      epsGrowth: '(21)',
      peg: '0.5',
    });
  });
});

describe('parsePercentValue', () => {
  it('parses dividend yield strings', () => {
    expect(parsePercentValue('7.88%')).toBeCloseTo(7.88);
    expect(parsePercentValue('(1Y)-27.94%')).toBeCloseTo(-27.94);
    expect(parsePercentValue('-')).toBeNull();
  });
});

describe('equitySnapshotFromSections', () => {
  it('reads equity profile fields', () => {
    const sections: CompanyFundamentalSection[] = [
      {
        category: 'Equity Profile',
        items: [
          { label: "Market Cap (000's)", value: '254,948,709.67' },
          { label: 'Shares', value: '1,335,299,375' },
          { label: 'Free Float', value: '600,884,719' },
          { label: 'Free Float', value: '45.00%' },
        ],
      },
      {
        category: 'Profile',
        items: [{ label: 'Website', value: 'http://www.engrofertilizers.com' }],
      },
    ];
    const snap = equitySnapshotFromSections(sections);
    expect(snap.marketCapRaw).toBe('254,948,709.67');
    expect(snap.freeFloatPct).toBe('45.00%');
    expect(snap.website).toBe('http://www.engrofertilizers.com');
  });
});

describe('formatCompactPkAmount', () => {
  it('formats thousands (000s) market cap to billions', () => {
    // 254,948,709.67 is already in 000's → ~255B PKR
    expect(formatCompactPkAmount('254,948,709.67', { unitIsThousands: true })).toMatch(/255/);
  });
});
