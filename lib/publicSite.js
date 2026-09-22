import { renderHowItWorksBody } from './howItWorks.js';
import { publicPages } from '../config/publicPages.js';
import { guidePages, guideHub, guideHubClusters, guideHubStartHere, guideHubToc } from '../config/guidePages.js';
import { SITE_URL, PUBLIC_LINKS, SUPPORT_EMAIL, SUPPORT_PHONE } from '../config/site.js';
import { analyticsScriptTags } from './seoJsonLd.js';
import { videoGuide, renderVideoGuideBody, videoGuideHead } from './videoGuide.js';

const escape = (value) => String(value).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const escapeJson = (value) => JSON.stringify(value).replace(/</g, '\\u003c');

export function buildGuideFaqJsonLd(faqs, pageUrl) {
  if (!faqs?.length) return '';
  const block = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: faqs.map(([question, answer]) => ({
      '@type': 'Question',
      name: question,
      acceptedAnswer: { '@type': 'Answer', text: answer },
    })),
  };
  if (pageUrl) block.url = pageUrl;
  return `<script type="application/ld+json">${escapeJson(block)}</script>`;
}

function renderGuideBlock(block) {
  if (Array.isArray(block)) {
    return `<ul>${block.map((item) => `<li>${escape(item)}</li>`).join('')}</ul>`;
  }
  if (typeof block === 'string') {
    return `<p>${escape(block)}</p>`;
  }
  if (block && typeof block === 'object') {
    if (block.h3) return `<h3>${escape(block.h3)}</h3>`;
    if (block.table?.headers && block.table?.rows) {
      const head = block.table.headers.map((h) => `<th scope="col">${escape(h)}</th>`).join('');
      const body = block.table.rows.map((row) =>
        `<tr>${row.map((cell) => `<td>${escape(cell)}</td>`).join('')}</tr>`).join('');
      return `<div class="table-wrap"><table><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table></div>`;
    }
    if (Array.isArray(block.links)) {
      return `<ul class="source-list">${block.links.map((l) => {
        const rel = l.external ? ' target="_blank" rel="noopener noreferrer"' : '';
        const note = l.note ? ` — ${escape(l.note)}` : '';
        return `<li><a href="${escape(l.href)}"${rel}>${escape(l.label)}</a>${note}</li>`;
      }).join('')}</ul>`;
    }
  }
  return '';
}

function guideCardHtml(href, title, blurb, featured = false) {
  return `<a href="${escape(href)}" class="${featured ? 'featured' : ''}"><strong>${escape(title)}</strong><span>${escape(blurb)}</span></a>`;
}

