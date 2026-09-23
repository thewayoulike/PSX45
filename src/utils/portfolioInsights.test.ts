import { describe, expect, it } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { buildPortfolioInsights, holdingCost, recordedCosts } from './portfolioInsights';
import { PortfolioInsights } from '../components/PortfolioInsights';
import { Holding, PortfolioStats, RealizedTrade, Transaction } from '../types';
const now = new Date('2026-09-21T12:00:00Z');
const holding = (overrides: Partial<Holding> = {}): Holding => ({ ticker: 'AAA', sector: 'Energy', quantity: 10, avgPrice: 100, currentPrice: 90, totalCommission: 0, totalTax: 0, totalCDC: 0, totalOtherFees: 0, lastUpdated: now.toISOString(), priceAvailable: true, ...overrides });
const lot = (overrides: Partial<RealizedTrade> = {}): RealizedTrade => ({ id: 'sale-m0', ticker: 'AAA', quantity: 10, buyAvg: 100, sellPrice: 110, date: '2026-09-21', profit: 100, fees: 0, commission: 0, tax: 0, cdcCharges: 0, otherFees: 0, ...overrides });
const tx = (overrides: Partial<Transaction> = {}): Transaction => ({ id: 'tx', portfolioId: 'p', ticker: 'AAA', type: 'BUY', quantity: 1, price: 100, date: '2026-09-21', commission: 0, tax: 0, cdcCharges: 0, otherFees: 0, ...overrides });
const stats: PortfolioStats = { totalValue: 900, totalCost: 1000, unrealizedPL: -100, unrealizedPLPercent: -10, realizedPL: -200, netRealizedPL: -200, totalDividends: 25, totalDividendTax: 5, dailyPL: -10, dailyPLPercent: -1, dailyPreviousValue: 910, dailyMissingPrevious: false, dailyByTicker: { AAA: -10 }, freeCash: 10, totalCommission: 0, totalSalesTax: 0, totalCDC: 0, totalOtherFees: 0, totalCGT: 0, cashInvestment: 1000, totalDeposits: 1000, netPrincipal: 1000, peakNetPrincipal: 1000, reinvestedProfits: 0, roi: -27.5, mwrr: null };
const build = (h = [holding()], t = [lot()], s = stats, d = now) => buildPortfolioInsights(h, t, [], s, d);

describe('verified Insights calculations', () => {
  it('aggregates the same stock across brokers before ranking, counting or concentration', () => {
    const result = build([holding({ broker: 'A' }), holding({ broker: 'B' }), holding({ ticker: 'BBB', currentPrice: 100 }), holding({ ticker: 'CCC', currentPrice: 50 })]);
    expect(result.positions).toHaveLength(3);
    expect(result.underwater).toBe(2);
    expect(result.top.map(p => p.ticker)).toEqual(['AAA', 'BBB', 'CCC']);
    expect(result.topPercent).toBe(100);
    expect(result.totalValue).toBe(3300);
  });
  it('keeps the unrounded stock cost so it matches realized lots, and four-place fund NAV', () => {
    expect(holdingCost(holding({ avgPrice: 10.004, quantity: 30000 }))).toBeCloseTo(300120, 5);
    expect(holdingCost(holding({ ticker: 'MF:test', avgPrice: 123.4567 }))).toBe(1234.567);
  });
  it('distinguishes a small percentage loss from the largest rupee loss', () => {
    const result = build([holding({ ticker: 'SMALL', currentPrice: 50 }), holding({ ticker: 'LARGE', quantity: 100, currentPrice: 90 })]);
    expect(result.bestHolding.ticker).toBe('LARGE');
    expect(result.worstHolding.ticker).toBe('SMALL');
    expect(result.largestLoss.ticker).toBe('LARGE');
  });
  it('does not mistake matched lots for sale orders and excludes historical adjustment rows', () => {
    const result = build(undefined, [lot(), lot({ id: 'sale-m1', profit: -200 }), lot({ id: 'sale2-m2', profit: 0 }), lot({ ticker: 'PREV-PNL', profit: 10000 })]);
    expect(result.lots).toHaveLength(3);
    expect(result.winRate).toBeCloseTo(100 / 3);
    expect(result.flat).toBe(1);
    expect(result.avgWin).toBe(100); expect(result.avgLoss).toBe(200); expect(result.profitFactor).toBe(0.5);
  });
  it('uses Pakistan month boundaries and ranks only the lots closed in that month', () => {
    const result = build(undefined, [lot({ ticker: 'SEPT', date: '2026-09-30', profit: 900 }), lot({ ticker: 'OCT', date: '2026-10-01', profit: 50 })], stats, new Date('2026-09-30T20:00:00Z'));
    expect(result.monthKey).toBe('2026-10'); expect(result.bestMonth.ticker).toBe('OCT');
  });
  it('uses previous holdings value for daily percentage, never purchase cost', () => {
    expect(build().dailyPercent).toBeCloseTo(-10 / 910 * 100);
    expect(build(undefined, undefined, { ...stats, dailyMissingPrevious: true }).dailyPercent).toBeNull();
    expect(build(undefined, undefined, { ...stats, dailyPreviousValue: 0 }).dailyPercent).toBeNull();
  });
  it('qualifies undated/stale prices and suppresses returns for cost fallback prices', () => {
    const result = build([holding({ lastUpdated: '2026-09-01T00:00:00Z' }), holding({ ticker: 'BBB', lastUpdated: undefined, priceAvailable: false })]);
    expect(result.oldPrices).toBe(true); expect(result.missingTimestamps).toBe(1);
    expect(result.missingPrices).toBe(1); expect(result.dailyPercent).toBeNull();
  });
  it('counts all recorded tax once, including fund withholding and standalone fees/taxes', () => {
    const result = recordedCosts([
      tx({ commission: 10, tax: 2, cdcCharges: 3, otherFees: 4 }),
      tx({ type: 'SELL', ticker: 'MF:test', tax: 20 }),
      tx({ type: 'DIVIDEND', tax: 5 }), tx({ type: 'DIVIDEND_REINVEST', tax: 6 }),
      tx({ type: 'TAX', price: 30 }), tx({ type: 'ANNUAL_FEE', price: 40 }),
      tx({ type: 'OTHER', category: 'CDC_CHARGE', price: -7 }),
      tx({ type: 'OTHER', category: 'OTHER_TAX', price: -8 }),
      tx({ type: 'HISTORY', price: 10000, tax: 9 }),
    ]);
    expect(result).toEqual({ fees: 64, taxes: 80, dividendTax: 11 });
  });
  it('shows actual dividends in losing portfolios and exposes metric definitions', () => {
    const html = renderToStaticMarkup(React.createElement(PortfolioInsights, { holdings: [holding()], realizedTrades: [lot({ profit: -200 })], transactions: [], stats }));
    expect(html).toContain('Net dividend income'); expect(html).toContain('Rs 25.00');
    expect(html).not.toContain('0.00% of your total returns'); expect(html).not.toContain('gross gains');
    expect(html).toContain('How these figures are calculated');
  });
  it('has no best winning exit when all lots lose and no infinite ratio with no losses', () => {
    expect(build(undefined, [lot({ profit: -1 })]).bestExit).toBeUndefined();
    expect(build().worstExit).toBeUndefined(); expect(build().profitFactor).toBeNull();
    expect(build([], [], { ...stats, totalValue: 0, freeCash: 0 }).cashPercent).toBeNull();
  });
});
