// Renders public/icons/icon.svg to the PNG sizes the web manifest needs.
// Run with: node scripts/make-icons.mjs
import { chromium } from '@playwright/test';
import { readFileSync, writeFileSync } from 'node:fs';

const svg = readFileSync(new URL('../public/icons/icon.svg', import.meta.url), 'utf8');
const browser = await chromium.launch();
for (const size of [192, 512]) {
  const page = await browser.newPage({ viewport: { width: size, height: size } });
  await page.setContent(
    `<style>html,body{margin:0}svg{width:${size}px;height:${size}px;display:block}</style>${svg}`,
  );
  const png = await page.screenshot({ type: 'png' });
  writeFileSync(new URL(`../public/icons/icon-${size}.png`, import.meta.url), png);
}
await browser.close();
