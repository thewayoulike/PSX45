import { afterEach, beforeEach, expect, it, vi } from 'vitest';
vi.mock('./sharedRateLimit.js', () => ({ limitRequest: async () => true }));
import proxy from '../api/proxy.js';

const call = async (url: string) => {
  const res: any = { headers: {} as Record<string, string>, code: 0, body: undefined,
    setHeader(k: string, v: string) { this.headers[k.toLowerCase()] = v; }, status(n: number) { this.code = n; return this; },
    send(b: unknown) { this.body = b; return this; }, json(b: unknown) { this.body = b; return this; } };
  await proxy({ method: 'GET', query: { url: encodeURIComponent(url) }, headers: {} } as any, res);
  return res;
};
beforeEach(() => vi.stubGlobal('fetch', vi.fn()));
afterEach(() => vi.unstubAllGlobals());

it('serves proxied HTML as inert plain text so it cannot run on the app origin', async () => {
  vi.mocked(fetch).mockResolvedValue(new Response('<script>steal()</script>', { headers: { 'Content-Type': 'text/html' } }));
  const res = await call('https://docs.google.com/spreadsheets/d/x/export?format=csv');
  expect(res.code).toBe(200);
  expect(res.headers['content-type']).toBe('text/plain; charset=utf-8');
  expect(res.headers['x-content-type-options']).toBe('nosniff');
  expect(res.headers['content-security-policy']).toContain('sandbox');
});
it('keeps JSON and CSV content types the app relies on', async () => {
  vi.mocked(fetch).mockResolvedValue(new Response('a,b', { headers: { 'Content-Type': 'text/csv; charset=utf-8' } }));
  expect((await call('https://docs.google.com/spreadsheets/d/x/export?format=csv')).headers['content-type']).toBe('text/csv; charset=utf-8');
});
it('does not return internal fetch errors to the caller', async () => {
  vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.mocked(fetch).mockRejectedValue(new Error('getaddrinfo ENOTFOUND internal-host.local'));
  const res = await call('https://docs.google.com/spreadsheets/d/x/export?format=csv');
  expect(res.code).toBe(502); expect(JSON.stringify(res.body)).not.toContain('internal-host');
});
