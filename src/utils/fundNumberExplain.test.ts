import { describe, expect, it } from 'vitest';
import { explainFundCash, explainFundValue, explainNetInvested } from './fundNumberExplain';

const fund = 'MF:meezan-growth';

describe('why this number for funds', () => {
  it('explains fund value as units times NAV, with cost kept separate from bonus units', () => {
    const explained = explainFundValue([
      { name: 'Meezan Growth', units: 110, avgNav: 10000 / 110, nav: 100 },
    ]);
    expect(explained.total).toBeCloseTo(11_000, 4);
    expect(explained.cost).toBeCloseTo(10_000, 4);
    expect(explained.gain).toBeCloseTo(1_000, 4);
    expect(explained.lines.map(line => line.label)).toContain('Meezan Growth');
  });

  it('builds the cash balance from deposits, subscriptions, redemptions, and withdrawals', () => {
    const explained = explainFundCash([
      { type: 'DEPOSIT', ticker: 'CASH', quantity: 1, price: 100_000, date: '2026-01-01' },
      { type: 'BUY', ticker: fund, quantity: 1000, price: 90, date: '2026-01-02' },
      { type: 'DIVIDEND', ticker: fund, quantity: 1000, price: 5, tax: 750, date: '2026-03-01' },
      { type: 'DIVIDEND_REINVEST', ticker: fund, quantity: 10, price: 100, date: '2026-03-01' },
      { type: 'REFUND_OF_CAPITAL', ticker: fund, quantity: 5, price: 0, date: '2026-03-01' },
      { type: 'SELL', ticker: fund, quantity: 100, price: 110, tax: 200, date: '2026-06-01' },
      { type: 'WITHDRAWAL', ticker: 'CASH', quantity: 1, price: 5_000, date: '2026-06-02' },
      { type: 'TAX', ticker: 'CGT', quantity: 1, price: 1_000, date: '2026-06-03' },
    ]);
    expect(explained.total).toBeCloseTo(14_800, 4);
    const counted = explained.lines.filter(line => line.countsInTotal).map(line => line.label);
    expect(counted).toEqual([
      'Deposits',
      'Subscriptions, with charges',
      'Redemptions, after charges',
      'Withdrawals',
      'Tax paid from this cash',
    ]);
    const parked = explained.lines.filter(line => !line.countsInTotal);
    expect(parked.map(line => line.label)).toEqual([
      'Dividends reinvested as units',
      'Bonus units',
    ]);
    expect(parked.every(line => line.amount === 0)).toBe(true);
  });

  it('names stock cash lines as buys and sells and keeps bonus shares out of cash', () => {
    const explained = explainFundCash([
      { type: 'DEPOSIT', ticker: 'CASH', quantity: 1, price: 100_000, date: '2026-01-01' },
      { type: 'BUY', ticker: 'OGDC', quantity: 1000, price: 6, date: '2026-01-02' },
      { type: 'SELL', ticker: 'OGDC', quantity: 100, price: 7, date: '2026-02-01' },
      { type: 'BONUS', ticker: 'OGDC', quantity: 100, price: 0, date: '2026-03-01' },
    ], 'stock');
    expect(explained.lines.map(line => line.label)).toEqual([
      'Deposits',
      'Buys, with charges',
      'Sells, after charges',
      'Bonus shares',
    ]);
    expect(explained.lines.find(line => line.label === 'Bonus shares')?.countsInTotal).toBe(false);
    expect(explained.total).toBeCloseTo(100_000 - 6_000 + 700, 4);
  });

  it('shows withdrawals that were profit so net invested still adds up', () => {
    const explained = explainNetInvested(
      [
        { type: 'DEPOSIT', ticker: 'CASH', quantity: 1, price: 100_000 },
        { type: 'WITHDRAWAL', ticker: 'CASH', quantity: 1, price: 30_000 },
      ],
      80_000,
    );
    expect(explained.total).toBe(80_000);
    expect(explained.lines.find(line => line.label === 'Withdrawn from profit')?.amount).toBe(10_000);
  });
});
