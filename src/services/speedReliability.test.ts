import { afterEach, beforeEach, expect, it, vi } from 'vitest';

beforeEach(() => { vi.resetModules(); vi.useFakeTimers(); });
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });
const json = (value: unknown, status = 200, headers = {}) => new Response(JSON.stringify(value), { status, headers: { 'Content-Type': 'application/json', ...headers } });

it('shares simultaneous public requests, with separately readable responses, then expires quotes', async () => {
  const { cachedMarketFetch } = await import('./marketCache');
  const request = vi.fn(async () => json({ price: 9 }));
  const url = '/api/pypsx?mode=quotes&symbols=OGDC';
  const responses = await Promise.all([cachedMarketFetch(url, request), cachedMarketFetch(url, request)]);
  expect(await Promise.all(responses.map(r => r.json()))).toEqual([{ price: 9 }, { price: 9 }]);
  await cachedMarketFetch(url, request); expect(request).toHaveBeenCalledTimes(1);
  vi.advanceTimersByTime(15001); await cachedMarketFetch(url, request); expect(request).toHaveBeenCalledTimes(2);
});
it('never caches private account calls, cloud writes or forced requests', async () => {
  const { cachedMarketFetch } = await import('./marketCache');
  for (const url of ['/api/cloud-sync', '/api/check-access', '/api/proxy?force=1']) {
    const request = vi.fn(async () => json({}));
    await cachedMarketFetch(url, request); await cachedMarketFetch(url, request);
    expect(request).toHaveBeenCalledTimes(2);
  }
});
it('respects service Retry-After across symbols and resumes after the pause', async () => {
  const { cachedMarketFetch } = await import('./marketCache');
  const failed = vi.fn(async () => json({ error: 'busy' }, 503, { 'Retry-After': '60' }));
  expect((await cachedMarketFetch('/api/pypsx?mode=quotes&symbols=A', failed)).status).toBe(503);
  const next = vi.fn(async () => json({ price: 7 }));
  expect((await cachedMarketFetch('/api/pypsx?mode=quotes&symbols=B', next)).status).toBe(503);
  expect(next).not.toHaveBeenCalled();
  vi.advanceTimersByTime(60001);
  expect((await cachedMarketFetch('/api/pypsx?mode=quotes&symbols=B', next)).status).toBe(200);
});
it('does not cache an HTML page as a successful quote response', async () => {
  const { cachedMarketFetch } = await import('./marketCache');
  const request = vi.fn(async () => new Response('<html>login</html>', { headers: { 'Content-Type': 'text/html' } }));
  await cachedMarketFetch('/api/pypsx?mode=quotes&symbols=A', request);
  await cachedMarketFetch('/api/pypsx?mode=quotes&symbols=A', request);
  expect(request).toHaveBeenCalledTimes(2);
});
it('limits concurrent Python requests across different widgets to two', async () => {
  const { cachedMarketFetch } = await import('./marketCache');
  let active = 0, peak = 0;
  const request = async () => { active++; peak = Math.max(peak, active); await new Promise(r => setTimeout(r, 100)); active--; return json({}); };
  const all = Promise.all(Array.from({ length: 8 }, (_, i) => cachedMarketFetch(`/api/pypsx?mode=company&symbol=A${i}`, request)));
  await vi.runAllTimersAsync(); await all; expect(peak).toBe(2);
});
it('publishes usable prices while a quote request is pending and retains quote precedence', async () => {
  const { progressivePrices } = await import('./progressivePrices');
  let close!: (p: any) => void, quote!: (p: any) => void;
  const publish = vi.fn();
  const running = progressivePrices({ baseline: async () => ({ A: 1, B: 5 }), pricesFromBaseline: v => v,
    closes: () => new Promise(r => { close = r; }), quotes: () => new Promise(r => { quote = r; }), publish, current: () => true });
  await Promise.resolve(); expect(publish).toHaveBeenLastCalledWith({ A: 1, B: 5 }, { A: 1, B: 5 });
  quote({ A: 3 }); await Promise.resolve(); close({ A: 2 });
  expect(await running).toEqual({ A: 3, B: 5 });
});
it('ignores obsolete-account responses and survives an optional source failure', async () => {
  const { progressivePrices } = await import('./progressivePrices');
  const publish = vi.fn();
  await progressivePrices({ baseline: async () => ({ A: 1 }), pricesFromBaseline: v => v, closes: async () => { throw new Error('offline'); }, quotes: async () => ({}), publish, current: () => false });
  expect(publish).not.toHaveBeenCalled();
});
it('reads dividends and BoardMeetings independently without Google credentials', async () => {
  const { readDividendRows, readBoardMeetingRows } = await import('./publicDividends');
  const request = vi.fn(async (url: string) => new Response(decodeURIComponent(url).includes('gid=516127681')
    ? 'company_code,company_name,bm_date,bm_time\nFFC,Fauji,10/20/2026,10:00'
    : 'FFC,"Fauji, Fertilizer",35%,,,21 Oct 2026', { headers: { 'Content-Type': 'text/csv' } }));
  vi.stubGlobal('fetch', request);
  const [dividends, meetings] = await Promise.all([readDividendRows(), readBoardMeetingRows(), readDividendRows()]);
  expect(dividends[0]).toEqual(['FFC', 'Fauji, Fertilizer', '35%', '', '', '21 Oct 2026']);
  expect(meetings[1][0]).toBe('FFC');
  expect(request).toHaveBeenCalledTimes(2);
  for (const [url, options] of request.mock.calls as any) { expect(url).toMatch(/^\/api\/proxy/); expect(options.credentials).toBe('omit'); expect(options.headers).toBeUndefined(); }
});
it('uses direct public export if the proxy fails, and rejects HTML without repeated retry storms', async () => {
  const { readDividendRows } = await import('./publicDividends');
  const request = vi.fn(async (_url: string) => new Response('<!doctype html><html>unavailable</html>'));
  vi.stubGlobal('fetch', request);
  await expect(readDividendRows()).rejects.toThrow('temporarily unavailable');
  await expect(readDividendRows()).rejects.toThrow('temporarily unavailable');
  expect(request).toHaveBeenCalledTimes(2);
  expect(request.mock.calls[1][0]).toMatch(/^https:\/\/docs.google.com/);
});
it('reports HTML, authentication and rate-limit errors in readable form', async () => {
  const { readApiJson } = await import('./apiResponse');
  await expect(readApiJson(new Response('<!DOCTYPE html>error'), 'Unavailable')).rejects.toThrow('unexpected page');
  await expect(readApiJson(json({}, 401), 'Unavailable')).rejects.toThrow('sign in again');
  await expect(readApiJson(json({}, 429), 'Unavailable')).rejects.toThrow('wait a minute');
});
