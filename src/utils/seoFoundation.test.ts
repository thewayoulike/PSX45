// src/utils/seoFoundation.test.ts
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = process.cwd();

const TITLE = 'PSX Tracker — Pakistan Stock Exchange Portfolio & Charts';
const DESCRIPTION =
  'Live PSX prices, FIFO portfolio tracking, mutual funds with NAV sync, and candlestick charts. 15-day free trial — no card required.';
const CANONICAL = 'https://www.psx-tracker.com/';
const OG_IMAGE = 'https://www.psx-tracker.com/preview/dashboard.png';

function read(rel: string): string {
  return readFileSync(join(root, rel), 'utf8');
}

describe('SEO foundation', () => {
  it('ships robots.txt that allows crawl and points at sitemap', () => {
    const robots = read('public/robots.txt');
    expect(robots).toMatch(/User-agent:\s*\*/i);
    expect(robots).toMatch(/Allow:\s*\//i);
    expect(robots).toContain('Sitemap: https://www.psx-tracker.com/sitemap.xml');
  });

  it('ships sitemap.xml with the canonical homepage', () => {
    const sitemap = read('public/sitemap.xml');
    expect(sitemap).toContain('<urlset');
    expect(sitemap).toContain(`<loc>${CANONICAL}</loc>`);
  });

  it('index.html has title, description, canonical, robots, and social tags', () => {
    const html = read('index.html');
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
  });

  it('keeps src/index.html identical to root index.html', () => {
    expect(existsSync(join(root, 'src/index.html'))).toBe(true);
    expect(read('src/index.html')).toBe(read('index.html'));
  });

  it('OG preview image file exists in public/', () => {
    expect(existsSync(join(root, 'public/preview/dashboard.png'))).toBe(true);
  });
});
