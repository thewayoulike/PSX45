import { describe, expect, it } from 'vitest';
import { runStrategyBacktest } from './strategyBacktest';
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
