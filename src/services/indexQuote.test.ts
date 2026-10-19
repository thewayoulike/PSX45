import { afterEach, expect, it, vi } from 'vitest';
import { fetchIndexQuote } from './psxData';
vi.mock('./marketCache', () => ({ cachedMarketFetch: (_: string, request: () => unknown) => request(), mapConcurrent: vi.fn() }));
const day = (date: string) => Date.parse(`${date}T15:00:00+05:00`) / 1000;
function feeds(intra: number[][], eod: number[][]) {
  vi.stubGlobal('fetch', vi.fn(async (url: string) => new Response(JSON.stringify({ data: decodeURIComponent(url).includes('/int/') ? intra : eod }))));
}
afterEach(() => vi.unstubAllGlobals());
it('uses a newer closing price when the intraday feed is stale', async () => {
  feeds([[day('2026-10-16'), 100]], [[day('2026-10-16'), 100], [day('2026-10-19'), 110]]);
  expect(await fetchIndexQuote('KSE100')).toEqual({ value: 110, changePct: 10, asOfDate: '2026-10-19' });
});
it('uses the previous session close for same-day intraday quotes', async () => {
  feeds([[day('2026-10-19') + 10, 112]], [[day('2026-10-16'), 100], [day('2026-10-19'), 110]]);
  expect(await fetchIndexQuote('KSE100')).toEqual({ value: 112, changePct: 12, asOfDate: '2026-10-19' });
});
it('returns no percentage without a previous close', async () => {
  feeds([[day('2026-10-19'), 112]], []);
  expect(await fetchIndexQuote('KSE100')).toEqual({ value: 112, changePct: null, asOfDate: '2026-10-19' });
});
