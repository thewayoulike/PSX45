import { describe, expect, it } from 'vitest';
import type { Transaction } from '../types';
import { buildPerformanceHistory, compoundPerformance, performanceSourceKey, stockBalances, stockDayPerformance, withLivePerformance, type HistoryPoint } from './stockPerformance';

const date = '2026-10-19';
const tx = (overrides: Partial<Transaction> = {}): Transaction => ({ id: 'trade', portfolioId: 'p', ticker: 'PSO', type: 'BUY', date: '2026-10-15', quantity: 100, price: 10, commission: 0, tax: 0, cdcCharges: 0, otherFees: 0, ...overrides });
const point = (dateStr: string, price: number): HistoryPoint => ({ dateStr, price, time: Date.parse(`${dateStr}T12:00:00+05:00`) });
const history = { KSE100: [point('2026-10-16', 1000), point(date, 997.3)], KMI30: [point('2026-10-16', 2000), point(date, 1994.8)], PSO: [point('2026-10-16', 10), point(date, 9.92)] };
const now = new Date('2026-10-19T14:00:00+05:00');

describe('shared daily trading P&L', () => {
  it('uses opening market value, not purchase cost', () => {
    const result = stockDayPerformance([tx({ price: 6 })], date, { PSO: 10 }, { PSO: 11 });
    expect(result).toMatchObject({ pnl: 100, capital: 1000, percent: 10 });
  });
  it('uses the actual amount paid for a same-day purchase', () => {
    const result = stockDayPerformance([tx({ date, price: 11 })], date, {}, { PSO: 12 });
    expect(result.pnl).toBe(100);
    expect(result.capital).toBe(1100);
    expect(result.percent).toBeCloseTo(100 / 1100 * 100);
  });
  it.each([[40, 140, 660], [100, 200, 0]])('includes selling %i shares, including a fully closed position', (quantity, pnl, marketValue) => {
    const result = stockDayPerformance([tx(), tx({ date, type: 'SELL', quantity, price: 12 })], date, { PSO: 10 }, quantity === 100 ? {} : { PSO: 11 });
    expect(result).toMatchObject({ pnl, capital: 1000, marketValue });
    expect(result.percent).toBeCloseTo(pnl / 10);
  });
  it('includes an intraday round trip even without a remaining holding or quote', () => {
    expect(stockDayPerformance([tx({ date }), tx({ date, type: 'SELL', price: 12 })], date, {}, {}))
      .toMatchObject({ pnl: 200, capital: 1000, percent: 20, marketValue: 0 });
  });
  it('counts same-symbol trades once across brokers and portfolios', () => {
    const result = stockDayPerformance([tx({ broker: 'A' }), tx({ broker: 'B', portfolioId: 'p2' }), tx({ date, broker: 'A', type: 'SELL', quantity: 40, price: 12 })], date, { PSO: 10 }, { PSO: 11 });
    expect(result).toMatchObject({ pnl: 240, capital: 2000, percent: 12, byTicker: { PSO: 240 } });
  });
  it('marks transfers at the previous close, not their original cost basis', () => {
    expect(stockDayPerformance([tx({ date, type: 'TRANSFER_IN', price: 2 })], date, { PSO: 10 }, { PSO: 11 }))
      .toMatchObject({ pnl: 100, capital: 1000, percent: 10 });
    expect(stockDayPerformance([tx(), tx({ date, type: 'TRANSFER_OUT', price: 2 })], date, { PSO: 10 }, {}))
      .toMatchObject({ pnl: 0, capital: 1000, percent: 0 });
  });
  it('does not dilute returns when shares move between included brokers', () => {
    const result = stockDayPerformance([tx({ broker: 'A' }), tx({ date, broker: 'A', type: 'TRANSFER_OUT', price: 2 }), tx({ date, broker: 'B', type: 'TRANSFER_IN', price: 2 })], date, { PSO: 10 }, { PSO: 11 });
    expect(result).toMatchObject({ pnl: 100, capital: 1000, percent: 10 });
  });
  it('requires every held price instead of returning a partial portfolio percentage', () => {
    const result = stockDayPerformance([tx(), tx({ ticker: 'SYS' })], date, { PSO: 10, SYS: 10 }, { PSO: 11 });
    expect(result.percent).toBeNull();
    expect(result.marketValue).toBeNull();
    expect(result.missing).toEqual(['SYS']);
  });
  it('does not fabricate a zero return with no capital at risk', () => {
    expect(stockDayPerformance([], date, {}, {}).percent).toBeNull();
  });
  it('excludes cash rows and fund units from the stock calculation', () => {
    expect(stockDayPerformance([tx(), tx({ ticker: 'MF:fund' }), tx({ type: 'DEPOSIT', ticker: '', price: 500 })], date, { PSO: 10 }, { PSO: 11 }).percent).toBe(10);
  });
});