const css = `:root{color-scheme:light dark;--bg:#f8fafc;--card:#fff;--text:#0f172a;--muted:#526174;--line:#dfe6ed;--green:#008968;--blue:#007f9c}*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--text);font:16px/1.75 system-ui,sans-serif}a{color:var(--blue);text-underline-offset:4px}a:focus-visible,summary:focus-visible{outline:3px solid var(--green);outline-offset:4px}header{background:var(--card);border-bottom:1px solid var(--line);padding:calc(12px + env(safe-area-inset-top)) 20px 12px}header>div{max-width:1060px;margin:auto;display:flex;align-items:center;justify-content:space-between;gap:12px}.brand{display:flex;gap:10px;align-items:center;text-decoration:none;font-size:23px;line-height:1.15;white-space:nowrap}.brand img{width:36px;height:41px}.brand b{color:var(--green)}.brand span{color:var(--blue)}.brand small{display:block;font-size:8px;font-weight:700;letter-spacing:1.3px;margin-top:6px}.brand small i{font-style:normal;color:var(--green)}.dark-logo{display:none}.button{display:inline-flex;align-items:center;justify-content:center;min-height:44px;padding:10px 18px;background:#009879;color:white;border-radius:12px;text-decoration:none;font-weight:700;line-height:1.5}.secondary{background:var(--card);border:1px solid var(--line);color:var(--text)}nav{display:flex;gap:8px 22px;flex-wrap:wrap}nav a{display:inline-block;padding:9px 0}main{max-width:1060px;margin:auto;padding:46px 22px 72px}.eyebrow{color:var(--green);font-size:12px;font-weight:800;letter-spacing:2px;text-transform:uppercase}h1{font-size:clamp(32px,5vw,52px);line-height:1.15;letter-spacing:-1.4px;margin:14px 0 22px}h2{font-size:21px;line-height:1.35;margin:0 0 12px}h3{font-size:17px;line-height:1.4;margin:20px 0 10px;color:var(--text)}p{margin:0 0 16px}.intro{max-width:720px;color:var(--muted);font-size:19px;line-height:1.65}.layout{display:grid;grid-template-columns:220px minmax(0,1fr);gap:44px;margin-top:44px}.contents{align-self:start;padding:18px;border:1px solid var(--line);border-radius:16px;background:var(--card);font-size:14px}.contents strong{display:block;margin-bottom:10px}.contents a{display:block;padding:6px 0}.sections section{padding:0 0 24px;margin-bottom:28px;border-bottom:1px solid var(--line);scroll-margin-top:20px;overflow-wrap:anywhere}.sections p{color:var(--muted)}.sections ul{margin:0 0 16px;padding-left:1.25rem;color:var(--muted)}.sections li{margin:0 0 8px}.table-wrap{overflow-x:auto;margin:0 0 16px;border:1px solid var(--line);border-radius:12px;background:var(--card)}.sections table{width:100%;border-collapse:collapse;font-size:13px;line-height:1.45}.sections th,.sections td{padding:10px 12px;border-bottom:1px solid var(--line);text-align:left;vertical-align:top;color:var(--muted)}.sections th{color:var(--text);font-size:11px;text-transform:uppercase;letter-spacing:.04em;background:var(--bg)}.sections tr:last-child td{border-bottom:0}.source-list a{font-weight:600}.actions{display:flex;flex-wrap:wrap;gap:12px;margin:26px 0}.contact-details{overflow-wrap:anywhere;color:var(--muted)}.guide-toc{display:flex;flex-wrap:wrap;gap:8px 14px;margin:8px 0 0;padding:14px 16px;border:1px solid var(--line);border-radius:14px;background:var(--card)}.guide-toc a{font-size:14px;font-weight:600;text-decoration:none}.guide-toc a:hover{text-decoration:underline}.guide-cluster{margin-top:40px}.guide-cluster>p{color:var(--muted);max-width:720px;margin:0 0 16px}.guide-list{display:grid;gap:14px;margin-top:16px}.guide-list a{display:block;padding:18px 20px;border:1px solid var(--line);border-radius:16px;background:var(--card);text-decoration:none;color:inherit}.guide-list a.featured{border-color:var(--green);box-shadow:0 0 0 1px color-mix(in srgb,var(--green) 35%,transparent)}.guide-list a strong{display:block;color:var(--text);margin-bottom:6px}.guide-list a span{color:var(--muted);font-size:15px}footer{background:var(--card);border-top:1px solid var(--line);padding:30px 22px calc(30px + env(safe-area-inset-bottom))}footer>div{max-width:1060px;margin:auto}footer p{font-size:13px;color:var(--muted);margin-top:18px}.skip{position:absolute;left:12px;top:-100px}.skip:focus{top:12px;background:var(--card);padding:12px;z-index:5}@media(max-width:640px){.layout{grid-template-columns:1fr;gap:28px}.contents{display:none}main{padding-top:32px}header{padding-left:14px;padding-right:14px}.brand{font-size:20px}.brand img{width:30px;height:36px}header .button{font-size:14px;padding:10px 14px}}@media(prefers-color-scheme:dark){:root:not([data-theme="light"]){--bg:#0b1220;--card:#111c2d;--text:#eef5ff;--muted:#a9bbce;--line:#293a50;--green:#34d399;--blue:#31c5e0}:root:not([data-theme="light"]) .light-logo{display:none}:root:not([data-theme="light"]) .dark-logo{display:block}}:root[data-theme="dark"]{--bg:#0b1220;--card:#111c2d;--text:#eef5ff;--muted:#a9bbce;--line:#293a50;--green:#34d399;--blue:#31c5e0}:root[data-theme="dark"] .light-logo{display:none}:root[data-theme="dark"] .dark-logo{display:block}`;

