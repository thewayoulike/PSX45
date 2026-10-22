import { HOME_FAQS, SITE_URL, GOOGLE_SITE_VERIFICATION, GOOGLE_ANALYTICS_ID, GOOGLE_ADS_ID } from '../config/site.js';
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

/** One Google tag loader for Analytics and Ads, on app and public pages. */
export function analyticsScriptTags(id = GOOGLE_ANALYTICS_ID, adsId = GOOGLE_ADS_ID) {
  const analytics = String(id || '').trim();
  const ads = String(adsId || '').trim();
  const destinations = [
    /^G-[A-Z0-9]+$/i.test(analytics) ? analytics : '',
    /^AW-\d+$/.test(ads) ? ads : '',
  ].filter(Boolean);
  if (!destinations.length) return '';
  // Keep the loader in the HTML for Google's installation checker. Async avoids
  // blocking HTML parsing while the tag downloads.
  return `<!-- Google tag (gtag.js) -->
    <script async src="https://www.googletagmanager.com/gtag/js?id=${destinations[0]}"></script>
    <script>
  window.dataLayer = window.dataLayer || [];
  function gtag(){dataLayer.push(arguments);}
  gtag('js', new Date());

  ${destinations.map(destination => `gtag('config', '${destination}');`).join('\n  ')}
</script>`;
}
