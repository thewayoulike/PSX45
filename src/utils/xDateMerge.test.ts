import { describe, expect, it } from 'vitest';
import {
  companyInfoToUpcomingPayouts,
  mergeXDatePayouts,
  normalizeExDateIso,
  payoutDedupeKey,
  uniqueTickers,
} from './xDateMerge';
import type { CompanyPayout } from '../types';

const sheetPayout = (ticker: string, ex: string, details = 'Div: Rs. 5.00'): CompanyPayout => ({
  ticker,
  announceDate: '-',
  financialResult: '-',
  details,
  bookClosure: `Ex-Date: ${ex}`,
  isUpcoming: true,
});

describe('normalizeExDateIso', () => {
  it('normalizes ISO and slash dates to YYYY-MM-DD', () => {
    expect(normalizeExDateIso('2026-04-15')).toBe('2026-04-15');
    expect(normalizeExDateIso('4/15/2026')).toBe('2026-04-15');
  });

  it('returns null for blanks and garbage', () => {
    expect(normalizeExDateIso('-')).toBeNull();
    expect(normalizeExDateIso('')).toBeNull();
    expect(normalizeExDateIso('n/a')).toBeNull();
  });
});

describe('payoutDedupeKey', () => {
  it('keys by ticker + ex-date', () => {
    expect(payoutDedupeKey(sheetPayout('efert', '2026-04-15'))).toBe('EFERT|2026-04-15');
  });
});

describe('mergeXDatePayouts', () => {
  it('keeps sheet rows and adds pyPSX gaps', () => {
    const sheet = [sheetPayout('EFERT', '2026-04-15', 'Div: Rs. 8.00')];
    const py = [
      sheetPayout('EFERT', '2026-04-15', 'Div: Rs. 99.00'), // conflict — sheet wins
      sheetPayout('OGDC', '2026-05-01', 'Div: Rs. 6.00'),
    ];
    const merged = mergeXDatePayouts(sheet, py);
    expect(merged).toHaveLength(2);
    expect(merged.find((p) => p.ticker === 'EFERT')?.details).toBe('Div: Rs. 8.00');
    expect(merged.find((p) => p.ticker === 'OGDC')?.details).toBe('Div: Rs. 6.00');
  });

  it('returns pyPSX-only when sheet is empty', () => {
    const merged = mergeXDatePayouts([], [sheetPayout('HBL', '2026-06-01')]);
    expect(merged).toHaveLength(1);
    expect(merged[0].ticker).toBe('HBL');
  });

  it('sorts soonest ex-date first', () => {
    const merged = mergeXDatePayouts(
      [sheetPayout('B', '2026-08-01')],
      [sheetPayout('A', '2026-03-01')]
    );
    expect(merged.map((p) => p.ticker)).toEqual(['A', 'B']);
  });
});

describe('companyInfoToUpcomingPayouts', () => {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const pad = (n: number) => String(n).padStart(2, '0');
  const future = (days: number) => {
    const d = new Date(today);
    d.setDate(d.getDate() + days);
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  };
  const past = (days: number) => future(-days);

  it('emits future latest + history ex-dates only', () => {
    const rows = companyInfoToUpcomingPayouts({
      symbol: 'OGDC',
      latestDividend: {
        dividendYield: '5%',
        annualDividend: '-',
        cashAmount: '6.000 PKR',
        exDividendDate: future(10),
        payoutFrequency: '-',
        payoutRatio: '-',
        dividendGrowth: '-',
      },
      dividendHistory: [
        { exDividendDate: past(30), cashAmount: '5 PKR', recordDate: '-', payDate: '-' },
        { exDividendDate: future(40), cashAmount: '7 PKR', recordDate: '-', payDate: '-' },
      ],
    });
    expect(rows.map((r) => r.bookClosure.replace('Ex-Date: ', '').trim()).sort()).toEqual(
      [future(10), future(40)].sort()
    );
    expect(rows.every((r) => r.ticker === 'OGDC' && r.isUpcoming)).toBe(true);
    expect(rows[0].details).toMatch(/Div:/);
  });

  it('skips missing or past-only dividend data', () => {
    expect(
      companyInfoToUpcomingPayouts({
        symbol: 'XYZ',
        latestDividend: null,
        dividendHistory: [
          { exDividendDate: past(5), cashAmount: '1', recordDate: '-', payDate: '-' },
        ],
      })
    ).toEqual([]);
  });
});

describe('uniqueTickers', () => {
  it('dedupes holdings and watchlist, uppercases, drops blanks', () => {
    expect(uniqueTickers(['efert', 'OGDC'], ['OGDC', '', 'hbl', 'efert'])).toEqual([
      'EFERT',
      'OGDC',
      'HBL',
    ]);
  });
});