function shell({ title, description, canonicalPath, currentHref, eyebrow, h1, intro, body, head = '', socialImage = '/preview/dashboard.png', appLink = false }) {
  const pageTitle = title.includes('PSX Tracker') ? title : `${title} | PSX Tracker`;
  const links = PUBLIC_LINKS.map(([label, href]) =>
    `<a href="${href}"${href === currentHref ? ' aria-current="page"' : ''}>${label}</a>`).join('');
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><title>${escape(pageTitle)}</title><meta name="description" content="${escape(description)}"><meta name="robots" content="index, follow"><link rel="canonical" href="${SITE_URL}${canonicalPath}"><meta property="og:type" content="website"><meta property="og:title" content="${escape(pageTitle)}"><meta property="og:description" content="${escape(description)}"><meta property="og:url" content="${SITE_URL}${canonicalPath}"><meta property="og:image" content="${SITE_URL}${socialImage}"><meta name="twitter:card" content="summary_large_image"><link rel="icon" href="/favicon-premium.svg" type="image/svg+xml"><link rel="apple-touch-icon" href="/apple-touch-premium.png">${analyticsScriptTags()}<script src="/performance-v1.js" defer></script><script src="/site-theme.js"></script><style>${css}</style>${head}</head><body><a class="skip" href="#main">Skip to content</a><header><div><a class="brand" href="/" aria-label="PSX Tracker home"><img class="light-logo" src="/brand/premium-badge.svg" alt="" width="36" height="41"><img class="dark-logo" src="/brand/premium-badge-dark.svg" alt="" width="36" height="41"><span><b>PSX</b> Tracker<small>KNOW MORE. <i>EARN MORE.</i></small></span></a><a class="button" href="${appLink ? '/holdings' : '/login'}">${appLink ? 'Open app' : 'Log in'}</a></div></header><main id="main"><p class="eyebrow">${escape(eyebrow)}</p><h1>${escape(h1)}</h1><p class="intro">${escape(intro)}</p>${body}</main><footer><div><nav aria-label="Footer">${links}<a href="/">Features & pricing</a><a href="/suggestions">Suggestions</a></nav><p>Independent portfolio and research tools. Market data and calculations may contain errors. Not investment advice.</p><p>© ${new Date().getFullYear()} PSX Tracker</p></div></footer></body></html>`;
}

export function renderPublicPage(slug) {
  const page = publicPages[slug];
  if (!page) throw new Error('Unknown public page');
  const body = `${page.actions ? `<div class="actions">${page.actions.map(([label, href]) => `<a class="button" href="${escape(href)}"${href.startsWith('https:') ? ' target="_blank" rel="noopener noreferrer"' : ''}>${escape(label)}</a>`).join('')}<a class="button secondary" href="/suggestions">Share a suggestion</a></div><p class="contact-details">${SUPPORT_EMAIL}<br>${SUPPORT_PHONE}</p>` : ''}<div class="layout"><aside class="contents"><strong>On this page</strong>${page.sections.map(([h], i) => `<a href="#section-${i + 1}">${escape(h)}</a>`).join('')}</aside><div class="sections">${page.sections.map(([h, p], i) => `<section id="section-${i + 1}"><h2>${escape(h)}</h2><p>${escape(p)}</p></section>`).join('')}<a href="/contact">Need help? Contact support →</a></div></div>`;
  return shell({
    title: page.title,
    description: page.description,
    canonicalPath: `/${slug}`,
    currentHref: `/${slug}`,
    eyebrow: page.eyebrow,
    h1: page.title,
    intro: page.intro,
    body,
  });
}

export function renderGuideHub() {
  const toc = `<nav class="guide-toc" aria-label="On this page">${guideHubToc.map((t) =>
    `<a href="#${escape(t.id)}">${escape(t.label)}</a>`).join('')}</nav>`;
  const startCards = guideHubStartHere.map((c) => guideCardHtml(c.href, c.title, c.blurb, !!c.featured)).join('');
  const clusters = guideHubClusters.map((cluster) => {
    const featured = [];
    const rest = [];
    for (const card of cluster.cards) {
      const page = guidePages[card.slug];
      if (!page) throw new Error(`Unknown hub guide slug: ${card.slug}`);
      const html = guideCardHtml(`/guides/${card.slug}`, page.title, card.blurb || page.blurb, !!card.featured);
      (card.featured ? featured : rest).push(html);
    }
    const list = [...featured, ...rest].join('');
    return `<section class="guide-cluster" id="${escape(cluster.id)}"><h2>${escape(cluster.heading)}</h2>${cluster.intro ? `<p>${escape(cluster.intro)}</p>` : ''}<div class="guide-list">${list}</div></section>`;
  }).join('');
  const body = `<div class="actions"><a class="button" href="/login">Start free</a><a class="button secondary" href="/about">About PSX Tracker</a></div>${toc}<section class="guide-cluster" id="start-here"><h2>Start here</h2><p>Begin with the video walkthrough. Use the feature guide when you need a screenshot-level reference for a specific screen.</p><div class="guide-list">${startCards}</div></section>${clusters}`;
  return shell({
    title: guideHub.pageTitle || guideHub.title,
    description: guideHub.description,
    canonicalPath: '/guides',
    currentHref: '/guides',
    eyebrow: guideHub.eyebrow,
    h1: guideHub.title,
    intro: guideHub.intro,
    body,
  });
}

export function renderGuidePage(slug) {
  const page = guidePages[slug];
  if (!page) throw new Error('Unknown guide page');
  const related = (page.related || [])
    .filter((id) => guidePages[id])
    .map((id) => `<a href="/guides/${id}">${escape(guidePages[id].title)}</a>`)
    .join('');
  const howToUseLink = `<a href="/how-to-use">How to use PSX Tracker</a>`;
  const sectionHtml = page.sections.map((section, i) => {
    const [h, ...blocks] = section;
    const body = blocks.map((block) => renderGuideBlock(block)).join('');
    return `<section id="section-${i + 1}"><h2>${escape(h)}</h2>${body}</section>`;
  }).join('');
  const body = `<div class="actions"><a class="button" href="/login">Start free</a><a class="button secondary" href="/guides">All guides</a></div><div class="layout"><aside class="contents"><strong>On this page</strong>${page.sections.map(([h], i) => `<a href="#section-${i + 1}">${escape(h)}</a>`).join('')}</aside><div class="sections">${sectionHtml}${related ? `<section><h2>Related guides</h2><p>${related}${related ? ' · ' : ''}${howToUseLink}</p></section>` : ''}<a href="/contact">Need help? Contact support →</a></div></div>`;
  const faqs = page.faqs || [];
  const head = buildGuideFaqJsonLd(faqs, `${SITE_URL}/guides/${slug}`);
  return shell({
    title: page.title,
    description: page.description,
    canonicalPath: `/guides/${slug}`,
    currentHref: '/guides',
    eyebrow: 'PSX Tracker guide',
    h1: page.title,
    intro: page.intro,
    body,
    head,
  });
}

export function renderHowItWorks() {
  return shell({ title: 'How it works: video and feature guide', description: 'Learn to use PSX Tracker with a video and illustrated guide to portfolios, broker setup, AI imports, Drive backup, charts, reports and research tools.', canonicalPath: '/how-it-works', currentHref: '/how-it-works', eyebrow: 'Explore PSX Tracker', h1: 'How it works', intro: 'Watch the walkthrough, then explore the written feature guide at your own pace.', body: renderHowItWorksBody(), head: `<link rel="preload" as="image" href="${videoGuide.poster}" fetchpriority="high"><link rel="stylesheet" href="/feature-guide.css">`, socialImage: videoGuide.poster, appLink: true });
}

export function renderVideoGuide() {
  return shell({
    title: videoGuide.title,
    description: videoGuide.description,
    canonicalPath: '/how-to-use',
    currentHref: '/how-to-use',
    eyebrow: 'Your first portfolio',
    h1: 'A little guidance. A clearer portfolio.',
    intro: 'Follow the clicks from creating a portfolio to reviewing your first trade. Watch from the start, or jump to the step you need.',
    body: renderVideoGuideBody(),
    appLink: true,
    head: videoGuideHead(),
    socialImage: videoGuide.poster,
  });
}

export function resolvePublicHtml(pathname) {
  const path = String(pathname || '').split('?')[0].replace(/^\/|\/$/g, '');
  if (!path) return null;
  if (path === 'how-it-works') return renderHowItWorks();
  if (path === 'how-to-use') return renderVideoGuide();
  if (path === 'guides') return renderGuideHub();
  if (path.startsWith('guides/')) {
    const slug = path.slice('guides/'.length);
    if (Object.hasOwn(guidePages, slug)) return renderGuidePage(slug);
    return null;
  }
  if (Object.hasOwn(publicPages, path)) return renderPublicPage(path);
  return null;
}
