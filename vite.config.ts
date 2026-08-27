import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

/** Local /api/ohlc so candle charts work in `npm run dev` (same as Vercel function). */
function localOhlcApi(): Plugin {
  return {
    name: 'local-ohlc-api',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const url = req.url || '';
        if (!url.startsWith('/api/ohlc')) return next();
        try {
          const u = new URL(url, 'http://localhost');
          const symbol = u.searchParams.get('symbol') || '';
          if (!symbol) {
            res.statusCode = 400;
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ error: 'symbol is required' }));
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
          res.end(JSON.stringify({ error: e?.message || 'OHLC fetch failed' }));
        }
      });
    },
  };
}

export default defineConfig({
  plugins: [
    localOhlcApi(),
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
    chunkSizeWarningLimit: 1000,
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
