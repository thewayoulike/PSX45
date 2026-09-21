import { afterEach, describe, expect, it, vi } from 'vitest';
import { chooseDividend, fetchFairValueData, normalizeFairValueData } from './fairValueData';

const at = '2026-09-21T12:00:00Z';
const feed = { ticker: 'OGDC', fundamentals: { price: 100, eps: 10, bookValue: 40, currentPE: 10, dividend: 0 }, balanceSheet: { liabilities: 100, equity: 200, currentAssets: 300, currentLiabilities: 150, inventory: 0 } };
afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });

describe('fair value source selection', () => {
  it('prioritizes the quote without copying market P/E or unverified dividends into assumptions', () => {
    const result = normalizeFairValueData('OGDC', { quotes: { OGDC: { price: 150 } } }, feed, at);
    expect(result.facts.price).toBe(150);
    expect(result.sources.price).toEqual({ name: 'Market quote', retrievedAt: at });
    expect(result.facts.eps).toBe(10);
    expect(result.facts.inventory).toBe(0);
    expect(result.reportedDividend?.value).toBe(0);
    expect(result.facts).not.toHaveProperty('fairPE');
    expect(result.facts).not.toHaveProperty('expectedDiv');
    expect(result.facts).not.toHaveProperty('fcf');
  });
  it('rejects figures from a different or unidentified company', () => {
    const mismatch = normalizeFairValueData('MEBL', { quotes: { OGDC: { price: 150 } } }, feed, at);
    expect(mismatch.facts).toEqual({});
    expect(mismatch.reportedDividend).toBeNull();
    expect(normalizeFairValueData('OGDC', {}, { fundamentals: feed.fundamentals }, at).facts).toEqual({});
  });
  it('normalizes an array of quotes by symbol, not position', () => {
    expect(normalizeFairValueData('OGDC', { quotes: [{ symbol: 'MEBL', last: 123 }, { symbol: 'ogdc', last: '150' }] }, feed, at).facts.price).toBe(150);
  });
  it('reports fallback price and rejects malformed figures without losing genuine losses or zeros', () => {
    const result = normalizeFairValueData('OGDC', {}, { ...feed, fundamentals: { ...feed.fundamentals, eps: -10, bookValue: 'junk' }, balanceSheet: { ...feed.balanceSheet, equity: -1, inventory: false } }, at);
    expect(result.facts).toMatchObject({ price: 100, eps: -10, equity: -1 });
    expect(result.facts.bookValue).toBeUndefined();
    expect(result.facts.inventory).toBeUndefined();
    expect(result.warnings.join(' ')).toMatch(/Market quote unavailable/);
  });
});

