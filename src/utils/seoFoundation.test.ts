// src/utils/seoFoundation.test.ts
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { TRIAL_DAYS } from '../../config/product.js';
import { guidePages } from '../../config/guidePages.js';
import { GOOGLE_ANALYTICS_ID } from '../../config/site.js';
import { homeJsonLdScriptTags, verificationMetaTag, analyticsScriptTags } from '../../lib/seoJsonLd.js';

const root = process.cwd();

const TITLE = 'PSX Tracker — Pakistan Stock Exchange Portfolio & Charts';
const DESCRIPTION =
  `Live PSX prices, FIFO portfolio tracking, mutual funds with NAV sync, and candlestick charts. ${TRIAL_DAYS}-day free trial — no card required.`;
const CANONICAL = 'https://www.psx-tracker.com/';
const OG_IMAGE = 'https://www.psx-tracker.com/preview/dashboard.png';

function read(rel: string): string {
  return readFileSync(join(root, rel), 'utf8');
}

function expandHome(html: string): string {
  return html
    .replaceAll('%TRIAL_DAYS%', String(TRIAL_DAYS))
    .replaceAll('%SEO_JSON_LD%', homeJsonLdScriptTags())
    .replaceAll('%GOOGLE_SITE_VERIFICATION_META%', verificationMetaTag())
    .replaceAll('%GOOGLE_ANALYTICS%', analyticsScriptTags());
}

describe('SEO foundation', () => {
  it('ships robots.txt that allows crawl and points at sitemap', () => {
    const robots = read('public/robots.txt');
    expect(robots).toMatch(/User-agent:\s*\*/i);
    expect(robots).toMatch(/Allow:\s*\//i);
    expect(robots).toContain('Sitemap: https://www.psx-tracker.com/sitemap.xml');
  });

  it('ships sitemap.xml with homepage, legal pages and guides', () => {
    const sitemap = read('public/sitemap.xml');
    expect(sitemap).toContain('<urlset');
    expect(sitemap).toContain(`<loc>${CANONICAL}</loc>`);
    expect(sitemap).toContain('<loc>https://www.psx-tracker.com/guides</loc>');
    for (const slug of Object.keys(guidePages)) {
      expect(sitemap).toContain(`<loc>https://www.psx-tracker.com/guides/${slug}</loc>`);
    }
  });

  it('index.html has title, description, canonical, robots, social tags and JSON-LD', () => {
    const html = expandHome(read('index.html'));
    expect(html).toContain(`<title>${TITLE}</title>`);
    expect(html).toContain(`content="${DESCRIPTION}"`);
    expect(html).toContain(`rel="canonical" href="${CANONICAL}"`);
    expect(html).toContain('name="robots" content="index, follow"');
    expect(html).toContain(`property="og:url" content="${CANONICAL}"`);
    expect(html).toContain(`property="og:title" content="${TITLE}"`);
    expect(html).toContain(`property="og:description" content="${DESCRIPTION}"`);
    expect(html).toContain(`property="og:image" content="${OG_IMAGE}"`);
    expect(html).toContain('property="og:type" content="website"');
    expect(html).toContain('name="twitter:card" content="summary_large_image"');
    expect(html).toContain(`name="twitter:title" content="${TITLE}"`);
    expect(html).toContain(`name="twitter:description" content="${DESCRIPTION}"`);
    expect(html).toContain(`name="twitter:image" content="${OG_IMAGE}"`);
    expect(html).toContain('application/ld+json');
    expect(html).toContain('FAQPage');
    expect(html).toContain('href="/guides"');
  });

  it('ships GA4 tags when a Measurement ID is configured', () => {
    expect(GOOGLE_ANALYTICS_ID).toMatch(/^G-[A-Z0-9]+$/i);
    expect(analyticsScriptTags('')).toBe('');
    expect(analyticsScriptTags('bad')).toBe('');
    const tags = analyticsScriptTags();
    expect(tags).toContain(`gtag/js?id=${GOOGLE_ANALYTICS_ID}`);
    expect(tags).toContain(`gtag('config', '${GOOGLE_ANALYTICS_ID}')`);
    const html = expandHome(read('index.html'));
    expect(html).toContain(`gtag/js?id=${GOOGLE_ANALYTICS_ID}`);
    expect(html).toContain(`gtag('config', '${GOOGLE_ANALYTICS_ID}')`);
    expect(read('vercel.json')).toContain('googletagmanager.com');
    expect(read('vercel.json')).toContain('google-analytics.com');
    expect(read('vercel.json')).toMatch(/script-src[^"]*unsafe-inline|sha256-/);
  });

  it('keeps src/index.html identical to root index.html', () => {
    expect(existsSync(join(root, 'src/index.html'))).toBe(true);
    expect(read('src/index.html')).toBe(read('index.html'));
  });

  it('OG preview image file exists in public/', () => {
    expect(existsSync(join(root, 'public/preview/dashboard.png'))).toBe(true);
  });
});
