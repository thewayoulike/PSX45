import { publicPages } from '../config/publicPages.js';
import { guidePages, guideHub } from '../config/guidePages.js';
import { SITE_URL, PUBLIC_LINKS, SUPPORT_EMAIL, SUPPORT_PHONE } from '../config/site.js';
import { analyticsScriptTags } from './seoJsonLd.js';

const escape = (value) => String(value).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const css = `:root{color-scheme:light dark;--bg:#f8fafc;--card:#fff;--text:#0f172a;--muted:#526174;--line:#dfe6ed;--green:#008968;--blue:#007f9c}*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--text);font:16px/1.75 system-ui,sans-serif}a{color:var(--blue);text-underline-offset:4px}a:focus-visible,summary:focus-visible{outline:3px solid var(--green);outline-offset:4px}header{background:var(--card);border-bottom:1px solid var(--line);padding:calc(12px + env(safe-area-inset-top)) 20px 12px}header>div{max-width:1060px;margin:auto;display:flex;align-items:center;justify-content:space-between;gap:12px}.brand{display:flex;gap:10px;align-items:center;text-decoration:none;font-size:23px;line-height:1.15;white-space:nowrap}.brand img{width:36px;height:41px}.brand b{color:var(--green)}.brand span{color:var(--blue)}.brand small{display:block;font-size:8px;font-weight:700;letter-spacing:1.3px;margin-top:6px}.brand small i{font-style:normal;color:var(--green)}.dark-logo{display:none}.button{display:inline-flex;align-items:center;justify-content:center;min-height:44px;padding:10px 18px;background:#009879;color:white;border-radius:12px;text-decoration:none;font-weight:700;line-height:1.5}.secondary{background:var(--card);border:1px solid var(--line);color:var(--text)}nav{display:flex;gap:8px 22px;flex-wrap:wrap}nav a{display:inline-block;padding:9px 0}main{max-width:1060px;margin:auto;padding:46px 22px 72px}.eyebrow{color:var(--green);font-size:12px;font-weight:800;letter-spacing:2px;text-transform:uppercase}h1{font-size:clamp(32px,5vw,52px);line-height:1.15;letter-spacing:-1.4px;margin:14px 0 22px}h2{font-size:21px;line-height:1.35;margin:0 0 12px}p{margin:0 0 16px}.intro{max-width:720px;color:var(--muted);font-size:19px;line-height:1.65}.layout{display:grid;grid-template-columns:220px minmax(0,1fr);gap:44px;margin-top:44px}.contents{align-self:start;padding:18px;border:1px solid var(--line);border-radius:16px;background:var(--card);font-size:14px}.contents strong{display:block;margin-bottom:10px}.contents a{display:block;padding:6px 0}.sections section{padding:0 0 24px;margin-bottom:28px;border-bottom:1px solid var(--line);scroll-margin-top:20px;overflow-wrap:anywhere}.sections p{color:var(--muted)}.actions{display:flex;flex-wrap:wrap;gap:12px;margin:26px 0}.contact-details{overflow-wrap:anywhere;color:var(--muted)}.guide-list{display:grid;gap:14px;margin-top:28px}.guide-list a{display:block;padding:18px 20px;border:1px solid var(--line);border-radius:16px;background:var(--card);text-decoration:none;color:inherit}.guide-list a strong{display:block;color:var(--text);margin-bottom:6px}.guide-list a span{color:var(--muted);font-size:15px}footer{background:var(--card);border-top:1px solid var(--line);padding:30px 22px calc(30px + env(safe-area-inset-bottom))}footer>div{max-width:1060px;margin:auto}footer p{font-size:13px;color:var(--muted);margin-top:18px}.skip{position:absolute;left:12px;top:-100px}.skip:focus{top:12px;background:var(--card);padding:12px;z-index:5}@media(max-width:640px){.layout{grid-template-columns:1fr;gap:28px}.contents{display:none}main{padding-top:32px}header{padding-left:14px;padding-right:14px}.brand{font-size:20px}.brand img{width:30px;height:36px}header .button{font-size:14px;padding:10px 14px}}@media(prefers-color-scheme:dark){:root:not([data-theme="light"]){--bg:#0b1220;--card:#111c2d;--text:#eef5ff;--muted:#a9bbce;--line:#293a50;--green:#34d399;--blue:#31c5e0}:root:not([data-theme="light"]) .light-logo{display:none}:root:not([data-theme="light"]) .dark-logo{display:block}}:root[data-theme="dark"]{--bg:#0b1220;--card:#111c2d;--text:#eef5ff;--muted:#a9bbce;--line:#293a50;--green:#34d399;--blue:#31c5e0}:root[data-theme="dark"] .light-logo{display:none}:root[data-theme="dark"] .dark-logo{display:block}`;

