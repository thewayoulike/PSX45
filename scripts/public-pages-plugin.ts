import type { Plugin } from 'vite';
import { publicPages } from '../config/publicPages.js';
import { guidePages } from '../config/guidePages.js';
import { renderPublicPage, renderGuideHub, renderGuidePage, renderVideoGuide, renderHowItWorks, resolvePublicHtml } from '../lib/publicSite.js';

export function publicPagesPlugin(): Plugin {
  return {
    name: 'public-pages',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const path = (req.url || '').split('?')[0];
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
    },
  };
}
