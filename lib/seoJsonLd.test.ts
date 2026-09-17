import { describe, expect, it } from 'vitest';
import { HOME_FAQS, SITE_URL } from '../config/site.js';
import { buildHomeJsonLd, homeJsonLdScriptTags, verificationMetaTag } from './seoJsonLd.js';

describe('seoJsonLd', () => {
  it('builds Organization, SoftwareApplication, and FAQPage graph', () => {
    const blocks = buildHomeJsonLd();
    expect(blocks).toHaveLength(3);
    const [org, app, faq] = blocks;
    expect(org['@type']).toBe('Organization');
    expect(org.url).toBe(SITE_URL);
    expect(app['@type']).toBe('SoftwareApplication');
    expect(app.name).toBe('PSX Tracker');
    expect(faq['@type']).toBe('FAQPage');
    expect(faq.mainEntity.map((e) => e.name)).toEqual(HOME_FAQS.map(([q]) => q));
  });

  it('emits script tags and omits empty verification meta', () => {
    const html = homeJsonLdScriptTags();
    expect(html).toContain('application/ld+json');
    expect(html).toContain('FAQPage');
    expect(verificationMetaTag('')).toBe('');
    expect(verificationMetaTag('abc123')).toContain('google-site-verification');
    expect(verificationMetaTag('abc123')).toContain('abc123');
  });
});
