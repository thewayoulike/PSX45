import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      strategies: 'injectManifest',
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
    watch: {
      usePolling: true,
    },
  },
  build: {
    chunkSizeWarningLimit: 1000,
    rollupOptions: {
      output: {
        manualChunks: {
          vendor: ['react', 'react-dom', 'recharts', 'lucide-react']
        }
      }
    }
  }
});
