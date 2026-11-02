import { describe, expect, it } from 'vitest';
import {
  BACKTEST_STRATEGIES, bestComparable, compareStrategies, runStrategyBacktest, supertrendDirection, type BacktestResult,
} from './strategyBacktest';
import { buyCost, netReturn } from '../features/tradingLab/engine';
const bars = () => Array.from({ length: 40 }, (_, i) => ({
  time: Date.UTC(2026, 0, 1) + i * 86400000, open: 100, high: 101, low: 99, close: 100, volume: 100,
}));
describe('backtest execution and equity', () => {
  it('fills stops at a gap-down opening price', () => {
    const data = bars();
    data[15] = { ...data[15], open: 90, high: 92, low: 88, close: 91 };
    const result = runStrategyBacktest('TEST', data, { strategy: 'rsi_oversold', rsiThreshold: 101, stopPct: 2, commissionPct: 0 });
    expect(result.trades[0].exit).toBe(90);
    expect(result.trades[0].retPct).toBe(-10);
  });
  it('uses the open for gap-up targets and stop-first for ambiguous intraday bars', () => {
    const data = bars();
    data[15] = { ...data[15], open: 110, high: 112, low: 90, close: 100 };
    expect(runStrategyBacktest('T', data, { strategy: 'rsi_oversold', rsiThreshold: 101 }).trades[0].exit).toBe(110);
    data[15].open = 100;
    expect(runStrategyBacktest('T', data, { strategy: 'rsi_oversold', rsiThreshold: 101 }).trades[0].reason).toBe('sl');
  });
  it('measures losses during a recovering trade and charges fees consistently', () => {
    const data = bars();
    data[20] = { ...data[20], open: 80, low: 79, high: 81, close: 80 };
    const result = runStrategyBacktest('T', data, { strategy: 'rsi_oversold', rsiThreshold: 101, stopPct: 50, takeProfitPct: 50, commissionPct: 1 });
    expect(result.metrics.maxDrawdownPct).toBeCloseTo(21);
    expect(result.equityCurve[20].equity).toBeCloseTo(0.79);
    expect(result.equityCurve.at(-1)!.equity).toBeCloseTo(0.99);
    expect(result.metrics.compoundedReturnPct).toBeCloseTo(-1);
    expect(result.metrics.buyHoldReturnPct).toBeCloseTo(-1);
  });
});

const day = (i: number, close: number, spread = 0.5) => ({
  time: Date.UTC(2026, 0, 1) + i * 86400000, open: close, high: close + spread, low: close - spread, close, volume: 100,
});
/** Falls for 60 days, then rises for 60: trend strategies should buy only on the way up. */
const vShape = () => Array.from({ length: 120 }, (_, i) => day(i, i < 60 ? 160 - i : 100 + (i - 60)));

describe('PSX costs', () => {
  it('charges commission with sales tax, CDC and exchange fees on both sides', () => {
    const data = bars();
    const result = runStrategyBacktest('T', data, { strategy: 'rsi_oversold', rsiThreshold: 101, costs: 'psx', feePct: 0.15 });
    const expected = (netReturn(100, 100, 0.15, 0) / buyCost(100, 0.15, 0)) * 100;
    expect(result.trades[0].retPct).toBeCloseTo(expected, 10);
    expect(result.trades[0].retPct).toBeLessThan(-0.3);
    expect(result.metrics.buyHoldReturnPct).toBeCloseTo(expected, 10);
  });
  it('turns all charges off at a 0% commission rate', () => {
    const result = runStrategyBacktest('T', bars(), { strategy: 'rsi_oversold', rsiThreshold: 101, costs: 'psx', feePct: 0 });
    expect(result.trades[0].retPct).toBe(0);
  });
});

describe('new strategies', () => {
  it('EMA cross and Supertrend buy only after the turn', () => {
    for (const strategy of ['ema_cross', 'supertrend'] as const) {
      const result = runStrategyBacktest('T', vShape(), { strategy, commissionPct: 0 });
      expect(result.trades.length, strategy).toBeGreaterThan(0);
      expect(result.trades.every((t) => t.entryIdx > 60), strategy).toBe(true);
    }
  });
  it('Supertrend turns down in a fall and up in a rise', () => {
    const dir = supertrendDirection(vShape());
    expect(dir[50]).toBe(-1);
    expect(dir[119]).toBe(1);
  });
  it('Bollinger bounce buys the close back inside the lower band and sells at the middle band', () => {
    const data = Array.from({ length: 45 }, (_, i) => day(i, i % 2 ? 100.4 : 100, 0.2));
    data[30] = day(30, 90, 0.2);
    data[31] = day(31, 99.5, 0.2);
    data[32] = day(32, 100, 0.2);
    const result = runStrategyBacktest('T', data, { strategy: 'bollinger_bounce', commissionPct: 0 });
    expect(result.trades[0]).toMatchObject({ entryIdx: 31, exitIdx: 32, reason: 'signal' });
  });
});

describe('comparison metrics', () => {
  it('reports profit factor, average win and loss, exposure and holding time', () => {
    const data = bars();
    data[15] = { ...data[15], high: 105 };
    data[17] = { ...data[17], low: 97 };
    const r = runStrategyBacktest('T', data, { strategy: 'rsi_oversold', rsiThreshold: 101, stopPct: 2, takeProfitPct: 4, commissionPct: 0 });
    // 14 → 15 wins 4%, 16 → 17 loses 2%, then the rest.
    expect(r.trades[0].retPct).toBeCloseTo(4);
    expect(r.trades[1].retPct).toBeCloseTo(-2);
    expect(r.metrics.avgWinPct).toBeCloseTo(4);
    expect(r.metrics.profitFactor).toBeCloseTo(2);
    expect(r.metrics.avgHoldDays).toBeGreaterThanOrEqual(1);
    expect(r.metrics.exposurePct).toBeGreaterThan(0);
    expect(r.metrics.exposurePct).toBeLessThanOrEqual(100);
  });
  it('has no Sharpe or profit factor without trades', () => {
    const r = runStrategyBacktest('T', bars(), { strategy: 'sma_cross' });
    expect(r.metrics.trades).toBe(0);
    expect(r.metrics.sharpe).toBeNull();
    expect(r.metrics.profitFactor).toBeNull();
  });
  it('runs every strategy on the same bars', () => {
    const results = compareStrategies('T', vShape(), { costs: 'psx' });
    expect(results.map((r) => r.strategy)).toEqual(BACKTEST_STRATEGIES);
    expect(new Set(results.map((r) => r.barCount))).toEqual(new Set([120]));
  });
  it('picks a best strategy only among those with enough trades and a gain', () => {
    const fake = (strategy: BacktestResult['strategy'], trades: number, compoundedReturnPct: number) =>
      ({ strategy, metrics: { trades, compoundedReturnPct } }) as BacktestResult;
    expect(bestComparable([fake('rsi_oversold', 2, 50), fake('ema_cross', 6, 8), fake('supertrend', 9, 5)])?.strategy).toBe('ema_cross');
    expect(bestComparable([fake('rsi_oversold', 2, 50), fake('ema_cross', 6, -3)])).toBeNull();
  });
});
