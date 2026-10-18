import { afterEach, describe, expect, it, vi } from 'vitest';
import { fetchCommodityBenchmarks, parseCommodityObservation } from './commodityFeeds.js';

const report = (value = '126.55', date = '2026-10-14', frequency = 'Daily') => `
  <span class="series-meta-observation-value">${value}</span>
  <span class="series-meta-value-frequency">${frequency}</span>
  <span class="series-meta-value">${date}:</span>`;
afterEach(() => vi.unstubAllGlobals());
describe('published commodity observations', () => {
  it('pairs the observation date with its price, not the publication date or frequency', () => {
    expect(parseCommodityObservation(report() + '<span class="series-meta-updated-date">Oct 15, 2026</span>', 'Daily')).toEqual({ price: 126.55, date: '2026-10-14' });
    expect(parseCommodityObservation(report('13,542.82087', 'Jul 2026', 'Monthly'), 'Monthly')).toEqual({ price: 13542.82087, date: '2026-07' });
  });
  it('rejects missing values, unexpected units of time, malformed dates and challenge pages', () => {
    for (const html of [report('.'), report(''), report('126.55', '2026-02-30'), report('126.55', 'Jul 2026', 'Monthly'), '<html>Check your browser</html>']) {
      expect(() => parseCommodityObservation(html, 'Daily')).toThrow();
    }
  });
  it('preserves valid zero and negative observations instead of inventing missing data', () => {
    expect(parseCommodityObservation(report('0'), 'Daily').price).toBe(0);
    expect(parseCommodityObservation(report('-37.63'), 'Daily').price).toBe(-37.63);
  });
  it('keeps successful reports when one provider request fails', async () => {
    const fetchMock = vi.fn(async (url: string) => ({ ok: !url.endsWith('DHHNGSP'), text: async () => url.endsWith('PCOPPUSDM') ? report('13,542.82', 'Jul 2026', 'Monthly') : report() }));
    vi.stubGlobal('fetch', fetchMock);
    const result = await fetchCommodityBenchmarks();
    expect(result.quotes).toHaveLength(4);
    expect(result.quotes.find(q => q.id === 'gas')).toMatchObject({ price: null, date: null });
    expect(result.quotes.find(q => q.id === 'copper')).toMatchObject({ price: 13542.82, date: '2026-07', frequency: 'Monthly' });
    expect(fetchMock.mock.calls.every(([url]) => url.startsWith('https://fred.stlouisfed.org/series/'))).toBe(true);
  });
  it('reports total upstream failure rather than returning a successful empty feed', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false }));
    await expect(fetchCommodityBenchmarks()).rejects.toThrow('unavailable');
  });
});
