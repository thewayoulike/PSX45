import { SITE_URL } from '../config/site.js';
import { PAGE_UPDATED, SITEMAP_ORDER } from '../config/pageUpdated.js';

function entry(path, lastmod, extra) {
  const loc = `${SITE_URL}${path === '/' ? '/' : path}`;
  if (!extra?.changefreq && !extra?.priority) {
    return `  <url><loc>${loc}</loc><lastmod>${lastmod}</lastmod></url>`;
  }
  const lines = [`    <loc>${loc}</loc>`, `    <lastmod>${lastmod}</lastmod>`];
  if (extra.changefreq) lines.push(`    <changefreq>${extra.changefreq}</changefreq>`);
  if (extra.priority) lines.push(`    <priority>${extra.priority}</priority>`);
  return `  <url>\n${lines.join('\n')}\n  </url>`;
}

/** Sitemap from each page's stored edit date, not the day the site was built. */
export function buildSitemapXml() {
  const body = SITEMAP_ORDER.map((route) => {
    const lastmod = PAGE_UPDATED[route.path];
    if (!lastmod) throw new Error(`Missing updated date for ${route.path}`);
    return entry(route.path, lastmod, route);
  }).join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${body}\n</urlset>\n`;
}
