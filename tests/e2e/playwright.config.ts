import { defineConfig } from '@playwright/test';

// Uses Playwright's bundled headless Chromium (`pnpm --filter @tend/e2e exec playwright install chromium-headless-shell`).
// Set PW_CHANNEL (e.g. chrome, msedge) to drive an installed browser instead.
const channel = process.env.PW_CHANNEL ?? '';

export default defineConfig({
  testDir: '.',
  testMatch: '*.e2e.ts',
  use: { baseURL: 'http://localhost:4173', ...(channel ? { channel } : {}) },
  webServer: {
    command:
      'pnpm --filter @tend/web build && pnpm --filter @tend/web preview --port 4173 --strictPort',
    url: 'http://localhost:4173',
    reuseExistingServer: true,
    timeout: 120_000,
  },
});
