import type { Plugin } from 'vite';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { publicPages } from '../config/publicPages.js';
import { MARKET_TAB_PAGES } from '../config/marketTabs.js';
import { renderMarketTabHtml } from '../lib/marketTabPages.js';
import { guidePages } from '../config/guidePages.js';
import { editorialPages, toolPages } from '../config/editorialPages.js';
import { renderPublicPage, renderGuideHub, renderGuidePage, renderVideoGuide, renderHowItWorks, renderEditorialPage, resolvePublicHtml } from '../lib/publicSite.js';

export function publicPagesPlugin(): Plugin {
  return {
    name: 'public-pages',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const path = (req.url || '').split('?')[0];
        if (/^\/markets(?:\.html|\/)?$/.test(path)) { req.url = (req.url || '').replace(/^\/markets\/?(?=\?|$)/, '/markets.html'); return next(); }
        const tab = path.match(/^\/markets\/([a-z]+)\/?$/)?.[1];
        if (tab && tab in MARKET_TAB_PAGES) { req.url = (req.url || '').replace(/^[^?]*/, '/markets.html'); return next(); }
        const html = resolvePublicHtml(path);
        if (!html) return next();
        res.setHeader('Content-Type', 'text/html; charset=utf-8');
        res.end(html);
      });
    },
    generateBundle() {
      this.emitFile({ type: 'asset', fileName: 'how-it-works.html', source: renderHowItWorks() });
      this.emitFile({ type: 'asset', fileName: 'how-to-use.html', source: renderVideoGuide() });
      for (const slug of Object.keys(publicPages)) {
        this.emitFile({ type: 'asset', fileName: `${slug}.html`, source: renderPublicPage(slug) });
      }
      this.emitFile({ type: 'asset', fileName: 'guides.html', source: renderGuideHub() });
      for (const slug of Object.keys(guidePages)) {
        this.emitFile({ type: 'asset', fileName: `guides/${slug}.html`, source: renderGuidePage(slug) });
      }
      for (const pathname of [...Object.keys(editorialPages), ...Object.keys(toolPages)]) {
        if (pathname === '/markets') continue;
        this.emitFile({ type: 'asset', fileName: `${pathname.slice(1)}.html`, source: renderEditorialPage(pathname) });
      }
    },
    writeBundle(options) {
      const dir = options.dir || 'dist';
      if (!existsSync(join(dir, 'markets.html'))) return;
      const built = readFileSync(join(dir, 'markets.html'), 'utf8');
      mkdirSync(join(dir, 'markets'), { recursive: true });
      for (const slug of Object.keys(MARKET_TAB_PAGES)) {
        writeFileSync(join(dir, 'markets', `${slug}.html`), renderMarketTabHtml(built, slug));
      }
    },
  };
}
