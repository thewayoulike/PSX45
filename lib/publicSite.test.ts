import { expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { renderPublicPage, renderGuideHub, renderGuidePage } from './publicSite.js';
import { publicPages } from '../config/publicPages.js';
import { guidePages } from '../config/guidePages.js';
import { feedbackLinks, SUPPORT_EMAIL, PUBLIC_LINKS } from '../config/site.js';

it.each(Object.keys(publicPages))('%s has unique server-rendered content and its own canonical URL', (slug) => {
  const html = renderPublicPage(slug);
  expect(html).toContain(`<link rel="canonical" href="https://www.psx-tracker.com/${slug}">`);
  expect(html).toContain('<h1>');
  expect(html).toContain('href="/login"');
  expect(html).not.toContain('src="/src/');
  expect(html.match(/<h1>/g)).toHaveLength(1);
});

it('guide hub and each guide have unique canonical URLs and CTAs', () => {
  const hub = renderGuideHub();
  expect(hub).toContain('<link rel="canonical" href="https://www.psx-tracker.com/guides">');
  expect(hub).toContain('href="/login"');
  for (const slug of Object.keys(guidePages)) {
    expect(hub).toContain(`/guides/${slug}`);
    const html = renderGuidePage(slug);
    expect(html).toContain(`<link rel="canonical" href="https://www.psx-tracker.com/guides/${slug}">`);
    expect(html).toContain('<h1>');
    expect(html).toContain('href="/login"');
    expect(html).toContain('href="/guides"');
    expect(html.match(/<h1>/g)).toHaveLength(1);
  }
});

it('public footer links include Guides', () => {
  expect(PUBLIC_LINKS.some(([label, href]) => label === 'Guides' && href === '/guides')).toBe(true);
});

it('feedback encodes draft text and uses the authorized support destination', () => {
  const links = feedbackLinks('Bug report', 'Charts & scroll', 'A&b?\nNew line');
  const email = new URL(links.email);
  expect(email.pathname).toBe(SUPPORT_EMAIL);
  expect(email.searchParams.get('body')).toBe('A&b?\nNew line');
  const wa = new URL(links.whatsapp);
  expect(wa.pathname).toBe('/923474440983');
  expect(wa.searchParams.get('text')).toContain('Charts & scroll');
});

it('sitemap excludes signed-in pages and hosting excludes them from indexing', () => {
  const sitemap = readFileSync('public/sitemap.xml', 'utf8');
  expect(sitemap).not.toContain('/suggestions');
  expect(sitemap).not.toContain('/login');
  expect(sitemap).toContain('/guides/fifo-cost-basis-psx');
  const config = JSON.parse(readFileSync('vercel.json', 'utf8'));
  expect(config.headers.find((h: any) => h.source.includes('suggestions')).headers).toContainEqual({
    key: 'X-Robots-Tag',
    value: 'noindex, follow',
  });
});

it('keeps API entrypoints within the 12-function deployment budget', () => {
  expect(readdirSync('api').filter((f) => /\.(js|py)$/.test(f)).length).toBeLessThanOrEqual(12);
  const config = JSON.parse(readFileSync('vercel.json', 'utf8'));
  expect(config.rewrites).toContainEqual({ source: '/api/request-access', destination: '/api/notify-signup' });
});
