import { expect, it } from 'vitest';
import { existsSync } from 'node:fs';
import { guidePages } from '../config/guidePages.js';
import { editorialPages, toolPages } from '../config/editorialPages.js';
import { PAGE_UPDATED } from '../config/pageUpdated.js';
import { buildGuideArticleJsonLd, buildPageArticleJsonLd } from './guideSchema.js';
import { renderGuidePage, renderEditorialPage, resolvePublicHtml } from './publicSite.js';
import { renderHowItWorksBody } from './howItWorks.js';

const article = (html: string) => [...html.matchAll(/<script type="application\/ld\+json">(.*?)<\/script>/gs)]
  .map(match => JSON.parse(match[1])).find(block => block['@type'] === 'Article');
const guides = Object.keys(guidePages).map(slug => [`/guides/${slug}`, renderGuidePage(slug)]);
const resources = { ...editorialPages, ...toolPages };

it('each calculator and research note is reachable from a relevant guide, and links back to a guide', () => {
  for (const [path, page] of Object.entries(resources)) {
    if (!page.form && page.kind !== 'share' && page.kind !== 'fund') continue;
    expect(guides.some(([, html]) => html.includes(`href="${path}"`)), path).toBe(true);
    expect(renderEditorialPage(path).match(/href="\/guides\/[^"#]+"/), path).not.toBeNull();
  }
});

it('authored guide and resource links resolve, including their section fragments', () => {
  for (const [path, html] of [...guides, ...Object.keys(resources).map(p => [p, renderEditorialPage(p)]), ['/how-it-works', renderHowItWorksBody()]]) {
    for (const match of html.matchAll(/href="(\/(?:guides|tools|markets|how-it-works|about)[^"]*)"/g)) {
      const [target, fragment] = match[1].split('#');
      const destination = resolvePublicHtml(target);
      expect(destination, `${path} → ${match[1]}`).toBeTruthy();
      if (fragment) expect(destination, match[1]).toContain(`id="${fragment}"`);
    }
  }
});

it('changing the modification date never changes the recorded publication date', () => {
  const path = '/guides/fifo-cost-basis-psx';
  const page = guidePages['fifo-cost-basis-psx'];
  const previous = PAGE_UPDATED[path];
  const published = article(buildGuideArticleJsonLd(page, 'fifo-cost-basis-psx')).datePublished;
  try {
    PAGE_UPDATED[path] = '2026-10-20';
    const data = article(buildGuideArticleJsonLd(page, 'fifo-cost-basis-psx'));
    expect(data.datePublished).toBe(published);
    expect(data.dateModified).toBe('2026-10-20');
    expect(published).toBe('2026-09-23');
  } finally {
    PAGE_UPDATED[path] = previous;
  }
  const toolData = article(buildPageArticleJsonLd(toolPages['/tools/dividend-yield'], '/tools/dividend-yield'));
  expect(toolData.datePublished).toBe('2026-09-23');
  expect(toolData.dateModified).toBe('2026-10-16');
});

it('article images are visible, responsive demo figures rather than an unrelated dashboard default', () => {
  for (const [slug, page] of Object.entries(guidePages)) {
    const html = renderGuidePage(slug);
    const data = article(html);
    if (page.image) {
      expect(data.image).toBe(`https://www.psx-tracker.com${page.image}`);
      expect(html).toContain(`content="${data.image}"`);
      expect(html).toContain(`${page.image} 1600w`);
      expect(html).toContain('loading="lazy" decoding="async"');
      expect(existsSync(`public${page.image}`)).toBe(true);
      for (const section of page.sections) for (const block of section.slice(1)) {
        if (typeof block === 'object' && 'figure' in block) {
          for (const suffix of ['', '-480', '-800', '-preview']) {
            expect(existsSync(`public/media/features/${block.figure.file}${suffix}.webp`)).toBe(true);
          }
        }
      }
    } else {
      expect(data.image).toBeUndefined();
    }
  }
});

it('public walkthrough has contextual links without taking signed-in users out of their walkthrough', () => {
  expect(renderHowItWorksBody()).toContain('href="/guides/importing-broker-trades"');
  expect(renderHowItWorksBody({ publicLinks: false })).not.toContain('href="/guides/');
});
