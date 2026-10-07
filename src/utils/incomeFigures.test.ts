import { describe, expect, it } from 'vitest';
import { dividendReinvestedTotal } from './fundCash';
import { netAfterSeparateCgt } from './realizedNet';

describe('income card figures', () => {
  it('sums reinvested dividends in rupees for funds and for stocks', () => {
    expect(dividendReinvestedTotal([
      { type: 'DIVIDEND', ticker: 'OGDC', quantity: 100, price: 5 },
      { type: 'DIVIDEND_REINVEST', ticker: 'DIV REINVEST', quantity: 1, price: 1500 },
      { type: 'DIVIDEND_REINVEST', ticker: 'MF:meezan-growth', quantity: 10, price: 100 },
    ])).toBe(2500);
  });

  it('subtracts capital gains tax once from profit that already nets sale tax', () => {
    expect(netAfterSeparateCgt(-62884, 200)).toBe(-63084);
    expect(netAfterSeparateCgt(1000, 0)).toBe(1000);
  });
});
