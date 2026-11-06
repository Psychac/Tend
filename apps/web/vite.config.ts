import { readFileSync } from 'node:fs';
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { VitePWA } from 'vite-plugin-pwa';

const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf-8')) as {
  version: string;
};

export default defineConfig({
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
    // Day precision keeps the value stable across rebuilds of the same day.
    __APP_BUILD__: JSON.stringify(new Date().toISOString().slice(0, 10)),
  },
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      // A new version waits for the user to accept it, so a reload never discards a half-filled form.
      registerType: 'prompt',
      manifest: {
        name: 'Tend',
        short_name: 'Tend',
        description: 'Keep track of the maintenance your home, vehicles and life need.',
        start_url: '/',
        scope: '/',
        display: 'standalone',
        background_color: '#f6f7f9',
        theme_color: '#0f8a6d',
        icons: [
          { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          {
            src: '/icons/icon-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any maskable',
          },
        ],
      },
      workbox: {
        // The SQLite WASM files are the app's database engine, so they must be available offline.
        globPatterns: ['**/*.{js,css,html,wasm,svg,png,webmanifest}'],
        maximumFileSizeToCacheInBytes: 8 * 1024 * 1024,
        navigateFallback: '/index.html',
        cleanupOutdatedCaches: true,
        // Makes tapping a notification open the app.
        importScripts: ['notification-click.js'],
      },
    }),
  ],
  optimizeDeps: {
    // PowerSync ships web workers and WASM, which Vite's dependency optimiser breaks.
    exclude: ['@powersync/web'],
  },
  worker: { format: 'es' },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test-setup.ts'],
  },
});
