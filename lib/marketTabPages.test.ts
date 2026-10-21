import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';
import { MARKET_TAB_PAGES } from '../config/marketTabs.js';
import { renderMarketTabHtml } from './marketTabPages.js';
import { buildSitemapXml } from './sitemap.js';

const base = readFileSync('markets.html', 'utf8');
const esc = (s: string) => s.replace(/&/g, '&amp;');

it('gives every market tab its own title, description, canonical and breadcrumb', () => {
  const titles = new Set<string>();
  for (const [slug, page] of Object.entries(MARKET_TAB_PAGES)) {
    const html = renderMarketTabHtml(base, slug);
    const url = `https://www.psx-tracker.com/markets/${slug}`;
    expect(html).toContain(`<title>${esc(page.title)}</title>`);
    expect(page.title.length).toBeLessThanOrEqual(60);
    expect(page.description.length).toBeLessThanOrEqual(160);
    expect(html).toContain(`<meta name="description" content="${esc(page.description)}">`);
    expect(html).toContain(`<link rel="canonical" href="${url}">`);
    expect(html).toContain(`<meta property="og:url" content="${url}">`);
    expect(html).toContain(`"position":3,"name":"${page.label}","item":"${url}"`);
    expect(html).toContain(`<h1>${page.heading}</h1>`);
    expect(html).not.toContain('<link rel="canonical" href="https://www.psx-tracker.com/markets">');
    expect(html).toContain('<script type="module"');
    titles.add(page.title);
  }
  expect(titles.size).toBe(Object.keys(MARKET_TAB_PAGES).length);
});

it('links every tab from the markets page and lists them in the sitemap', () => {
  const sitemap = buildSitemapXml();
  for (const slug of Object.keys(MARKET_TAB_PAGES)) {
    expect(base).toContain(`href="/markets/${slug}"`);
    expect(sitemap).toContain(`<loc>https://www.psx-tracker.com/markets/${slug}</loc>`);
  }
});
