import { describe, expect, it } from 'vitest';
import { pendingDividends, eligibleQtyForExDate } from './pendingDividends';
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
  it('does not count shares bought on or after the ex-date', () => {
    const list = pendingDividends({
      upcoming: [{ ticker: 'OGDC', announceDate: '', financialResult: '', details: 'Rs. 5.00 (Interim)', bookClosure: 'Ex-Date: 2026-11-20', isUpcoming: true }],
      recent: [{ ticker: 'HUBC', amount: 5, exDate: '2026-10-25', type: 'Interim' }],
      holdings,
      transactions: [
        { type: 'BUY', ticker: 'HUBC', date: '2026-10-25', quantity: 500 },
        { type: 'BUY', ticker: 'OGDC', date: '2026-11-02', quantity: 400 },
      ],
      today,
    });
    expect(list.map(p => [p.ticker, p.qty])).toEqual([['OGDC', 1000]]);
  });
  it('eligible shares: undo buys on/after the ex-date, keep shares sold on/after it', () => {
    const tx = [
      { type: 'BUY' as const, ticker: 'OGDC', date: '2026-11-01', quantity: 300 },
      { type: 'BUY' as const, ticker: 'OGDC', date: '2026-11-10', quantity: 500 },
      { type: 'SELL' as const, ticker: 'OGDC', date: '2026-11-11', quantity: 100 },
    ];
    expect(eligibleQtyForExDate(700, 'OGDC', '2026-11-10', tx)).toBe(300);
    expect(eligibleQtyForExDate(500, 'OGDC', '2026-11-10', [tx[1]])).toBe(0);
    expect(eligibleQtyForExDate(700, 'OGDC', '2026-11-20', tx)).toBe(700);
  });
});
