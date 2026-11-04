import { describe, expect, it } from 'vitest';
import { stockDayPL } from './HoldingsTable';
import type { Holding, Transaction } from '../types';

const today = '2026-11-04';
const holding = (quantity: number, currentPrice: number) =>
  ({ ticker: 'UCAPM', broker: 'AKD', quantity, avgPrice: 22.94, currentPrice, sector: 'X' } as Holding);
const tx = (type: Transaction['type'], quantity: number, price: number, date = today) =>
  ({ id: `${type}${quantity}${price}${date}`, ticker: 'UCAPM', broker: 'AKD', type, quantity, price, date, portfolioId: 'p' } as Transaction);

describe('stock daily P&L per row', () => {
  it('counts shares bought today from the buy price, same as total P&L', () => {
    const day = stockDayPL(holding(17000, 22.87), 25.41, [tx('BUY', 17000, 22.94)], today);
    expect(day.change).toBeCloseTo(-1190, 2);
    expect(day.pct).toBeCloseTo(-0.305, 2);
  });
  it('counts older shares from the previous close', () => {
    const day = stockDayPL(holding(100, 11), 10, [tx('BUY', 100, 8, '2026-10-01')], today);
    expect(day.change).toBe(100);
  });
  it('mixes older shares and shares bought today', () => {
    const day = stockDayPL(holding(200, 11), 10, [tx('BUY', 100, 8, '2026-10-01'), tx('BUY', 100, 10.5)], today);
    expect(day.change).toBe(100 + 50);
    expect(day.base).toBe(1000 + 1050);
  });
  it('includes shares sold today up to their sale price', () => {
    const day = stockDayPL(holding(60, 11), 10, [tx('BUY', 100, 8, '2026-10-01'), tx('SELL', 40, 12)], today);
    expect(day.change).toBe(60 + 80);
  });
  it('ignores trades at another broker', () => {
    const other = { ...tx('BUY', 100, 5), broker: 'JS' };
    expect(stockDayPL(holding(100, 11), 10, [other], today).change).toBe(100);
  });
});