describe('corporate actions and dated history', () => {
  it('reconstructs broker-specific split, bonus and rights quantities before later returns', () => {
    const transactions = [tx({ broker: 'A' }), tx({ broker: 'B' }), tx({ date: '2026-10-16', broker: 'A', type: 'SPLIT', price: 2 }), tx({ date: '2026-10-16', broker: 'B', type: 'BONUS', quantity: 10, price: 0 }), tx({ date: '2026-10-16', broker: 'A', type: 'RIGHTS', quantity: 20, price: 5 })];
    expect(stockBalances(transactions, date)).toEqual({ PSO: 330 });
    expect(stockDayPerformance(transactions, date, { PSO: 10 }, { PSO: 11 })).toMatchObject({ pnl: 330, capital: 3300, percent: 10 });
    expect(stockDayPerformance(transactions, '2026-10-16', { PSO: 20 }, { PSO: 10 })).toMatchObject({ percent: null, corporateActions: ['PSO'] });
  });
  it('does not apply a split to purchases made on its effective day', () => {
    expect(stockBalances([tx(), tx({ date, type: 'SPLIT', price: 2 }), tx({ date, quantity: 50 })], date)).toEqual({ PSO: 250 });
  });
  it('requires the immediately previous index session, not an older stock price', () => {
    const rows = buildPerformanceHistory([tx()], { ...history, PSO: [point('2026-10-15', 10), point(date, 9.92)] }, now);
    expect(rows[0].Portfolio).toBeNull();
    expect(rows[0].missing).toEqual(['PSO']);
    expect(rows[0].KSE100).toBeCloseTo(-0.27);
  });
  it('uses the same trade-aware formula for historical and current P&L', () => {
    const transactions = [tx(), tx({ date, type: 'SELL', price: 12, quantity: 40 })];
    const rows = buildPerformanceHistory(transactions, history, now);
    const daily = stockDayPerformance(transactions, date, { PSO: 10 }, { PSO: 9.92 });
    expect(rows[0].Portfolio).toBe(daily.percent);
    expect(rows[0].pnl).toBe(daily.pnl);
  });
  it('replaces only today with the card value, preserving dated history and gaps', () => {
    const rows = buildPerformanceHistory([tx()], history, now);
    const key = performanceSourceKey([tx()]);
    expect(rows[0].Portfolio).toBeCloseTo(-0.8);
    const daily = stockDayPerformance([tx()], date, { PSO: 10 }, { PSO: 9.95 });
    const live = { date, percent: daily.percent, pnl: daily.pnl, quoteTime: now.toISOString() };
    const shown = withLivePerformance(rows, live, key);
    expect(shown[0].Portfolio).toBe(daily.percent);
    expect(shown[0].Portfolio!.toFixed(2)).toBe('-0.50');
    expect(rows[0].Portfolio).toBeCloseTo(-0.8);
    expect(withLivePerformance(rows, { ...live, date: '2026-10-20' }, key)[0].Portfolio).toBe(rows[0].Portfolio);
    expect(withLivePerformance(rows, { ...live, percent: null, pnl: null }, key)[0].Portfolio).toBeNull();
  });
  it('invalidates old calculations and same-count transaction edits', () => {
    const rows = buildPerformanceHistory([tx()], history, now);
    const live = { date, percent: -0.5, pnl: -5, quoteTime: null };
    expect(withLivePerformance([{ ...rows[0], method: 'old' }], live, performanceSourceKey([tx()]))).toEqual([]);
    expect(withLivePerformance(rows, live, performanceSourceKey([tx({ quantity: 200 })]))).toEqual([]);
  });
  it('does not compound missing data as 0%', () => {
    const rows = buildPerformanceHistory([tx()], history, now);
    expect(compoundPerformance(rows, 'Portfolio')).toBeCloseTo(-0.8);
    expect(compoundPerformance([{ ...rows[0], Portfolio: null }], 'Portfolio')).toBeNull();
    expect(compoundPerformance([], 'Portfolio')).toBeNull();
    const absentIndex = buildPerformanceHistory([tx()], { ...history, KMI30: [] }, now);
    expect(absentIndex[0].KMI30).toBeNull();
  });
});
