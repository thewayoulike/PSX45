import { expect, it } from 'vitest';
import { assertCatalogNotShrunk, pickFallbackPrevious, sameFundData } from './mufapSyncGuards.js';

const funds = (n: number) => Object.fromEntries(Array.from({ length: n }, (_, i) => [`MF:${i}`, { id: `MF:${i}`, nav: 10 + i, repurchase: 10 + i, validityDate: 'Sep 30, 2026' }]));

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
  expect(pickFallbackPrevious({ today: '2026-09-18', catalog: funds(385) }, stale, '2026-10-01')).toBeNull();
  expect(pickFallbackPrevious({ today: '2026-10-01', catalog: funds(385) }, null, '2026-10-01')).toBeNull();
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
  const existing = { today: '2026-10-01', yesterday: '2026-09-30', previousReportDate: 'Sep 30, 2026', previousNavs: prev, catalog: funds(385) };
  expect(pickFallbackPrevious(existing, null, '2026-10-01')).toMatchObject({ from: 'earlier-run', dateYmd: '2026-09-30' });
  const a = { updatedAt: 'x', source: 'relay:jina', catalog: funds(2) };
  expect(sameFundData(a, { ...a, updatedAt: 'y', source: 'playwright' })).toBe(true);
});
