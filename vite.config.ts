import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { TRIAL_DAYS } from './config/product.js';
import { VitePWA } from 'vite-plugin-pwa';
import { publicPagesPlugin } from './scripts/public-pages-plugin';

/** Local /api/proxy?ohlc|company|analysis|intraday and /api/pypsx for dev without Vercel. */
function localPsxApi(): Plugin {
  return {
    name: 'local-psx-api',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const url = req.url || '';
        const isLegacy = url.startsWith('/api/ohlc');
        const isProxyOhlc = url.startsWith('/api/proxy') && (url.includes('ohlc=') || url.includes('mode=ohlc'));
        const isProxyCompany = url.startsWith('/api/proxy') && (url.includes('company=') || url.includes('mode=company'));
        const isProxyAnalysis = url.startsWith('/api/proxy') && (url.includes('analysis=') || url.includes('mode=analysis'));
        const isProxyIntraday =
          url.startsWith('/api/proxy') && (url.includes('intraday=') || url.includes('mode=intraday'));
        const isPypsx = url.startsWith('/api/pypsx');
        if (!isLegacy && !isProxyOhlc && !isProxyCompany && !isProxyAnalysis && !isProxyIntraday && !isPypsx) {
          return next();
        }
        try {
          const u = new URL(url, 'http://localhost');
          if (isPypsx) {
            const mode = u.searchParams.get('mode') || '';
            if (mode === 'company') {
              const symbol = u.searchParams.get('symbol') || u.searchParams.get('company') || '';
              if (!symbol) {
                res.statusCode = 400;
                res.setHeader('Content-Type', 'application/json');
                res.end(JSON.stringify({ error: 'symbol required' }));
                return;
              }
              const { fetchPypsxToolkit } = await import('./lib/pypsxFetch.js');
              const payload = await fetchPypsxToolkit('company', { symbol });
              res.statusCode = 200;
              res.setHeader('Content-Type', 'application/json');
              res.end(JSON.stringify(payload));
              return;
            }
            if (mode === 'analysis') {
              const symbol = u.searchParams.get('symbol') || u.searchParams.get('analysis') || '';
              const period = u.searchParams.get('period') || '6mo';
              if (!symbol) {
                res.statusCode = 400;
                res.setHeader('Content-Type', 'application/json');
                res.end(JSON.stringify({ error: 'symbol required' }));
                return;
              }
              const { fetchPypsxToolkit } = await import('./lib/pypsxFetch.js');
              const payload = await fetchPypsxToolkit('analysis', { symbol, period });
              res.statusCode = 200;
              res.setHeader('Content-Type', 'application/json');
              res.end(JSON.stringify(payload));
              return;
            }
            if (mode === 'intraday') {
              const symbol = u.searchParams.get('symbol') || u.searchParams.get('intraday') || '';
              const interval = u.searchParams.get('interval') || '5m';
              const period = u.searchParams.get('period') || '5d';
              if (!symbol) {
                res.statusCode = 400;
                res.setHeader('Content-Type', 'application/json');
                res.end(JSON.stringify({ error: 'symbol required' }));
                return;
              }
              const { fetchPypsxToolkit } = await import('./lib/pypsxFetch.js');
              const payload = await fetchPypsxToolkit('intraday', { symbol, interval, period });
              res.statusCode = 200;
              res.setHeader('Content-Type', 'application/json');
              res.end(JSON.stringify(payload));
              return;
            }
            if (mode === 'quote') {
              const symbol = u.searchParams.get('symbol') || u.searchParams.get('quote') || '';
              if (!symbol) {
                res.statusCode = 400;
                res.setHeader('Content-Type', 'application/json');
                res.end(JSON.stringify({ error: 'symbol required' }));
                return;
              }
              const { fetchPypsxToolkit } = await import('./lib/pypsxFetch.js');
              const payload = await fetchPypsxToolkit('quote', { symbol });
              res.statusCode = 200;
              res.setHeader('Content-Type', 'application/json');
              res.end(JSON.stringify(payload));
              return;
            }
            if (mode === 'quotes') {
              const symbols = u.searchParams.get('symbols') || u.searchParams.get('symbol') || '';
              if (!symbols) {
                res.statusCode = 400;
                res.setHeader('Content-Type', 'application/json');
                res.end(JSON.stringify({ error: 'symbols required' }));
                return;
              }
              const { fetchPypsxToolkit } = await import('./lib/pypsxFetch.js');
              const payload = await fetchPypsxToolkit('quotes', { symbols });
              res.statusCode = 200;
              res.setHeader('Content-Type', 'application/json');
              res.end(JSON.stringify(payload));
              return;
            }
            if (mode === 'indices') {
              const name = u.searchParams.get('index') || u.searchParams.get('name') || '';
              const { fetchPypsxToolkit } = await import('./lib/pypsxFetch.js');
              const payload = await fetchPypsxToolkit('indices', { name });
              res.statusCode = 200;
              res.setHeader('Content-Type', 'application/json');
              res.end(JSON.stringify(payload));
              return;
            }
            res.statusCode = 400;
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ error: 'mode required: company|analysis|intraday|quote|quotes|indices' }));
            return;
          }
          if (isProxyIntraday) {
            const intraday = u.searchParams.get('intraday') || '';
            const interval = u.searchParams.get('interval') || '5m';
            const period = u.searchParams.get('period') || '5d';
            if (!intraday) {
              res.statusCode = 400;
              res.setHeader('Content-Type', 'application/json');
              res.end(JSON.stringify({ error: 'intraday symbol is required' }));
              return;
            }
            const { fetchPypsxIntraday } = await import('./lib/pypsxIntraday.js');
            const payload = await fetchPypsxIntraday(intraday, interval, period);
            res.statusCode = 200;
            res.setHeader('Content-Type', 'application/json');
            res.setHeader('Cache-Control', 'no-store');
            res.end(JSON.stringify(payload));
            return;
          }
          if (isProxyAnalysis) {
            const analysis = u.searchParams.get('analysis') || '';
            const period = u.searchParams.get('period') || '6mo';
            if (!analysis) {
              res.statusCode = 400;
              res.setHeader('Content-Type', 'application/json');
              res.end(JSON.stringify({ error: 'analysis symbol is required' }));
              return;
            }
            const { fetchPypsxChartAnalysis } = await import('./lib/pypsxChartAnalysis.js');
            const payload = await fetchPypsxChartAnalysis(analysis, period);
            res.statusCode = 200;
            res.setHeader('Content-Type', 'application/json');
            res.setHeader('Cache-Control', 'no-store');
            res.end(JSON.stringify(payload));
            return;
          }
          if (isProxyCompany) {
            const company = u.searchParams.get('company') || '';
            if (!company) {
              res.statusCode = 400;
              res.setHeader('Content-Type', 'application/json');
              res.end(JSON.stringify({ error: 'company symbol is required' }));
              return;
            }
            const { fetchPypsxCompanyInfo } = await import('./lib/pypsxCompanyInfo.js');
            const payload = await fetchPypsxCompanyInfo(company);
            res.statusCode = 200;
            res.setHeader('Content-Type', 'application/json');
            res.setHeader('Cache-Control', 'no-store');
            res.end(JSON.stringify(payload));
            return;
          }

          const symbol = u.searchParams.get('ohlc') || u.searchParams.get('symbol') || '';
          if (!symbol) {
            res.statusCode = 400;
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ error: 'ohlc symbol is required' }));
            return;
          }
          const { fetchPsxOhlc } = await import('./lib/psxOhlc.js');
          const payload = await fetchPsxOhlc(symbol);
          res.statusCode = 200;
          res.setHeader('Content-Type', 'application/json');
          res.setHeader('Cache-Control', 'no-store');
          res.end(JSON.stringify(payload));
        } catch (e: any) {
          res.statusCode = 502;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ error: e?.message || 'PSX API fetch failed' }));
        }
      });
    },
  };
}

