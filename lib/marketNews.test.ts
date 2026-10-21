import { describe, it, expect } from 'vitest';
import { parseMarketNews, newsCategory, newsTopics, mergeNewsItems, parseBusinessRecorderRss, parsePublisherRss } from './marketNews.js';
const now = Date.parse('2026-10-19T12:00:00Z');
const item = { title: 'PSX shares gain as investors return', url: 'https://www.brecorder.com/news/40123456?utm_source=rss', seendate: '20261019T110000Z', language: 'English' };
describe.each([
  { publisher: 'Business Recorder', url: 'https://www.brecorder.com/news/40445269/rupee-gains', parse: (xml: string) => parseBusinessRecorderRss(xml, now) },
  { publisher: 'Dawn', url: 'https://www.dawn.com/news/1234567', parse: (xml: string) => parsePublisherRss(xml, 'dawn-business', now) },
])('$publisher RSS article content', ({ url, parse }) => {
  const headline = `<title><![CDATA[Rupee &amp; dollar update]]></title><link>${url}</link><pubDate>19 Oct 2026 11:00:00 GMT</pubDate>`;
  const feed = (content = '') => `<rss><channel><item>${content}${headline}</item></channel></rss>`;

  it('ignores HTML documents and RSS-like tags inside article CDATA', () => {
    const embedded = `<content:encoded><![CDATA[<script type="text/plain"><!DOCTYPE html><html><title>Embedded chart</title></html></script><!ENTITY example "article text"><item><title>Fake story</title><link>${url}/fake</link><pubDate>19 Oct 2026 11:00:00 GMT</pubDate></item>]]></content:encoded>`;
    const result = parse(feed(embedded));
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ title: 'Rupee & dollar update', url });
    expect(JSON.stringify(result)).not.toMatch(/Embedded chart|Fake story|DOCTYPE|article text/);
  });

  it('still rejects XML DTD and entity declarations outside CDATA', () => {
    expect(() => parse(`<!DOCTYPE rss [<!ENTITY external SYSTEM "https://example.com/entity">]>${feed()}`)).toThrow('Invalid publisher feed');
    expect(() => parse(feed('<description><![CDATA[Harmless article]]></description><!ENTITY external "value">'))).toThrow('Invalid publisher feed');
  });

  it('does not accept an RSS document that exists only inside CDATA or a comment', () => {
    expect(() => parse(`<![CDATA[${feed()}]]>`)).toThrow('Invalid publisher feed');
    expect(() => parse(`<!--${feed()}-->`)).toThrow('Invalid publisher feed');
  });
});

