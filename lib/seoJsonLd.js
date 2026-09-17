import { HOME_FAQS, SITE_URL, GOOGLE_SITE_VERIFICATION } from '../config/site.js';
import { TRIAL_DAYS } from '../config/product.js';

const escapeJson = (value) => JSON.stringify(value).replace(/</g, '\\u003c');

export function buildHomeJsonLd() {
  const description =
    `Live PSX prices, FIFO portfolio tracking, mutual funds with NAV sync, and candlestick charts. ${TRIAL_DAYS}-day free trial — no card required.`;
  return [
    {
      '@context': 'https://schema.org',
      '@type': 'Organization',
      name: 'PSX Tracker',
      url: SITE_URL,
      logo: `${SITE_URL}/brand/premium-badge.svg`,
    },
    {
      '@context': 'https://schema.org',
      '@type': 'SoftwareApplication',
      name: 'PSX Tracker',
      applicationCategory: 'FinanceApplication',
      operatingSystem: 'Web',
      url: SITE_URL,
      description,
      offers: {
        '@type': 'Offer',
        price: '0',
        priceCurrency: 'PKR',
        description: `Free plan after a ${TRIAL_DAYS}-day full trial; Paid plans available`,
      },
    },
    {
      '@context': 'https://schema.org',
      '@type': 'FAQPage',
      mainEntity: HOME_FAQS.map(([question, answer]) => ({
        '@type': 'Question',
        name: question,
        acceptedAnswer: { '@type': 'Answer', text: answer },
      })),
    },
  ];
}

export function homeJsonLdScriptTags() {
  return buildHomeJsonLd()
    .map((block) => `<script type="application/ld+json">${escapeJson(block)}</script>`)
    .join('\n    ');
}

export function verificationMetaTag(token = GOOGLE_SITE_VERIFICATION) {
  const value = String(token || '').trim();
  if (!value) return '';
  return `<meta name="google-site-verification" content="${value.replace(/"/g, '')}" />`;
}
