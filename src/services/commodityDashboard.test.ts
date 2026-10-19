import { describe, expect, it } from 'vitest';
import { commodityBaseline, commodityCutoff, commodityPercent, commodityReturn, commodityWindow, type CommoditySeries } from './commodityDashboard';
const quote: CommoditySeries = { id: 'gold', name: 'Gold', symbol: 'GC=F', unit: 'troy oz', price: 110, previousClose: 100, date: '2026-10-18', stale: false,
  history: [{ date: '2025-10-17', close: 50 }, { date: '2026-10-09', close: 80 }, { date: '2026-10-12', close: 90 }, { date: '2026-10-16', close: 105 }, { date: '2026-10-18', close: 110 }] };
describe('commodity calendar returns', () => {
  it('uses the previous trading close for a weekend cutoff and never looks forward', () => {
    expect(commodityBaseline(quote, '1W')?.date).toBe('2026-10-09');
    expect(commodityReturn(quote, '1W')).toBeCloseTo(37.5);
    expect(commodityWindow(quote, '1W')[0].date).toBe('2026-10-09');
    expect(commodityReturn(quote, '1D')).toBeCloseTo(10);
  });
  it('does not invent 5Y results or use very old data across a gap', () => {
    expect(commodityReturn(quote, '5Y')).toBeNull(); expect(commodityReturn(quote, '1M')).toBeNull();
    expect(commodityReturn(quote, '1Y')).toBeCloseTo(120);
  });
  it('clamps month ends and leap years', () => {
    expect(commodityCutoff('2024-03-31', '1M')).toBe('2024-02-29');
    expect(commodityCutoff('2024-02-29', '1Y')).toBe('2023-02-28');
  });
  it('keeps missing and nonpositive baselines distinct from an unchanged price', () => {
    expect(commodityPercent(100, 100)).toBe(0); expect(commodityPercent(100, 0)).toBeNull();
    expect(commodityPercent(100, -10)).toBeNull(); expect(commodityPercent(null, 100)).toBeNull();
  });
});