describe('market headline index', () => {
  it('retains multiple verified publishers, timestamps and topics through snapshot merges', () => {
    const rss = (title: string, url: string) => `<rss><channel><item><title>${title}</title><link>${url}</link><pubDate>Mon, 19 Oct 2026 11:00:00 GMT</pubDate><description>Private article body must not be retained</description></item></channel></rss>`;
    const news = [
      ...parsePublisherRss(rss('PSX stocks rally after earnings', 'https://www.dawn.com/news/1234567'), 'dawn-business', now),
      ...parsePublisherRss(rss('Oil prices rise on supply concerns', 'https://www.cnbc.com/2026/10/19/oil-prices-rise.html'), 'cnbc-energy', now),
      ...parsePublisherRss(rss('Bitcoin fund flows recover', 'https://www.coindesk.com/markets/2026/10/19/bitcoin-flows'), 'coindesk-news', now),
    ];
    const result = mergeNewsItems([...news, ...news], now);
    expect(result).toHaveLength(3);
    expect(result.map(item => item.topics)).toEqual(expect.arrayContaining([['stocks'], ['commodities'], ['crypto']]));
    expect(result.every(item => item.publishedAt === '2026-10-19T11:00:00.000Z')).toBe(true);
    expect(JSON.stringify(result)).not.toContain('Private article');
    expect(mergeNewsItems(result, now + 8 * 86400000)).toEqual([]);
  });
  it('rejects cross-publisher injections and timestamps with no timezone', () => {
    const rss = (url: string, date: string) => `<rss><channel><item><title>Gold prices rise today</title><link>${url}</link><pubDate>${date}</pubDate></item></channel></rss>`;
    expect(() => parsePublisherRss(rss('https://www.dawn.com/news/1234567', '19 Oct 2026 11:00:00 GMT'), 'coindesk-news', now)).toThrow();
    expect(() => parsePublisherRss(rss('https://www.dawn.com/news/1234567', '2026-10-19 11:00:00'), 'dawn-business', now)).toThrow();
    expect(newsTopics('Pakistan wins a gold medal in the championship')).toEqual([]);
    expect(newsTopics('Field Marshal and Saudi envoy discuss defence cooperation')).toEqual([]);
    expect(newsTopics('Actor shares an update from the silver screen')).toEqual([]);
  });
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
    expect(mergeNewsItems(stored, now + 8 * 86400000)).toEqual([]);
    expect(stored[0].region).toBe('Pakistan');
  });
  it('keeps general publisher news with its real publication time through cache merges', () => {
    const title = 'Field Marshal Asim Munir, Saudi envoy discuss defence cooperation';
    const xml = `<rss><channel><item xmlns:content="example"><title><![CDATA[${title}]]></title><link>https://www.brecorder.com/news/40444956/field-marshal-asim-munir-saudi-envoy-discuss-defence-cooperation</link><category>Pakistan</category><pubDate>Mon, 19 Oct 2026 20:56:01 +0500</pubDate><description>Article body must not be retained</description></item></channel></rss>`;
    const collectedAt = Date.parse('2026-10-19T17:45:00Z');
    const result = parseBusinessRecorderRss(xml, collectedAt);
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ title, category: 'pakistan', publisherCategory: 'Pakistan', publishedAt: '2026-10-19T15:56:01.000Z', provider: 'Business Recorder RSS' });
    expect(JSON.stringify(result)).not.toContain('Article body');
    expect(mergeNewsItems(result, collectedAt)[0]).toMatchObject({ title, category: 'pakistan', publishedAt: '2026-10-19T15:56:01.000Z' });
  });
  it('rejects invalid publisher feeds and links, without promoting stale stories to today', () => {
    const rss = (url: string, date: string) => `<rss><channel><item><title>Pakistan and world news update</title><link>${url}</link><pubDate>${date}</pubDate></item></channel></rss>`;
    expect(() => parseBusinessRecorderRss('<html>Cloudflare challenge</html>', now)).toThrow();
    expect(() => parseBusinessRecorderRss(rss('https://brecorder.com.evil.test/news/123/test', '19 Oct 2026 11:00:00 GMT'), now)).toThrow();
    expect(parseBusinessRecorderRss(rss('https://www.brecorder.com/news/123/test', '10 Oct 2026 11:00:00 GMT'), now)).toEqual([]);
    expect(() => parseBusinessRecorderRss(rss('https://www.brecorder.com/news/123/test', '20 Oct 2026 11:00:00 GMT'), now)).toThrow();
  });
  it('includes short headlines and every publisher section without a financial-keyword filter or 300-story cutoff', () => {
    const sections = ['Pakistan', 'World', 'Markets', 'Business &amp; Finance', 'Technology', 'Sports', 'Life &amp; Style', 'Editorials', 'Opinion', 'Perspectives', 'BR Research', 'A new section'];
    const xml = `<rss><channel>${Array.from({ length: 330 }, (_, i) => `<item><title>News ${i}</title><link>https://www.brecorder.com/news/${40000000 + i}/story</link><category>${sections[i % sections.length]}</category><pubDate>19 Oct 2026 11:00:00 GMT</pubDate></item>`).join('')}</channel></rss>`;
    const items = parseBusinessRecorderRss(xml, now);
    expect(items).toHaveLength(330);
    expect(new Set(items.map(item => item.category))).toEqual(new Set(['pakistan', 'world', 'markets', 'business-finance', 'technology', 'sports', 'life-style', 'editorials', 'opinion', 'perspectives', 'br-research', 'general']));
    expect(mergeNewsItems([...items, ...items], now)).toHaveLength(330);
    expect(mergeNewsItems(items, now + 8 * 86400000)).toEqual([]);
  });
  it('uses the publisher section when an item omits it and retains separate stories with identical titles', () => {
    const story = (id: number, slug: string) => `<item><title>Daily roundup</title><link>https://www.brecorder.com/news/${id}/${slug}</link><pubDate>19 Oct 2026 11:00:00 GMT</pubDate></item>`;
    const items = parseBusinessRecorderRss(`<rss><channel><title>Business Recorder - World</title>${story(40000001, 'old-slug')}${story(40000001, 'new-slug')}${story(40000002, 'daily-roundup')}</channel></rss>`, now);
    expect(items).toHaveLength(2);
    expect(items.every(item => item.category === 'world')).toBe(true);
  });
});
