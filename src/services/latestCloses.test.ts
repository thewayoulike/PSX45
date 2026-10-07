import { beforeEach, expect, it, vi } from 'vitest';

beforeEach(() => { vi.resetModules(); vi.unstubAllGlobals(); });

const bars = (status = 200) => new Response(JSON.stringify({
  bars: [
    { time: Date.now() - 86400000, open: 9, high: 11, low: 8, close: 10, volume: 80 },
    { time: Date.now(), open: 10, high: 12, low: 9, close: 11, volume: 100 },
  ],
}), { status, headers: { 'Content-Type': 'application/json', ...(status === 429 ? { 'Retry-After': '60' } : {}) } });

it('loads a few fresh closes per refresh and keeps them for the next one', async () => {
  const fetch = vi.fn(async () => bars());
  vi.stubGlobal('fetch', fetch);
  const { fetchLatestCloses } = await import('./psxData');
  const symbols = Array.from({ length: 16 }, (_, i) => `A${String(i + 1).padStart(2, '0')}`);
  const first = await fetchLatestCloses(symbols);
  expect(fetch).toHaveBeenCalledTimes(8);
  expect(Object.keys(first)).toHaveLength(8);
  fetch.mockClear();
  const second = await fetchLatestCloses(symbols);
  expect(fetch).toHaveBeenCalledTimes(8);
  expect(Object.keys({ ...first, ...second })).toHaveLength(16);
  fetch.mockClear();
  await fetchLatestCloses(symbols);
  expect(fetch).not.toHaveBeenCalled();
});

it('stops a close refresh when the history limit answers 429', async () => {
  const fetch = vi.fn(async () => bars(429));
  vi.stubGlobal('fetch', fetch);
  const { fetchLatestCloses } = await import('./psxData');
  const symbols = Array.from({ length: 16 }, (_, i) => `B${String(i + 1).padStart(2, '0')}`);
  await fetchLatestCloses(symbols);
  expect(fetch.mock.calls.length).toBeLessThanOrEqual(4);
  const calls = fetch.mock.calls.length;
  await fetchLatestCloses(symbols);
  expect(fetch).toHaveBeenCalledTimes(calls);
});
