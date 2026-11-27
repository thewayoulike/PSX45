import { describe, expect, it } from 'vitest';
import type { Transaction } from '../types';
import { describeMissingAction, findMissingActions, missingActionKey } from './missingCorporateActions';

const tx = (o: Partial<Transaction>): Transaction => ({ id: Math.random().toString(36), portfolioId: 'p', ticker: 'HUBC', type: 'BUY', date: '2026-01-10', quantity: 500, price: 100, commission: 0, tax: 0, cdcCharges: 0, otherFees: 0, broker: 'AKD', ...o });
const bonus = { exDate: '2026-03-12', kind: ['bonus'], bonusPercent: 10 };

describe('findMissingActions', () => {
  it('lists a bonus on shares held at the ex-date with no entry', () => {
    const [m, ...rest] = findMissingActions([tx({})], { HUBC: [bonus] }, '2026-11-27');
    expect(rest).toHaveLength(0);
    expect(m).toMatchObject({ ticker: 'HUBC', kind: 'bonus', bonusPercent: 10, sharesHeld: 500, exDate: '2026-03-12', broker: 'AKD' });
    expect(describeMissingAction(m)).toBe('10% bonus shares');
  });
  it('treats an entry within 45 days of the ex-date as recorded', () => {
    const txs = [tx({}), tx({ type: 'BONUS', date: '2026-04-02', quantity: 50, price: 0 })];
    expect(findMissingActions(txs, { HUBC: [bonus] }, '2026-11-27')).toEqual([]);
  });
  it('skips events before the first purchase, after a full sale, in the future or quarantined', () => {
    expect(findMissingActions([tx({ date: '2026-04-01' })], { HUBC: [bonus] }, '2026-11-27')).toEqual([]);
    expect(findMissingActions([tx({}), tx({ type: 'SELL', date: '2026-02-01' })], { HUBC: [bonus] }, '2026-11-27')).toEqual([]);
    expect(findMissingActions([tx({})], { HUBC: [{ ...bonus, exDate: '2026-12-20' }] }, '2026-11-27')).toEqual([]);
    expect(findMissingActions([tx({})], { HUBC: [{ ...bonus, applied: false }] }, '2026-11-27')).toEqual([]);
  });
  it('checks each broker account separately', () => {
    const txs = [tx({}), tx({ broker: 'JS', quantity: 200 }), tx({ type: 'BONUS', date: '2026-03-12', quantity: 50, price: 0 })];
    const out = findMissingActions(txs, { HUBC: [bonus] }, '2026-11-27');
    expect(out.map(m => [m.broker, m.sharesHeld])).toEqual([['JS', 200]]);
  });
  it('honours dismissed items and reads split and rights details', () => {
    const actions = { HUBC: [{ exDate: '2026-05-05', kind: ['split'], splitRatio: 2 }, { exDate: '2026-06-01', kind: ['dividend', 'right'], rightPercent: 20, rightPrice: 10 }] };
    const all = findMissingActions([tx({})], actions, '2026-11-27');
    expect(all.map(m => describeMissingAction(m))).toEqual(['20% rights issue at Rs 10', '2-for-1 split']);
    const dismissed = new Set([missingActionKey('HUBC', 'AKD', '2026-05-05', 'split')]);
    expect(findMissingActions([tx({})], actions, '2026-11-27', dismissed).map(m => m.kind)).toEqual(['rights']);
  });
});
