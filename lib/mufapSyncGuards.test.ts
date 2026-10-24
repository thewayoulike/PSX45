import { expect, it } from 'vitest';
import { assertCatalogNotShrunk, assertCatalogNotOlder, catalogNavDate, newestCatalog, preserveNewerFunds, pickFallbackPrevious, sameFundData } from './mufapSyncGuards.js';

const funds = (n: number, date = 'Sep 30, 2026') => Object.fromEntries(Array.from({ length: n }, (_, i) => [`MF:${i}`, { id: `MF:${i}`, nav: 10 + i, repurchase: 10 + i, validityDate: date }]));

it('keeps the current catalog when a fetch returns a partial table', () => {
  expect(() => assertCatalogNotShrunk(120, 385)).toThrow(/Only 120 funds parsed, against 385/);
  expect(() => assertCatalogNotShrunk(330, 385)).not.toThrow();
  expect(() => assertCatalogNotShrunk(120, 385, { allow: true })).not.toThrow();
  expect(() => assertCatalogNotShrunk(60, 0)).not.toThrow(); // first run has nothing to compare
});

it('uses the last published catalog as yesterday when the prior-day fetch fails', () => {
  const existing = { today: '2026-09-30', reportDate: 'Sep 30, 2026', catalog: funds(385) };
  const pick = pickFallbackPrevious(existing, null, '2026-10-01');
  expect(pick).toMatchObject({ from: 'catalog', dateYmd: '2026-09-30', reportDate: 'Sep 30, 2026' });
  expect(pick!.funds).toHaveLength(385);
});

it('never labels NAVs older than five days, or from the same day, as yesterday', () => {
  const stale = { date: '2026-09-18', previousNavs: Object.fromEntries(Object.entries(funds(349)).map(([k, f]) => [k, { nav: f.nav, validityDate: '' }])) };
  expect(pickFallbackPrevious({ today: '2026-09-18', catalog: funds(385, 'Sep 18, 2026') }, stale, '2026-10-01')).toBeNull();
  expect(pickFallbackPrevious({ today: '2026-10-01', catalog: funds(385, 'Oct 1, 2026') }, null, '2026-10-01')).toBeNull();
  expect(pickFallbackPrevious(null, { ...stale, date: '2026-09-29' }, '2026-10-01')).toMatchObject({ from: 'previous-file', dateYmd: '2026-09-29' });
});

it('treats a rerun with identical NAVs as unchanged so nothing is committed or deployed', () => {
  const a = { updatedAt: '2026-10-01T13:00:00Z', today: '2026-10-01', catalog: funds(3) };
  expect(sameFundData(a, { ...a, updatedAt: '2026-10-01T16:00:00Z' })).toBe(true);
  expect(sameFundData(a, { ...a, catalog: funds(4) })).toBe(false);
  expect(sameFundData(null, a)).toBe(false);
});

it('a same-day retry keeps the previous-day NAVs the earlier run found', () => {
  const prev = Object.fromEntries(Object.entries(funds(380)).map(([k, f]) => [k, { nav: f.nav, validityDate: '' }]));
  const existing = { today: '2026-10-01', yesterday: '2026-09-30', previousReportDate: 'Sep 30, 2026', previousNavs: prev, catalog: funds(385, 'Oct 1, 2026') };
  expect(pickFallbackPrevious(existing, null, '2026-10-01')).toMatchObject({ from: 'earlier-run', dateYmd: '2026-09-30' });
  const a = { updatedAt: 'x', source: 'relay:jina', catalog: funds(2) };
  expect(sameFundData(a, { ...a, updatedAt: 'y', source: 'playwright' })).toBe(true);
});

it('rejects an older cached report even when its requested URL and retrieval timestamp are newer', () => {
  const current = { today: '2026-10-22', reportDate: 'Oct 21, 2026', updatedAt: '2026-10-21', catalog: funds(390, 'Oct 21, 2026') };
  const stale = { today: '2026-10-24', reportDate: 'Oct 24, 2026', updatedAt: '2026-10-24', catalog: funds(369, 'Oct 20, 2026') };
  expect(catalogNavDate(stale)).toBe('2026-10-20');
  expect(() => assertCatalogNotOlder(stale, current)).toThrow(/older NAVs/);
  expect(newestCatalog(stale, current)).toBe(current);
  expect(() => assertCatalogNotOlder({ catalog: {} }, current)).toThrow(/no verifiable NAV date/);
  expect(pickFallbackPrevious(current, null, '2026-10-22')).toMatchObject({ dateYmd: '2026-10-21' });
});

it('keeps missing funds and newer individual NAVs while accepting newly published prices', () => {
  const existing = { catalog: funds(3, 'Oct 22, 2026') };
  const candidate = { catalog: { ...funds(2, 'Oct 23, 2026'), 'MF:1': { ...funds(2, 'Oct 20, 2026')['MF:1'], nav: 1 } } };
  const result = preserveNewerFunds(candidate, existing);
  expect(result.count).toBe(3);
  expect(result.catalog['MF:0'].validityDate).toBe('Oct 23, 2026');
  expect(result.catalog['MF:1']).toEqual(existing.catalog['MF:1']);
  expect(result.catalog['MF:2']).toEqual(existing.catalog['MF:2']);
});
