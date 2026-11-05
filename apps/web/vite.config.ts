import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      // A new version waits for the user to accept it, so a reload never discards a half-filled form.
      registerType: 'prompt',
      manifest: {
        name: 'Personal Upkeep',
        short_name: 'Upkeep',
        description: 'Keep track of the maintenance your home, vehicles and life need.',
        start_url: '/',
        scope: '/',
        display: 'standalone',
        background_color: '#f8fafc',
        theme_color: '#059669',
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
