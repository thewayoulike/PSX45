import { describe, it, expect } from 'vitest';
import { parseMarketNews, newsCategory, mergeNewsItems, parseBusinessRecorderRss } from './marketNews.js';
const now = Date.parse('2026-10-19T12:00:00Z');
const item = { title: 'PSX shares gain as investors return', url: 'https://www.brecorder.com/news/40123456?utm_source=rss', seendate: '20261019T110000Z', language: 'English' };
describe('market headline index', () => {
  it('keeps indexing time distinct from publication and removes duplicates', () => {
    const result = parseMarketNews({ articles: [item, { ...item, url: 'https://www.brecorder.com/news/40123456' }, { ...item, url: 'https://www.dawn.com/news/1234567' }] }, now);
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ url: 'https://www.brecorder.com/news/40123456', source: 'Business Recorder', category: 'psx', indexedAt: '2026-10-19T11:00:00.000Z' });
    expect(result[0]).not.toHaveProperty('publishedAt');
  });
  it('rejects unsafe links, unknown publishers, old/future dates and irrelevant headlines', () => {
    expect(parseMarketNews({ articles: [
      { ...item, url: 'javascript:alert(1)' }, { ...item, url: 'https://brecorder.com.evil.test/news/123' },
      { ...item, url: 'https://user@www.brecorder.com/news/123' }, { ...item, seendate: '20261020T110000Z' },
      { ...item, seendate: '20261010T110000Z' }, { ...item, title: 'Pakistan wins a cricket match' },
      { ...item, language: 'French' },
    ] }, now)).toEqual([]);
  });
  it('cleans markup, retains direct source links and sorts newest first', () => {
    const result = parseMarketNews({ articles: [item, { ...item, title: '<b>Gold &amp; silver prices</b> rise today', url: 'https://www.dawn.com/news/1234567', seendate: '20261019T113000Z' }] }, now);
    expect(result[0]).toMatchObject({ title: 'Gold & silver prices rise today', category: 'commodities' });
    expect(result).toHaveLength(2);
    expect(() => parseMarketNews({ error: 'limited' }, now)).toThrow();
  });
  it('assigns meaningful headline categories without inventing sentiment', () => {
    expect(newsCategory('Rupee gains against dollar')).toBe('forex');
    expect(newsCategory('Company announces quarterly earnings')).toBe('companies');
    expect(newsCategory('SBP reduces policy rate')).toBe('economy');
    expect(newsCategory('US stocks rally after earnings')).toBe('companies');
    expect(newsCategory('School board under scrutiny over marking disparity')).toBeNull();
    expect(newsCategory('Actor shares sweet update on life as a dad')).toBeNull();
    expect(newsCategory('Arrests after West Bank attacks')).toBeNull();
    expect(parseMarketNews({ articles: [{ ...item, title: 'AI - Business Insider', url: 'https://www.businessinsider.com/ai' }] }, now)).toEqual([]);
  });
  it('revalidates rolling metadata and removes expired or unsafe stored links', () => {
    const stored = parseMarketNews({ articles: [item] }, now);
    expect(mergeNewsItems([...stored, ...stored, { ...stored[0], url: 'javascript:alert(1)' }], now)).toHaveLength(1);
    expect(mergeNewsItems(stored, now + 4 * 86400000)).toEqual([]);
    expect(stored[0].region).toBe('Pakistan');
  });
  it('keeps general publisher news with its real publication time through cache merges', () => {
    const title = 'Field Marshal Asim Munir, Saudi envoy discuss defence cooperation';
    const xml = `<rss><channel><item xmlns:content="example"><title><![CDATA[${title}]]></title><link>https://www.brecorder.com/news/40444956/field-marshal-asim-munir-saudi-envoy-discuss-defence-cooperation</link><pubDate>Mon, 19 Oct 2026 20:56:01 +0500</pubDate><description>Article body must not be retained</description></item></channel></rss>`;
    const collectedAt = Date.parse('2026-10-19T17:45:00Z');
    const result = parseBusinessRecorderRss(xml, collectedAt);
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ title, category: 'general', publishedAt: '2026-10-19T15:56:01.000Z', provider: 'Business Recorder RSS' });
    expect(JSON.stringify(result)).not.toContain('Article body');
    expect(mergeNewsItems(result, collectedAt)[0]).toMatchObject({ title, category: 'general', publishedAt: '2026-10-19T15:56:01.000Z' });
  });
  it('rejects invalid publisher feeds and links, without promoting stale stories to today', () => {
    const rss = (url: string, date: string) => `<rss><channel><item><title>Pakistan and world news update</title><link>${url}</link><pubDate>${date}</pubDate></item></channel></rss>`;
    expect(() => parseBusinessRecorderRss('<html>Cloudflare challenge</html>', now)).toThrow();
    expect(() => parseBusinessRecorderRss(rss('https://brecorder.com.evil.test/news/123/test', '19 Oct 2026 11:00:00 GMT'), now)).toThrow();
    expect(() => parseBusinessRecorderRss(rss('https://www.brecorder.com/news/123/test', '10 Oct 2026 11:00:00 GMT'), now)).toThrow();
    expect(() => parseBusinessRecorderRss(rss('https://www.brecorder.com/news/123/test', '20 Oct 2026 11:00:00 GMT'), now)).toThrow();
  });
});
