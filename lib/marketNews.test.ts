import { describe, it, expect } from 'vitest';
import { parseMarketNews, newsCategory } from './marketNews.js';
const now = Date.parse('2026-10-19T12:00:00Z');
const item = { title: 'PSX shares gain as investors return', url: 'https://www.brecorder.com/news/123?utm_source=rss', seendate: '20261019T110000Z', language: 'English' };
describe('market headline index', () => {
  it('keeps indexing time distinct from publication and removes duplicates', () => {
    const result = parseMarketNews({ articles: [item, { ...item, url: 'https://www.brecorder.com/news/123' }, { ...item, url: 'https://www.dawn.com/news/456' }] }, now);
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ url: 'https://www.brecorder.com/news/123', source: 'Business Recorder', category: 'psx', indexedAt: '2026-10-19T11:00:00.000Z' });
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
    const result = parseMarketNews({ articles: [item, { ...item, title: '<b>Gold &amp; silver prices</b> rise today', url: 'https://www.dawn.com/news/1', seendate: '20261019T113000Z' }] }, now);
    expect(result[0]).toMatchObject({ title: 'Gold & silver prices rise today', category: 'commodities' });
    expect(result).toHaveLength(2);
    expect(() => parseMarketNews({ error: 'limited' }, now)).toThrow();
  });
  it('assigns meaningful headline categories without inventing sentiment', () => {
    expect(newsCategory('Rupee gains against dollar')).toBe('forex');
    expect(newsCategory('Company announces quarterly earnings')).toBe('companies');
    expect(newsCategory('SBP reduces policy rate')).toBe('economy');
  });
});
