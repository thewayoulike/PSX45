import { beforeEach, describe, expect, it, vi } from 'vitest';

const table = `<table id="historicalTable">${Array.from({ length: 5 }, (_, i) =>
  `<tr><td>Sep ${i + 1}, 2026</td><td>10</td><td>12</td><td>9</td><td>11</td><td>1000</td></tr>`
).join('')}</table>`;

function portal(key: string) {
  return new Response(`<html>"_k":"${key}"</html>`, { status: 200 });
}

async function loadOhlc() {
  vi.resetModules();
  return import('./psxOhlc.js');
}

beforeEach(() => {
  vi.unstubAllGlobals();
});

describe('PSX historical fetch', () => {
  it('sends the portal request id as an Ajax call', async () => {
    const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
      if (init?.method === 'POST') return new Response(table, { status: 200 });
      return portal('portal-key-1');
    });
    vi.stubGlobal('fetch', fetchMock);

    const { fetchPsxOhlc } = await loadOhlc();
    const payload = await fetchPsxOhlc('EFERT');

    expect(payload.bars).toHaveLength(5);
    const post = fetchMock.mock.calls.find((call) => call[1]?.method === 'POST');
    expect(post?.[1].headers['X-Requested-With']).toBe('XMLHttpRequest');
    expect(post?.[1].headers['X-Req-Id']).toBe('portal-key-1');
  });

  it('refreshes the portal token once when PSX rejects the first call', async () => {
    const keys = ['stale-key', 'fresh-key'];
    const posted: string[] = [];
    const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
      if (init?.method === 'POST') {
        const id = init.headers['X-Req-Id'];
        posted.push(id);
        if (id === 'stale-key') return new Response('nope', { status: 404 });
        return new Response(table, { status: 200 });
      }
      return portal(keys.shift() || 'fresh-key');
    });
    vi.stubGlobal('fetch', fetchMock);

    const { fetchPsxOhlc } = await loadOhlc();
    const payload = await fetchPsxOhlc('EFERT');

    expect(payload.count).toBe(5);
    expect(posted).toEqual(['stale-key', 'fresh-key']);
  });
});
