import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mergePortfolioHistory, readObservations, readPortfolioHistory, writeObservations, writePortfolioHistory } from './portfolioHistoryCache';
import { preparePortfolioAccount } from './localAccount';
import { PERFORMANCE_METHOD, type PerformanceRow } from './stockPerformance';

const scope = { account: 'a@example.com', portfolio: 'main', sourceKey: 'ledger-v1' };
const row = (rawDate: string, netWorth: number | null, fetchedAt = '2026-10-29T09:00:00Z'): PerformanceRow =>
  ({ rawDate, date: rawDate, netWorth, fetchedAt, method: PERFORMANCE_METHOD, sourceKey: scope.sourceKey, Portfolio: 1, KSE100: 1, KMI30: 1 });
let store: Map<string, string>;
beforeEach(() => {
  store = new Map();
  vi.stubGlobal('localStorage', { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => store.set(k, v),
    removeItem: (k: string) => store.delete(k), key: (i: number) => [...store.keys()][i] ?? null, get length() { return store.size; } });
});
afterEach(() => vi.unstubAllGlobals());

describe('saved portfolio history', () => {
  it('restores the same account but isolates other accounts, portfolios and ledger edits', () => {
    writePortfolioHistory(scope, [row('2026-10-28', 100)]);
    expect(readPortfolioHistory({ ...scope, account: ' A@example.com ' })).toHaveLength(1);
    for (const other of [{ ...scope, account: '' }, { ...scope, account: 'b@example.com' }, { ...scope, portfolio: 'other' }, { ...scope, sourceKey: 'ledger-v2' }])
      expect(readPortfolioHistory(other)).toEqual([]);
  });
  it('survives account switches without copying charts to the other account recovery archive', () => {
    preparePortfolioAccount(scope.account);
    writePortfolioHistory(scope, [row('2026-10-28', 100)]);
    preparePortfolioAccount('b@example.com');
    expect(readPortfolioHistory(scope)).toHaveLength(1);
    expect(readPortfolioHistory({ ...scope, account: 'b@example.com' })).toEqual([]);
    expect([...store].find(([k]) => k.startsWith('psx_cloud_recovery:'))?.[1]).not.toContain('netWorth');
  });
  it('keeps long coverage during an empty, shorter, stale or partial refresh', () => {
    const old = [row('2025-01-01', 80), row('2026-10-28', 100)];
    expect(mergePortfolioHistory(scope.sourceKey, old, [])).toEqual(old);
    const merged = mergePortfolioHistory(scope.sourceKey, old, [row('2026-10-28', null, '2026-10-30T09:00:00Z'), row('2026-10-29', 110)]);
    expect(merged.map(r => r.netWorth)).toEqual([80, 100, 110]);
    expect(mergePortfolioHistory(scope.sourceKey, merged, [row('2026-10-28', 95, '2026-10-20T09:00:00Z')])).toEqual(merged);
    expect(mergePortfolioHistory('edited-ledger', old)).toEqual([]);
    expect(mergePortfolioHistory(scope.sourceKey, old, [row('2026-10-28', 105, '2026-10-30T09:00:00Z')])[1].netWorth).toBe(105);
  });
  it('handles damaged and full storage without breaking chart rendering', () => {
    writePortfolioHistory(scope, [row('2026-10-28', 100)]);
    store.set([...store.keys()][0], '{invalid');
    expect(readPortfolioHistory(scope)).toEqual([]);
    vi.spyOn(localStorage, 'setItem').mockImplementation(() => { throw new Error('full'); });
    expect(writePortfolioHistory(scope, [row('2026-10-28', 100)])).toBe(false);
  });
  it('restores actual intraday observations only for the same account, day and ledger', () => {
    const points = [{ time: Date.parse('2026-10-29T05:00:00Z'), value: 100 }, { time: Date.parse('2026-10-29T06:00:00Z'), value: 110 }];
    writeObservations(scope, '2026-10-29', points);
    expect(readObservations(scope, '2026-10-29')).toEqual(points);
    expect(readObservations(scope, '2026-10-30')).toEqual([]);
    expect(readObservations({ ...scope, account: 'b@example.com' }, '2026-10-29')).toEqual([]);
    expect(readObservations({ ...scope, sourceKey: 'edited' }, '2026-10-29')).toEqual([]);
  });
});