function shell({ title, description, canonicalPath, currentHref, eyebrow, h1, intro, body }) {
  const pageTitle = title.includes('PSX Tracker') ? title : `${title} | PSX Tracker`;
  const links = PUBLIC_LINKS.map(([label, href]) =>
    `<a href="${href}"${href === currentHref ? ' aria-current="page"' : ''}>${label}</a>`).join('');
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><title>${escape(pageTitle)}</title><meta name="description" content="${escape(description)}"><meta name="robots" content="index, follow"><link rel="canonical" href="${SITE_URL}${canonicalPath}"><meta property="og:type" content="website"><meta property="og:title" content="${escape(pageTitle)}"><meta property="og:description" content="${escape(description)}"><meta property="og:url" content="${SITE_URL}${canonicalPath}"><meta property="og:image" content="${SITE_URL}/preview/dashboard.png"><meta name="twitter:card" content="summary_large_image"><link rel="icon" href="/favicon-premium.svg" type="image/svg+xml"><link rel="apple-touch-icon" href="/apple-touch-premium.png">${analyticsScriptTags()}<script src="/site-theme.js"></script><style>${css}</style></head><body><a class="skip" href="#main">Skip to content</a><header><div><a class="brand" href="/" aria-label="PSX Tracker home"><img class="light-logo" src="/brand/premium-badge.svg" alt="" width="36" height="41"><img class="dark-logo" src="/brand/premium-badge-dark.svg" alt="" width="36" height="41"><span><b>PSX</b> Tracker<small>KNOW MORE. <i>EARN MORE.</i></small></span></a><a class="button" href="/login">Log in</a></div></header><main id="main"><p class="eyebrow">${escape(eyebrow)}</p><h1>${escape(h1)}</h1><p class="intro">${escape(intro)}</p>${body}</main><footer><div><nav aria-label="Footer">${links}<a href="/">Features & pricing</a><a href="/suggestions">Suggestions</a></nav><p>Independent portfolio and research tools. Market data and calculations may contain errors. Not investment advice.</p><p>© ${new Date().getFullYear()} PSX Tracker</p></div></footer></body></html>`;
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
  const cards = Object.entries(guidePages).map(([slug, g]) =>
    `<a href="/guides/${slug}"><strong>${escape(g.title)}</strong><span>${escape(g.blurb)}</span></a>`).join('');
  const body = `<div class="actions"><a class="button" href="/login">Start free</a><a class="button secondary" href="/about">About PSX Tracker</a></div><div class="guide-list">${cards}</div>`;
  return shell({
    title: guideHub.title,
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
  const body = `<div class="actions"><a class="button" href="/login">Start free</a><a class="button secondary" href="/guides">All guides</a></div><div class="layout"><aside class="contents"><strong>On this page</strong>${page.sections.map(([h], i) => `<a href="#section-${i + 1}">${escape(h)}</a>`).join('')}</aside><div class="sections">${page.sections.map(([h, p], i) => `<section id="section-${i + 1}"><h2>${escape(h)}</h2><p>${escape(p)}</p></section>`).join('')}${related ? `<section><h2>Related guides</h2><p>${related}</p></section>` : ''}<a href="/contact">Need help? Contact support →</a></div></div>`;
  return shell({
    title: page.title,
    description: page.description,
    canonicalPath: `/guides/${slug}`,
    currentHref: '/guides',
    eyebrow: 'PSX Tracker guide',
    h1: page.title,
    intro: page.intro,
    body,
  });
}

export function resolvePublicHtml(pathname) {
  const path = String(pathname || '').split('?')[0].replace(/^\/|\/$/g, '');
  if (!path) return null;
  if (path === 'guides') return renderGuideHub();
  if (path.startsWith('guides/')) {
    const slug = path.slice('guides/'.length);
    if (Object.hasOwn(guidePages, slug)) return renderGuidePage(slug);
    return null;
  }
  if (Object.hasOwn(publicPages, path)) return renderPublicPage(path);
  return null;
}
