import { describe, expect, it } from 'vitest';
import { peakNetInvested } from './peakCapital';
import { fifoTransferSlices } from './transferLots';
import { getFaceValue, percentToRs } from './faceValues';
import { clipHistory } from './historyRange';
import { canonicalSector } from './sectorName';
import { daysUntilMeeting } from './meetingDays';
import { batchNetCashNeed } from './batchCash';
import { normalizeScannedTrade } from './scanNormalize';
import { sellTaxAllocation } from './sellTax';
import { healthReturnPct } from './healthScore';
import { principalAndCash } from './cashFlows';
import { brokerIdForName } from './brokerLookup';
import { visibleSelection } from './visibleSelection';

describe('remaining audit fixes', () => {
  it('tracks peak with gains withdrawn before capital', () => {
    const events = [
      { date: '2026-01-01', type: 'IN' as const, amount: 100000, originalIndex: 0 },
      { date: '2026-02-01', type: 'PROFIT' as const, amount: 50000, originalIndex: 1, bucket: 'realized' as const },
      { date: '2026-03-01', type: 'OUT' as const, amount: 50000, originalIndex: 2 },
      { date: '2026-04-01', type: 'IN' as const, amount: 80000, originalIndex: 3 },
      { date: '2026-05-01', type: 'OUT' as const, amount: 100000, originalIndex: 4 },
    ];
    expect(peakNetInvested(events, false)).toBe(180000);
  });

  it('carries each FIFO lot cost into a transfer instead of one blended price', () => {
    const slices = fifoTransferSlices([
      { type: 'BUY', date: '2026-01-01', quantity: 100, price: 10, createdAt: '2026-01-01T01:00:00Z' },
      { type: 'BUY', date: '2026-01-02', quantity: 100, price: 20, createdAt: '2026-01-02T01:00:00Z' },
    ], 150, '2026-06-01');
    expect(slices).toEqual([
      { quantity: 100, price: 10 },
      { quantity: 50, price: 20 },
    ]);
  });

  it('uses lots still open on a backdated transfer date', () => {
    const slices = fifoTransferSlices([
      { type: 'BUY', date: '2026-01-01', quantity: 100, price: 10 },
      { type: 'BUY', date: '2026-03-01', quantity: 100, price: 30 },
      { type: 'SELL', date: '2026-08-01', quantity: 100, price: 40 },
    ], 50, '2026-02-01');
    expect(slices).toEqual([{ quantity: 50, price: 10 }]);
  });

  it('uses BAFL face value of 10 before the split and 5 after', () => {
    expect(getFaceValue('BAFL', '2026-04-17')).toBe(10);
    expect(getFaceValue('BAFL', '2026-04-20')).toBe(5);
    expect(percentToRs(100, 'BAFL', '2026-01-01')).toBe(10);
    expect(percentToRs(100, 'BAFL', '2026-09-01')).toBe(5);
  });

  it('keeps only history inside the requested range', () => {
    const now = new Date('2026-09-23T12:00:00Z');
    const points = [
      { time: new Date('2026-01-01T00:00:00Z').getTime(), price: 1 },
      { time: new Date('2026-09-01T00:00:00Z').getTime(), price: 2 },
    ];
    expect(clipHistory(points, '1M', now).map(p => p.price)).toEqual([2]);
    expect(clipHistory(points, '1Y', now)).toHaveLength(2);
  });

  it('groups a live sector name with its static shorthand', () => {
    expect(canonicalSector('Oil & Gas Exploration')).toBe('Oil & Gas Exploration Companies');
    expect(canonicalSector('Technology & Comm')).toBe('Technology & Communication');
    expect(canonicalSector('COMMERCIAL BANKS')).toBe('Commercial Banks');
  });

  it('recomputes board-meeting days from the date, not a stale cache', () => {
    const today = new Date('2026-09-23T15:00:00Z');
    expect(daysUntilMeeting(new Date('2026-09-24T00:00:00Z'), today)).toBe(1);
    expect(daysUntilMeeting(new Date('2026-09-20T00:00:00Z'), today)).toBe(-3);
  });

  it('counts withdrawals and tax in a batch cash check', () => {
    expect(batchNetCashNeed([
      { type: 'BUY', quantity: 10, price: 100 },
      { type: 'WITHDRAWAL', price: 200 },
      { type: 'TAX', price: 50 },
      { type: 'DEPOSIT', price: 100 },
    ])).toBe(1150);
  });

  it('normalizes a Gemini scan row', () => {
    expect(normalizeScannedTrade({ ticker: ' ogdc ', type: 'buy ', date: '15/08/2026' })).toEqual({
      ticker: 'OGDC', type: 'BUY', date: '2026-08-15',
    });
  });

  it('keeps fund redemption tax out of sales tax', () => {
    expect(sellTaxAllocation(true, 200)).toEqual({ salesTax: 0, cgt: 200, withheld: 200 });
    expect(sellTaxAllocation(false, 15)).toEqual({ salesTax: 15, cgt: 0, withheld: 0 });
  });

  it('scores performance from the same ROI the dashboard shows', () => {
    expect(healthReturnPct({ roi: 10, unrealizedPL: 50, netRealizedPL: 0, netPrincipal: 100 })).toBe(10);
  });

  it('keeps a share transfer in invested capital and out of cash', () => {
    expect(principalAndCash({ deposits: 1000, withdrawals: 0, transferIn: 0, transferOut: 4500000 })).toEqual({
      principalIn: 1000,
      principalOut: 4500000,
      cashIn: 1000,
      cashOut: 0,
    });
  });

  it('copies the broker id onto a scanned dividend', () => {
    expect(brokerIdForName([{ broker: 'AKD', brokerId: 'b1' }], 'AKD')).toBe('b1');
  });

  it('drops hidden rows from a bulk delete', () => {
    expect(visibleSelection(['a', 'b', 'c'], ['b'])).toEqual(['b']);
  });
});
