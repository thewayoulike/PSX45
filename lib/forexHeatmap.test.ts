import { afterEach, expect, it, vi } from 'vitest';
import { fetchForexHeatmap, fxComparisonDates, parseFxSnapshot } from './forexHeatmap.js';

afterEach(() => vi.unstubAllGlobals());
it('uses calendar comparisons and clamps month ends and leap days', () => {
  expect(fxComparisonDates('2026-03-31')).toEqual({ '1D': '2026-03-30', '1W': '2026-03-24', '1M': '2026-02-28', '1Y': '2025-03-31' });
  expect(fxComparisonDates('2024-02-29')['1Y']).toBe('2023-02-28');
  expect(() => fxComparisonDates('2026-02-30')).toThrow();
});
it('rejects wrong dated history and excludes missing, zero or invalid rates', () => {
  const raw = { date: '2026-10-18', usd: { usd: 1, eur: .9, pkr: null, gbp: 0, jpy: Infinity, cny: '6.5' } };
  expect(parseFxSnapshot(raw)).toEqual({ date: raw.date, rates: { USD: 1, EUR: .9 } });
  expect(() => parseFxSnapshot(raw, '2026-10-17')).toThrow();
  expect(() => parseFxSnapshot({ ...raw, usd: { ...raw.usd, usd: 2 } })).toThrow();
});
it('uses the same-date mirror and leaves a failed period unavailable', async () => {
  const fetcher = vi.fn(async (url: string) => {
    if (url.includes('@latest')) return { ok: false };
    if (url.includes('2026-09-18')) return { ok: true, json: async () => ({ date: '2026-10-18', usd: { usd: 1, pkr: 280 } }) };
    const date = url.includes('latest.') ? '2026-10-18' : url.match(/\d{4}-\d{2}-\d{2}/)?.[0];
    return { ok: true, json: async () => ({ date, usd: { usd: 1, pkr: 280, eur: .9 } }) };
  });
  vi.stubGlobal('fetch', fetcher);
  const result = await fetchForexHeatmap();
  expect(fetcher.mock.calls[1][0]).toBe('https://latest.currency-api.pages.dev/v1/currencies/usd.min.json');
  expect(result.current.date).toBe('2026-10-18');
  expect(result.comparisons['1D']?.date).toBe('2026-10-17');
  expect(result.comparisons['1M']).toBeNull();
  expect(result.comparisons['1Y']?.date).toBe('2025-10-18');
});
