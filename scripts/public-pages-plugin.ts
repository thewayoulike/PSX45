import type { Plugin } from 'vite';
import { publicPages } from '../config/publicPages.js';
import { renderPublicPage } from '../lib/publicSite.js';
export function publicPagesPlugin(): Plugin {
  return {
    name: 'public-pages',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const slug = (req.url || '').split('?')[0].replace(/^\/|\/$/g, '');
        if (!Object.hasOwn(publicPages, slug)) return next();
        res.setHeader('Content-Type', 'text/html; charset=utf-8');
        res.end(renderPublicPage(slug));
      });
    },
    generateBundle() {
      for (const slug of Object.keys(publicPages)) this.emitFile({type:'asset', fileName:`${slug}.html`, source:renderPublicPage(slug)});
    },
  };
}
