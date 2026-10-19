import { describe, expect, it } from 'vitest';
import { cloudRecords, mergeCloudRecords } from './cloudRecordMerge';

const p = { id: 'p1', name: 'Main' };
const a = { id: 'a', ticker: 'PSO', portfolioId: 'p1', quantity: 10 };
const b = { id: 'b', ticker: 'FFC', portfolioId: 'p1', quantity: 20 };
const c = { id: 'c', ticker: 'GAL', portfolioId: 'p1', quantity: 30 };
const snapshot = (transactions: any[], portfolios = [p]) => ({ transactions, portfolios });

describe('transaction reconciliation', () => {
  it('keeps new trades from both devices without duplicating a shared trade', () => {
    expect(mergeCloudRecords(cloudRecords(snapshot([a])), snapshot([a, b]), snapshot([a, c])).transactions).toEqual([a, c, b]);
  });
  it('honours a remote deletion while preserving a new local trade', () => {
    expect(mergeCloudRecords(cloudRecords(snapshot([a])), snapshot([a, b]), snapshot([])).transactions).toEqual([b]);
  });
  it('honours a local deletion while preserving a new remote trade', () => {
    expect(mergeCloudRecords(cloudRecords(snapshot([a])), snapshot([]), snapshot([a, c])).transactions).toEqual([c]);
  });
  it('keeps independent edits to different trades', () => {
    const editedA = { ...a, quantity: 12 }, editedB = { ...b, quantity: 25 };
    expect(mergeCloudRecords(cloudRecords(snapshot([a, b])), snapshot([editedA, b]), snapshot([a, editedB])).transactions).toEqual([editedA, editedB]);
  });
  it.each([
    [snapshot([{ ...a, quantity: 12 }]), snapshot([{ ...a, quantity: 15 }])],
    [snapshot([{ ...a, quantity: 12 }]), snapshot([])],
    [snapshot([]), snapshot([{ ...a, quantity: 15 }])],
  ])('stops rather than guessing between conflicting edits or edit/deletion', (local, remote) => {
    expect(() => mergeCloudRecords(cloudRecords(snapshot([a])), local, remote)).toThrow('Sync paused to protect transactions');
  });
  it('does not guess whether a legacy local-only row is new or deliberately deleted', () => {
    expect(() => mergeCloudRecords(undefined, snapshot([a]), snapshot([]))).toThrow('Sync paused');
  });
  it('stops when a new trade belongs to a portfolio deleted on the other device', () => {
    expect(() => mergeCloudRecords(cloudRecords(snapshot([])), snapshot([b]), snapshot([], []))).toThrow('Sync paused');
  });
  it('keeps a new portfolio and its transactions together', () => {
    const p2 = { id: 'p2', name: 'Second' }, newTrade = { ...b, portfolioId: 'p2' };
    const result = mergeCloudRecords(cloudRecords(snapshot([a])), snapshot([a, newTrade], [p, p2]), snapshot([a, c]));
    expect(result.portfolios).toEqual([p, p2]);
    expect(result.transactions).toEqual([a, c, newTrade]);
  });
  it('does not collapse two rows with duplicate IDs or invent an ID for an uncertain merge', () => {
    expect(() => mergeCloudRecords(cloudRecords(snapshot([])), snapshot([a, a]), snapshot([b]))).toThrow('Sync paused');
    expect(() => mergeCloudRecords(cloudRecords(snapshot([])), snapshot([{ ticker: 'PSO' }]), snapshot([b]))).toThrow('Sync paused');
  });
});
