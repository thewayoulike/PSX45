import { describe, expect, it } from 'vitest';
import { buildPairedCashTx } from './fundCash';
import type { Transaction } from '../types';

const trade = (type: 'BUY' | 'SELL') => ({
  id: 't', portfolioId: 'p', type, ticker: 'MF:abc-income-fund', quantity: 100, price: 10,
  date: '2026-11-04', commission: 0, tax: 0, cdcCharges: 0, otherFees: 0,
} as Transaction);
const opts = { id: 'c', linkId: 'l', createdAt: '2026-11-04T00:00:00Z' };

describe('paired cash rows', () => {
  it('records which fund a redemption withdrawal came from', () => {
    expect(buildPairedCashTx(trade('SELL'), opts)?.fundTicker).toBe('MF:abc-income-fund');
  });
  it('records which fund a subscription deposit was for', () => {
    expect(buildPairedCashTx(trade('BUY'), opts)?.fundTicker).toBe('MF:abc-income-fund');
  });
});
