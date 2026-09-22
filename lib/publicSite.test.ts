import { expect, it } from 'vitest';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { renderPublicPage, renderGuideHub, renderGuidePage, resolvePublicHtml } from './publicSite.js';
import { videoGuide, videoChapters } from './videoGuide.js';
import { featureSections } from '../config/howItWorks.js';
import { renderHowItWorksBody } from './howItWorks.js';
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
  expect(html).toContain('googletagmanager.com/gtag/js');
});

it('guide hub and each guide have unique canonical URLs and CTAs', () => {
  const hub = renderGuideHub();
  expect(hub).toContain('<link rel="canonical" href="https://www.psx-tracker.com/guides">');
  expect(hub).toContain('href="/login"');
  expect(hub).toContain('use the app &amp; learn PSX investing');
  expect(hub).toContain('id="start-here"');
  expect(hub).toContain('id="use-the-app"');
  expect(hub).toContain('id="learn-psx"');
  expect(hub).toContain('class="guide-toc"');
  expect(hub).toContain('href="#start-here"');
  expect(hub).toContain('href="#use-the-app"');
  expect(hub).toContain('href="#learn-psx"');
  expect(hub).toContain('How to use PSX Tracker (start here)');
  expect(hub).toContain('Feature guide with screenshots');
  expect(hub).toContain('/guides/best-psx-portfolio-tracker-excel-alternative');
  for (const slug of Object.keys(guidePages)) {
    const matches = hub.match(new RegExp(`/guides/${slug}`, 'g')) || [];
    expect(matches.length, slug).toBe(1);
    const html = renderGuidePage(slug);
    expect(html).toContain(`<link rel="canonical" href="https://www.psx-tracker.com/guides/${slug}">`);
    expect(html).toContain('<h1>');
    expect(html).toContain('href="/login"');
    expect(html).toContain('href="/guides"');
    expect(html.match(/<h1>/g)).toHaveLength(1);
  }
});

it('every guide is a full article with multiple paragraphs', () => {
  for (const [slug, page] of Object.entries(guidePages)) {
    const blockCount = page.sections.reduce((n, section) => n + Math.max(0, section.length - 1), 0);
    expect(blockCount, slug).toBeGreaterThanOrEqual(8);
    const html = renderGuidePage(slug);
    expect((html.match(/<p>/g) || []).length, slug).toBeGreaterThanOrEqual(6);
  }
});

it('public footer links include Guides', () => {
  expect(PUBLIC_LINKS.some(([label, href]) => label === 'Guides' && href === '/guides')).toBe(true);
});

it('serves the tutorial without authentication and keeps its media opt-in', () => {
  const html = resolvePublicHtml('/how-to-use?t=23.08');
  expect(html).toContain('rel="canonical" href="https://www.psx-tracker.com/how-to-use"');
  expect(html).toContain('controls playsinline preload="none"');
  expect(html).not.toContain('autoplay');
  expect(html).toContain('kind="captions"');
  for (const asset of [videoGuide.video, videoGuide.poster, videoGuide.captions, '/media/tutorial/transcript-v1.txt']) {
    expect(existsSync(`public${asset}`), asset).toBe(true);
  }
  expect(readFileSync(`public${videoGuide.captions}`, 'utf8')).toMatch(/^WEBVTT/);
  expect(readFileSync('vite.config.ts', 'utf8')).toContain("'**/media/tutorial/**'");
  expect(readFileSync('src/sw.js', 'utf8')).toContain('guides|how-to-use');
  expect(readFileSync('public/sitemap.xml', 'utf8')).toContain('https://www.psx-tracker.com/how-to-use');
});

it('shares the illustrated guide between public and signed-in pages with opt-in media', () => {
  const html = resolvePublicHtml('/how-it-works');
  expect(html).toContain('rel="canonical" href="https://www.psx-tracker.com/how-it-works"');
  expect(html).toContain(renderHowItWorksBody());
  expect(html).toContain('controls playsinline preload="none"');
  expect(html).not.toContain('autoplay');
  expect(html).not.toContain('Download video');
  expect(html).not.toContain('Read the full transcript');
  for (const section of featureSections) {
    expect(html).toContain(`id="guide-${section.id}"`);
    for (const image of section.images) {
      expect(existsSync(`public/media/features/${image.file}`), image.file).toBe(true);
      expect(existsSync(`public/media/features/${image.file.replace('.webp', '-preview.webp')}`)).toBe(true);
    }
  }
  expect(readFileSync('vite.config.ts', 'utf8')).toContain("'**/media/features/**'");
  expect(readFileSync('public/sitemap.xml', 'utf8')).toContain('/how-it-works');
});

