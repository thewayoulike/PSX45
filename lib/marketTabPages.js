import { SITE_URL } from '../config/site.js';
import { MARKET_TAB_PAGES } from '../config/marketTabs.js';

const attr = (s) => String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
const text = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;');

function swap(html, pattern, replacement) {
  if (!pattern.test(html)) throw new Error(`Markets page is missing ${pattern}`);
  return html.replace(pattern, replacement);
}

/** The built Markets page, re-labelled for one tab so each tab has its own indexable address. */
export function renderMarketTabHtml(html, slug) {
  const page = MARKET_TAB_PAGES[slug];
  if (!page) throw new Error(`Unknown market tab: ${slug}`);
  const url = `${SITE_URL}/markets/${slug}`;
  let out = html;
  out = swap(out, /<title>[^<]*<\/title>/, `<title>${text(page.title)}</title>`);
  out = swap(out, /<meta name="description" content="[^"]*">/, `<meta name="description" content="${attr(page.description)}">`);
  out = swap(out, /<link rel="canonical" href="[^"]*">/, `<link rel="canonical" href="${url}">`);
  out = swap(out, /<meta property="og:title" content="[^"]*">/, `<meta property="og:title" content="${attr(page.title)}">`);
  out = swap(out, /<meta property="og:description" content="[^"]*">/, `<meta property="og:description" content="${attr(page.description)}">`);
  out = swap(out, /<meta property="og:url" content="[^"]*">/, `<meta property="og:url" content="${url}">`);
  out = swap(out, /("name":"Markets","item":"[^"]*\/markets"\})\]/, `$1,{"@type":"ListItem","position":3,"name":"${page.label}","item":"${url}"}]`);
  out = swap(out, /<span aria-current="page">Markets<\/span>/, `<a href="/markets">Markets</a><span aria-hidden="true">/</span><span aria-current="page">${text(page.label)}</span>`);
  out = swap(out, /(<div id="markets-root">)<h1>[^<]*<\/h1><p>[^<]*<\/p>/, `$1<h1>${text(page.heading)}</h1><p>${text(page.intro)}</p>`);
  return out;
}
