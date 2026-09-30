import { describe, expect, it } from 'vitest';
import { dividendReinvestedTotal } from './fundCash';
import { realizedNetOfCgt } from './realizedNet';

describe('income card figures', () => {
  it('sums reinvested dividends in rupees for funds and for stocks', () => {
    expect(dividendReinvestedTotal([
      { type: 'DIVIDEND', ticker: 'OGDC', quantity: 100, price: 5 },
      { type: 'DIVIDEND_REINVEST', ticker: 'DIV REINVEST', quantity: 1, price: 1500 },
      { type: 'DIVIDEND_REINVEST', ticker: 'MF:meezan-growth', quantity: 10, price: 100 },
    ])).toBe(2500);
  });

  it('nets realized gain by the tax on each sale', () => {
    expect(realizedNetOfCgt([
      { profit: 200, tax: 20 },
      { profit: 112, tax: 19 },
      { profit: 50, tax: 10, eventType: 'history' },
    ])).toBe(323);
  });
});