it('keeps video chapters ordered within the runtime and provides a direct-file fallback', () => {
  expect(videoChapters.slice(0, 2).map(([title]) => title)).toEqual(['Create a portfolio', 'Set up your broker']);
  const html = resolvePublicHtml('/how-to-use');
  let previous = -1;
  for (const [title, start] of videoChapters) {
    expect(start).toBeGreaterThan(previous);
    expect(start).toBeLessThan(videoGuide.duration);
    expect(html).toContain(`href="${videoGuide.video}#t=${start}"`);
    expect(html).toContain(title);
    previous = Number(start);
  }
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

it('CSP drops paid scraper hosts and blocks inline event handlers', () => {
  const config = JSON.parse(readFileSync('vercel.json', 'utf8'));
  const csp = config.headers.find((h: any) => h.source === '/(.*)').headers
    .find((h: any) => h.key === 'Content-Security-Policy').value as string;
  expect(csp).toContain("script-src-attr 'none'");
  expect(csp).not.toContain('api.scrape.do');
  expect(csp).not.toContain('webscraping.ai');
});

it('sitemap excludes signed-in pages and hosting excludes them from indexing', () => {
  const sitemap = readFileSync('public/sitemap.xml', 'utf8');
  expect(sitemap).not.toContain('/suggestions');
  expect(sitemap).not.toContain('/login');
  expect(sitemap).toContain('/guides/fifo-cost-basis-psx');
  expect(sitemap).toContain('/guides/best-psx-portfolio-tracker-excel-alternative');
  const config = JSON.parse(readFileSync('vercel.json', 'utf8'));
  expect(config.headers.find((h: any) => h.source.includes('suggestions')).headers).toContainEqual({
    key: 'X-Robots-Tag',
    value: 'noindex, follow',
  });
});

it('leave-Excel guide answers primary intent without crowning a #1', () => {
  expect(guidePages).toHaveProperty('best-psx-portfolio-tracker-excel-alternative');
  const page = guidePages['best-psx-portfolio-tracker-excel-alternative'];
  const copy = [page.title, page.description, page.intro, page.blurb, ...page.sections.flat()].join('\n');
  const html = renderGuidePage('best-psx-portfolio-tracker-excel-alternative');
  expect(html).toContain('Best PSX Portfolio Tracker Alternatives to Excel and Google Sheets (2026)');
  expect(html).toContain('FIFO');
  expect(html).toContain('NCCPL');
  expect(html).toContain('mutual fund');
  expect(html).toContain('SmartPSX');
  expect(html).toContain('FolioSync');
  expect(html).toMatch(/7-day|seven-day/i);
  expect(copy.toLowerCase()).not.toMatch(/#\s*1\b|number one|best by a huge margin/);
  expect(html).toContain('not a tax filer');
  expect(html).toContain('<table>');
  expect(html).toContain('<h3>FIFO lots vs average / weighted cost</h3>');
  expect(html).toContain('ChatGPT');
  expect(html).toContain('FAQPage');
  expect(html).toContain('https://www.mufap.com.pk/Industry/IndustryStatDaily?tab=3');
  expect(html).toContain('/guides/fifo-cost-basis-psx');
  expect(html).toContain('/guides/tracking-psx-dividends');
  expect(html).toContain('/guides/multi-portfolio-stocks-vs-funds');
  expect(html).toContain('/how-to-use');
  expect(html).toContain('application/ld+json');
});

it('service worker navigation denylist lets crawlers see sitemap, robots, and public HTML', () => {
  const sw = readFileSync('src/sw.js', 'utf8');
  const match = sw.match(/denylist:\s*\[([^\]]+)\]/);
  expect(match).toBeTruthy();
  const denylist = match![1];
  expect(denylist).toMatch(/sitemap\\.xml/);
  expect(denylist).toMatch(/robots\\.txt/);
  expect(denylist).toMatch(/guides/);
  expect(denylist).toMatch(/about\|privacy\|terms\|contact/);
});

it('keeps API entrypoints within the 12-function deployment budget', () => {
  expect(readdirSync('api').filter((f) => /\.(js|py)$/.test(f)).length).toBeLessThanOrEqual(12);
  const config = JSON.parse(readFileSync('vercel.json', 'utf8'));
  expect(config.rewrites).toContainEqual({ source: '/api/request-access', destination: '/api/notify-signup' });
});