describe('refresh requests', () => {
  it('fetches both sources on every refresh, including for a repeated ticker', async () => {
    const fetcher = vi.fn(async (url: string) => new Response(JSON.stringify(url.startsWith('/api/') ? { quotes: { OGDC: { price: 150 } } } : feed), { status: 200 }));
    vi.stubGlobal('fetch', fetcher);
    const result = await fetchFairValueData(' ogdc ');
    await fetchFairValueData('OGDC');
    expect(result.facts.price).toBe(150);
    expect(fetcher).toHaveBeenCalledTimes(6);
    expect(fetcher.mock.calls[0][0]).toContain('symbols=OGDC');
  });
  it('does not accept HTML or empty responses as successful research; a retry can succeed', async () => {
    const fetcher = vi.fn().mockImplementation(async () => new Response('<!DOCTYPE html>oops', { status: 200 }));
    vi.stubGlobal('fetch', fetcher);
    await expect(fetchFairValueData('OGDC')).rejects.toThrow('No usable company figures');
    fetcher.mockImplementation(async () => new Response(JSON.stringify(feed)));
    expect((await fetchFairValueData('OGDC')).facts.price).toBe(100);
    expect(fetcher).toHaveBeenCalledTimes(6);
  });
  it('uses partial results after a source times out and finishes within the 15-second bound', async () => {
    vi.useFakeTimers();
    vi.stubGlobal('fetch', vi.fn((url: string, init: RequestInit) => url.startsWith('/api/') ? Promise.resolve(new Response(JSON.stringify({ quotes: { OGDC: { price: 150 } } }))) : new Promise((_, reject) => init.signal!.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError'))))));
    const pending = fetchFairValueData('OGDC');
    await vi.advanceTimersByTimeAsync(15000);
    const result = await pending;
    expect(result.facts).toEqual({ price: 150 });
    expect(result.warnings.join(' ')).toContain('7 of 8');
    expect(vi.getTimerCount()).toBe(0);
  });
  it('aborts both requests when the selected company changes', async () => {
    const signals: AbortSignal[] = [];
    vi.stubGlobal('fetch', vi.fn((_url: string, init: RequestInit) => new Promise((_, reject) => {
      signals.push(init.signal!);
      init.signal!.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')));
    })));
    const controller = new AbortController();
    const pending = fetchFairValueData('OGDC', controller.signal);
    controller.abort();
    await expect(pending).rejects.toMatchObject({ name: 'AbortError' });
    expect(signals).toHaveLength(3);
    expect(signals.every(signal => signal.aborted)).toBe(true);
  });
  it('rejects invalid symbols before any network request', async () => {
    const fetcher = vi.fn(); vi.stubGlobal('fetch', fetcher);
    await expect(fetchFairValueData('OGDC&other=1')).rejects.toThrow('valid PSX symbol');
    expect(fetcher).not.toHaveBeenCalled();
  });
});

describe('automatic dividend selection', () => {
  it('uses the API annual cash amount, not the most recent payout or the sheet approximation', () => {
    const dividend = chooseDividend('OGDC', { symbol: 'OGDC', latestDividend: { annualDividend: '16.75 PKR', dividendYield: '5.27%', cashAmount: '6.000 PKR', payoutFrequency: 'Quarterly' } }, 17, 318.5, at);
    expect(dividend).toMatchObject({ value: 16.75, source: 'pyPSX annual dividend' });
  });
  it('converts percentage yield to an explicitly identified annual cash estimate', () => {
    const dividend = chooseDividend('OGDC', { symbol: 'OGDC', latestDividend: { annualDividend: '-', dividendYield: '5.27%' } }, 17, 318.5, at);
    expect(dividend).toMatchObject({ value: 16.78495, source: 'pyPSX yield estimate' });
    expect(dividend?.basis).toContain('318.5');
    expect(dividend?.basis).toContain('5.27%');
  });
  it('uses sheet cash dividends when pyPSX has no usable annual amount or yield', () => {
    expect(chooseDividend('OGDC', null, '17', 318.5, at)).toMatchObject({ value: 17, source: 'Sheet dividend', basis: expect.stringContaining('annual assumption') });
    expect(chooseDividend('OGDC', { symbol: 'MEBL', latestDividend: { annualDividend: '99 PKR' } }, 17, 318.5, at)?.value).toBe(17);
  });
  it('preserves a reported zero annual dividend instead of replacing it with another source', () => {
    expect(chooseDividend('OGDC', { symbol: 'OGDC', latestDividend: { annualDividend: '0 PKR', dividendYield: '5%' } }, 17, 318.5, at)?.value).toBe(0);
    expect(chooseDividend('OGDC', null, 0, 318.5, at)?.value).toBe(0);
  });
  it('does not confuse a cash amount with a percentage, or a yield with an amount', () => {
    expect(chooseDividend('OGDC', { symbol: 'OGDC', latestDividend: { annualDividend: '150%', dividendYield: '5 PKR' } }, '150%', 100, at)).toBeNull();
    expect(chooseDividend('OGDC', { symbol: 'OGDC', latestDividend: { dividendYield: '5%' } }, null, undefined, at)).toBeNull();
  });
});
