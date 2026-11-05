import { describe, expect, it } from 'vitest';
import { pendingDividends } from './pendingDividends';
import { planReinvestTrim } from './fundCash';
import type { Transaction } from '../types';

const today = new Date('2026-11-05T00:00:00');
const holdings = [{ ticker: 'OGDC', quantity: 1000 }, { ticker: 'HUBC', quantity: 500 }];

describe('pending dividends', () => {
  it('lists upcoming and just-passed unrecorded dividends on held shares', () => {
    const list = pendingDividends({
      upcoming: [{ ticker: 'OGDC', announceDate: '', financialResult: '', details: 'Rs. 4.50 (Interim)', bookClosure: 'Ex-Date: 2026-11-20', isUpcoming: true }],
      recent: [
        { ticker: 'HUBC', amount: 5, exDate: '2026-10-25', type: 'Interim' },
        { ticker: 'LUCK', amount: 9, exDate: '2026-10-25', type: 'Interim' },
      ],
      holdings,
      transactions: [],
      today,
    });
    expect(list.map(p => [p.ticker, p.expected, p.passed])).toEqual([['HUBC', 2500, true], ['OGDC', 4500, false]]);
  });
  it('skips a passed dividend that is already recorded', () => {
    const list = pendingDividends({
      upcoming: [], recent: [{ ticker: 'HUBC', amount: 5, exDate: '2026-10-25', type: 'Interim' }],
      holdings, transactions: [{ type: 'DIVIDEND', ticker: 'HUBC', date: '2026-11-01' }], today,
    });
    expect(list).toEqual([]);
  });
});

describe('fix extra reinvest', () => {
  it('trims the newest reinvest rows and moves the money to a deposit', () => {
    const rows = [
      { id: 'a', type: 'DIVIDEND_REINVEST', ticker: 'DIV REINVEST', price: 30000, date: '2026-09-01' },
      { id: 'b', type: 'DIVIDEND_REINVEST', ticker: 'DIV REINVEST', price: 2000, date: '2026-10-01' },
    ] as Transaction[];
    expect(planReinvestTrim(rows, 3065.1)).toEqual({
      changes: [{ id: 'b', price: 0 }, { id: 'a', price: 28934.9 }],
      deposit: { date: '2026-10-01', amount: 3065.1 },
    });
  });
});
