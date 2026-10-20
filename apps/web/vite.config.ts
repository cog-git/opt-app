import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

const base = process.env.OPT_BASE ?? '/';

// https://vitejs.dev/config/
export default defineConfig({
  base,
  // Dev-only: OPT_ALLOW_TUNNEL lets the dev server answer requests coming through
  // a public quick-tunnel (e.g. trycloudflare.com) so the app can be demoed from
  // a phone. Off by default, so the normal local host check stays in force.
  server: process.env.OPT_ALLOW_TUNNEL ? { host: true, allowedHosts: true } : undefined,
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['brand/logo-white.png', 'brand/icon-white.png'],
      workbox: {
        runtimeCaching: [
          {
            urlPattern: ({ url }) => url.pathname.includes('/models/'),
            handler: 'CacheFirst',
            options: {
              cacheName: 'opt-face-models',
              expiration: { maxEntries: 12, maxAgeSeconds: 60 * 60 * 24 * 30 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
        ],
      },
      manifest: {
        name: 'OPT Systems',
        short_name: 'OPT',
        description: 'Workshop time-tracking and clock-in platform.',
        theme_color: '#2f80ed',
        background_color: '#f3f1ec',
        display: 'standalone',
        start_url: base,
        icons: [
          {
            src: 'brand/icon-white.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any maskable',
          },
        ],
      },
    }),
  ],
});
