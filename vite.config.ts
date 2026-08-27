import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

/** Local /api/proxy?ohlc= / ?company= and legacy /api/ohlc for dev without Vercel. */
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
        if (!isLegacy && !isProxyOhlc && !isProxyCompany && !isProxyAnalysis) return next();
        try {
          const u = new URL(url, 'http://localhost');
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
    localPsxApi(),
    react(),
    VitePWA({
      strategies: 'injectManifest',
      srcDir: 'src', 
      filename: 'sw.js',
      registerType: 'autoUpdate',
      includeAssets: ['favicon.ico', 'apple-touch-icon.png', 'mask-icon.svg'],
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
            sizes: '32x32', // <--- FIXED: Now matches the actual physical size of your image
            type: 'image/png'
          },
          {
            src: 'pwa-192x192.png',
            sizes: '192x192',
            type: 'image/png'
          },
          {
            src: 'pwa-512x512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any'
          },
          {
            src: 'maskable-icon-512x512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable'
          }
        ],
        // --- ADDED: Satisfies Chrome's requirement for the Richer Install UI ---
        screenshots: [
          {
            src: 'pwa-512x512.png',
            sizes: '512x512',
            type: 'image/png',
            form_factor: 'narrow',
            label: 'Mobile View'
          },
          {
            src: 'pwa-512x512.png',
            sizes: '512x512',
            type: 'image/png',
            form_factor: 'wide',
            label: 'Desktop View'
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
            if (id.includes('react') || id.includes('recharts') || id.includes('lucide-react')) {
              return 'vendor';
            }
          }
        }
      }
    }
  }
});
