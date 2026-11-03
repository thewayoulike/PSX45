import { describe, expect, it } from 'vitest';
import { computeHoldings, computePortfolioStats } from './portfolioEngine';
import type { Transaction } from '../types';

let seq = 0;
const tx = (type: Transaction['type'], ticker: string, quantity: number, price: number, date: string, fees: Partial<Transaction> = {}): Transaction => ({
  id: `t${++seq}`, portfolioId: 'p1', type, ticker, quantity, price, date, broker: 'AKD',
  commission: 0, tax: 0, cdcCharges: 0, otherFees: 0, createdAt: `${date}T0${seq % 10}:00:00Z`, ...fees,
});
const portfolios = [{ id: 'p1', name: 'Main', defaultBrokerId: 'b1' }];

function run(transactions: Transaction[], prices: Record<string, number>) {
  const base = { portfolioTransactions: transactions, fundCatalog: {}, sectorOverrides: {}, portfolios, currentPortfolioId: 'p1', manualPrices: prices, priceTimestamps: {} };
  const { holdings, realizedTrades } = computeHoldings(base);
  const stats = computePortfolioStats({ ...base, holdings, realizedTrades, ldcpMap: {}, marketSessionDate: null, fundNavDayMap: {}, isCombinedView: false, combinedPortfolioIds: new Set() });
  return { holdings, realizedTrades, stats };
}

describe('portfolio engine', () => {
  it('sells the oldest lot first and books fees into cost and profit', () => {
    const { holdings, realizedTrades, stats } = run([
      tx('DEPOSIT', '', 1, 20000, '2026-01-02'),
      tx('BUY', 'OGDC', 100, 100, '2026-01-05', { commission: 50 }),
      tx('BUY', 'OGDC', 50, 110, '2026-01-06'),
      tx('SELL', 'OGDC', 120, 120, '2026-02-01', { commission: 24 }),
    ], { OGDC: 130 });
    // 100 from the first lot (cost 100.5) and 20 from the second (cost 110).
    expect(realizedTrades.map((r) => [r.quantity, r.buyAvg])).toEqual([[100, 100.5], [20, 110]]);
    expect(realizedTrades.reduce((s, r) => s + r.profit, 0)).toBeCloseTo(100 * 120 - 10050 - 20 + 20 * 120 - 2200 - 4);
    expect(holdings).toHaveLength(1);
    expect(holdings[0]).toMatchObject({ ticker: 'OGDC', quantity: 30, avgPrice: 110, currentPrice: 130 });
    expect(stats.totalValue).toBeCloseTo(3900);
    expect(stats.unrealizedPL).toBeCloseTo(600);
    expect(stats.totalCommission).toBeCloseTo(74);
  });

  it('squares off a same-day buy and sell before touching older shares', () => {
    const { holdings, realizedTrades } = run([
      tx('BUY', 'HUBC', 100, 100, '2026-01-05'),
      tx('BUY', 'HUBC', 50, 90, '2026-03-01'),
      tx('SELL', 'HUBC', 50, 95, '2026-03-01'),
    ], { HUBC: 100 });
    expect(realizedTrades[0]).toMatchObject({ quantity: 50, buyAvg: 90 });
    expect(holdings[0]).toMatchObject({ quantity: 100, avgPrice: 100 });
  });

  it('counts dividends net of tax', () => {
    const { stats } = run([
      tx('BUY', 'MEBL', 10, 200, '2026-01-05'),
      tx('DIVIDEND', 'MEBL', 10, 5, '2026-02-05', { tax: 7.5 }),
    ], { MEBL: 200 });
    expect(stats.totalDividends).toBeCloseTo(42.5);
  });
});
