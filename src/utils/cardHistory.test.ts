import { describe, expect, it } from 'vitest';
import { cardSparklines, daySnapshot, ledgerAsOf } from './cardHistory';

describe('dashboard card history', () => {
  it('rebuilds net worth and total return from the cash ledger and that day close', () => {
    const txs = [
      { type: 'DEPOSIT', date: '2026-09-16', price: 1000, quantity: 1 },
      { type: 'BUY', date: '2026-09-16', price: 50, quantity: 10 },
    ];
    const ledger = ledgerAsOf(txs, '2026-09-17');
    expect(ledger.cash).toBe(500);
    expect(daySnapshot(600, ledger)).toEqual({ netWorth: 1100, totalReturn: 100 });
  });

  it('keeps a share transfer out of cash and inside contributed capital', () => {
    const ledger = ledgerAsOf([
      { type: 'DEPOSIT', date: '2026-09-01', price: 1000, quantity: 1 },
      { type: 'TRANSFER_OUT', date: '2026-09-02', price: 10, quantity: 100 },
    ], '2026-09-02');
    expect(ledger.cash).toBe(1000);
    expect(ledger.contributed).toBe(0);
  });

  it('reads the last 7 sessions for the three cards', () => {
    const rows = Array.from({ length: 9 }, (_, i) => ({
      rawDate: `2026-09-${String(i + 1).padStart(2, '0')}`,
      netWorth: 1000 + i,
      totalReturn: -10 - i,
      Portfolio: i * 0.1,
    }));
    const series = cardSparklines(rows);
    expect(series.netWorth).toEqual([1002, 1003, 1004, 1005, 1006, 1007, 1008]);
    expect(series.totalReturn).toHaveLength(7);
    expect(series.dailyReturn[0]).toBeCloseTo(0.2);
  });
});
