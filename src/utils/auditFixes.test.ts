import { describe, expect, it } from 'vitest';
import { toDatePK } from './dates';
import { stockDayChange } from './stockDayPL';
import { firstOversell } from './holdingChecks';
import { oversellCashCredit } from './oversellCash';
import { applyPriceStack } from '../../lib/priceStack.js';

describe('audit regressions', () => {
  it('parses Pakistan dates and does not invent today for junk', () => {
    expect(toDatePK('15/08/2026')).toBe('2026-08-15');
    expect(toDatePK('03/08/2026')).toBe('2026-08-03');
    expect(toDatePK('15-Aug-2026')).toBe('2026-08-15');
    expect(toDatePK('Aug 15, 2026')).toBe('2026-08-15');
    expect(toDatePK(44966.9)).toBe('2023-02-09');
    expect(toDatePK('not-a-date')).toBe('');
  });

  it('prices shares bought today from the trade, not yesterday close', () => {
    expect(stockDayChange({
      quantity: 100, current: 111, ldcp: 100,
      trades: [{ type: 'BUY', quantity: 100, price: 110 }],
    })).toBe(100);
  });

  it('rejects a batch sell larger than the shares held at that broker', () => {
    const bad = firstOversell(
      [{ type: 'SELL', ticker: 'OGDC', brokerId: 'b1', quantity: 1000, date: '2026-09-01' }],
      () => 10,
    );
    expect(bad?.ticker).toBe('OGDC');
  });

  it('does not credit cash for shares that were never held', () => {
    expect(oversellCashCredit([
      { type: 'BUY', ticker: 'OGDC', quantity: 100, price: 10, date: '2026-01-01' },
      { type: 'SELL', ticker: 'OGDC', quantity: 150, price: 12, date: '2026-01-02' },
    ])).toBe(1200);
  });

  it('still credits a sale of shares that arrived by transfer', () => {
    expect(oversellCashCredit([
      { type: 'TRANSFER_IN', ticker: 'OGDC', quantity: 100, price: 10, date: '2026-01-01' },
      { type: 'SELL', ticker: 'OGDC', quantity: 100, price: 12, date: '2026-02-01' },
    ])).toBe(1200);
  });

  it('keeps the live price when the session is open', () => {
    expect(applyPriceStack({ OGDC: 111 }, { OGDC: 90 }, {}, true)).toEqual({ OGDC: 111 });
    expect(applyPriceStack({}, { OGDC: 90 }, {}, true)).toEqual({ OGDC: 90 });
    expect(applyPriceStack({ OGDC: 111 }, { OGDC: 90 }, { OGDC: 112 }, true)).toEqual({ OGDC: 112 });
  });
});