export default defineConfig({
  plugins: [
    publicPagesPlugin(),
    { name: 'product-terms', transformIndexHtml: { order: 'pre', handler: (html) => html.replaceAll('%TRIAL_DAYS%', String(TRIAL_DAYS)) } },
    localPsxApi(),
    react(),
    VitePWA({
      strategies: 'injectManifest',
      injectManifest: {
        // Cache the landing/offline shell immediately; tools cache after first use.
        manifestTransforms: [async entries => ({
          manifest: entries.filter(entry => !entry.url.endsWith('.js') || /(?:^|\/)(?:index-|vendor-|registerSW|site-theme)/.test(entry.url)),
          warnings: [],
        })],
      },
      srcDir: 'src', 
      filename: 'sw.js',
      registerType: 'autoUpdate',
      includeAssets: ['favicon.ico', 'favicon-premium.svg', 'favicon-32.png', 'apple-touch-premium.png', 'mask-icon.svg', 'brand/premium-badge.svg', 'brand/premium-badge-dark.svg', 'notification-badge-premium.png'],
      manifest: {
        name: 'PSX Portfolio Tracker',
        short_name: 'PSX Tracker',
        description: 'A real-time Profit & Loss tracker for Pakistan Stock Exchange',
        start_url: '/', // <--- CRITICAL FIX FOR ANDROID INSTALLATION
        theme_color: '#ffffff',
        background_color: '#ffffff',
        display: 'standalone',
        icons: [
          {
            src: 'pwa-64x64.png',
            sizes: '64x64',
            type: 'image/png'
          },
          {
            src: 'pwa-premium-192.png',
            sizes: '192x192',
            type: 'image/png'
          },
          {
            src: 'pwa-premium-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any'
          },
          {
            src: 'pwa-premium-maskable-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable'
          }
        ]
      }
    })
  ],
  // Keeps hot-reloading working locally on Windows/WSL
  server: {
    port: 3000,
    strictPort: true,
    host: true,
    watch: {
      usePolling: true,
    },
  },
  build: {
    chunkSizeWarningLimit: 2000,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('fund-nav-catalog.json')) return 'fund-catalog';
          if (id.includes('node_modules')) {
            if (/node_modules[\\/](react|react-dom|scheduler)[\\/]/.test(id)) {
              return 'vendor';
            }
          }
        }
      }
    }
  }
});
