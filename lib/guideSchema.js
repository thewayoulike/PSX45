import { SITE_URL } from '../config/site.js';
import { PAGE_UPDATED } from '../config/pageUpdated.js';
import { guideFaqExtras } from '../config/guideFaqExtras.js';

const escapeJson = (value) => JSON.stringify(value).replace(/</g, '\\u003c');

export const GUIDE_AUTHOR = 'PSX Tracker';

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

export function updatedIso(path) {
  const date = PAGE_UPDATED[path];
  if (!date) throw new Error(`Missing updated date for ${path}`);
  return date;
}

export function guideUpdated(slug) {
  return updatedIso(`/guides/${slug}`);
}

export function formatUpdated(iso) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso || '');
  if (!match) throw new Error(`Bad updated date: ${iso}`);
  const day = Number(match[3]);
  const month = MONTHS[Number(match[2]) - 1];
  return `${day} ${month} ${match[1]}`;
}

export function faqsForGuide(slug, pageFaqs) {
  const faqs = pageFaqs?.length ? pageFaqs : guideFaqExtras[slug];
  return faqs || [];
}

export function buildPageArticleJsonLd(page, path) {
  const updated = updatedIso(path);
  const url = `${SITE_URL}${path}`;
  const block = {
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: page.h1 || page.title,
    description: page.description,
    datePublished: updated,
    dateModified: updated,
    author: { '@type': 'Organization', name: GUIDE_AUTHOR, url: SITE_URL },
    publisher: {
      '@type': 'Organization',
      name: GUIDE_AUTHOR,
      url: SITE_URL,
      logo: { '@type': 'ImageObject', url: `${SITE_URL}/brand/premium-badge.svg` },
    },
    image: `${SITE_URL}/preview/dashboard.png`,
    mainEntityOfPage: url,
  };
  return `<script type="application/ld+json">${escapeJson(block)}</script>`;
}

export function buildPageBreadcrumbJsonLd(page, path) {
  const crumbs = [{ name: 'Home', item: `${SITE_URL}/` }];
  if (path.startsWith('/markets')) crumbs.push({ name: 'Markets', item: `${SITE_URL}/markets` });
  if (path.startsWith('/tools')) crumbs.push({ name: 'Tools', item: `${SITE_URL}/tools` });
  if (path !== '/markets' && path !== '/tools') crumbs.push({ name: page.h1 || page.title, item: `${SITE_URL}${path}` });
  const block = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: crumbs.map((crumb, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      name: crumb.name,
      item: crumb.item,
    })),
  };
  return `<script type="application/ld+json">${escapeJson(block)}</script>`;
}

export function buildGuideArticleJsonLd(page, slug) {
  const updated = guideUpdated(slug);
  const url = `${SITE_URL}/guides/${slug}`;
  const block = {
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: page.title,
    description: page.description,
    datePublished: updated,
    dateModified: updated,
    author: { '@type': 'Organization', name: GUIDE_AUTHOR, url: SITE_URL },
    publisher: {
      '@type': 'Organization',
      name: GUIDE_AUTHOR,
      url: SITE_URL,
      logo: { '@type': 'ImageObject', url: `${SITE_URL}/brand/premium-badge.svg` },
    },
    image: `${SITE_URL}/preview/dashboard.png`,
    mainEntityOfPage: url,
  };
  return `<script type="application/ld+json">${escapeJson(block)}</script>`;
}

export function buildGuideBreadcrumbJsonLd(page, slug) {
  const block = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Home', item: `${SITE_URL}/` },
      { '@type': 'ListItem', position: 2, name: 'Guides', item: `${SITE_URL}/guides` },
      { '@type': 'ListItem', position: 3, name: page.title, item: `${SITE_URL}/guides/${slug}` },
    ],
  };
  return `<script type="application/ld+json">${escapeJson(block)}</script>`;
}
