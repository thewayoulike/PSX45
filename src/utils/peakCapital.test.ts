import { describe, expect, it } from 'vitest';
import { investedCapitalHistory, netInvestedBalance, netInvestedOnDate, type CapitalEvent } from './peakCapital';

const event = (date: string, type: CapitalEvent['type'], amount: number, extra: Partial<CapitalEvent> = {}): CapitalEvent =>
  ({ date, type, amount, originalIndex: 0, ...extra });

describe('net invested history', () => {
  it('uses each date’s contributions, including transfers, without borrowing future capital', () => {
    const { points } = investedCapitalHistory([
      event('2026-06-10', 'IN', 500), // later deposit
      event('2026-01-02', 'IN', 1000),
      event('2026-04-05', 'IN', 200), // share transfer in
      event('2026-05-01', 'OUT', 50), // share transfer out
    ], false);
    expect(netInvestedOnDate(points, '2026-01-01')).toBe(0);
    expect(netInvestedOnDate(points, '2026-02-01')).toBe(1000);
    expect(netInvestedOnDate(points, '2026-04-05')).toBe(1200);
    expect(netInvestedOnDate(points, '2026-05-20')).toBe(1150);
    expect(netInvestedOnDate(points, '2026-06-10')).toBe(1650);
  });

  it('funds withdrawals from realized gains after tax, then reinvestment, then original capital', () => {
    const { points } = investedCapitalHistory([
      event('2026-01-01', 'IN', 1000),
      event('2026-01-02', 'PROFIT', 200, { bucket: 'realized' }),
      event('2026-01-03', 'LOSS', 20, { bucket: 'realized' }),
      event('2026-01-04', 'IN', 100, { kind: 'reinvest' }),
      event('2026-01-05', 'OUT', 180),
      event('2026-01-06', 'OUT', 50),
      event('2026-01-07', 'OUT', 100),
    ], false);
    expect(points.map(p => p.netInvested)).toEqual([1000, 1000, 1000, 1100, 1100, 1050, 950]);
    expect(points.at(-1)!.netInvested).toBe(netInvestedBalance(1000, 330, 180, 100, false).netPrincipal);
  });

  it('keeps one end-of-day balance while retaining the within-day peak', () => {
    const result = investedCapitalHistory([
      event('2026-01-01', 'OUT', 400, { originalIndex: 2 }),
      event('2026-01-01', 'IN', 1000, { originalIndex: 1 }),
    ], false);
    expect(result).toEqual({ peak: 1000, points: [{ date: '2026-01-01', netInvested: 600 }] });
  });

  it('does not turn ordinary cash dividends or expenses into new invested capital', () => {
    const { points } = investedCapitalHistory([
      event('2026-01-01', 'IN', 1000),
      event('2026-01-02', 'PROFIT', 80),
      event('2026-01-03', 'LOSS', 10),
      event('2026-01-04', 'LOSS', 100, { bucket: 'realized' }),
    ], false);
    expect(points.every(p => p.netInvested === 1000)).toBe(true);
  });

  it('excludes reinvested dividend units from fund principal and floors withdrawn capital at zero', () => {
    const events = [event('2026-01-01', 'IN', 1000), event('2026-01-02', 'IN', 100, { kind: 'reinvest' }), event('2026-01-03', 'OUT', 50)];
    expect(investedCapitalHistory(events, true).points.map(p => p.netInvested)).toEqual([1000, 1000, 1000]);
    expect(netInvestedBalance(1000, 2000, 0, 100, false).netPrincipal).toBe(0);
    expect(investedCapitalHistory([], false)).toEqual({ peak: 0, points: [] });
  });
});
