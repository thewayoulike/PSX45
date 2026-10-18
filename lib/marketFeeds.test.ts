import { expect, it, vi, afterEach } from 'vitest';
import { fetchMarketFeed, MARKET_FEEDS } from './marketFeeds.js';
afterEach(() => vi.unstubAllGlobals());
it('only retrieves the fixed public feed set', async () => {
  const fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ rates: { USD: 1 } }) });
  vi.stubGlobal('fetch', fetch);
  const result = await fetchMarketFeed('fx');
  expect(fetch.mock.calls[0][0]).toBe(MARKET_FEEDS.fx.url);
  expect(result.ttl).toBe(3600);
  await expect(fetchMarketFeed('https://example.com/private')).rejects.toThrow('Unknown market feed');
  expect(fetch).toHaveBeenCalledTimes(1);
});
it('does not disguise an upstream failure as a successful feed', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 429 }));
  await expect(fetchMarketFeed('crypto')).rejects.toThrow('429');
});
