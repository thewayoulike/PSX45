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

describe('CGT refund paid as units', () => {
  it('books a negative CGT row and a buy of the units, linked together', async () => {
    const { buildCgtUnitsRefund, isCgtUnitsPair } = await import('./fundCash');
    const { refund, units } = buildCgtUnitsRefund({ fundTicker: 'MF:abc-income-fund', units: 0.3123, nav: 105.6789, date: '2026-11-05', linkId: 'L' });
    expect(refund).toMatchObject({ type: 'TAX', ticker: 'CGT', price: -33, fundTicker: 'MF:abc-income-fund', linkId: 'L' });
    expect(units).toMatchObject({ type: 'BUY', ticker: 'MF:abc-income-fund', quantity: 0.3123, price: 105.6789, linkId: 'L' });
    const rows = [{ ...refund, id: 'a', portfolioId: 'p' }, { ...units, id: 'b', portfolioId: 'p' }] as Transaction[];
    expect(isCgtUnitsPair(rows, 'L')).toBe(true);
  });
});
