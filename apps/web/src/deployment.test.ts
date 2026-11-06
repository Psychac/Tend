import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

interface Rule {
  source: string;
  headers?: { key: string; value: string }[];
  destination?: string;
}
const config = JSON.parse(readFileSync(resolve(__dirname, '../../../vercel.json'), 'utf8')) as {
  buildCommand: string;
  outputDirectory: string;
  rewrites: Rule[];
  headers: Rule[];
};

const matches = (source: string, path: string) => new RegExp(`^${source}$`).test(path);
const cacheFor = (path: string) =>
  config.headers
    .filter((h) => matches(h.source, path))
    .flatMap((h) => h.headers ?? [])
    .find((h) => h.key === 'Cache-Control')?.value;

describe('vercel.json', () => {
  it('builds the web app and publishes the Vite output', () => {
    expect(config.buildCommand).toContain('@tend/web');
    expect(config.outputDirectory).toBe('apps/web/dist');
  });

  it('serves the app for client-side routes but not for missing build assets', () => {
    const [rewrite] = config.rewrites;
    expect(rewrite?.destination).toBe('/index.html');
    expect(matches(rewrite?.source ?? '', '/calendar')).toBe(true);
    expect(matches(rewrite?.source ?? '', '/activities/abc/edit')).toBe(true);
    expect(matches(rewrite?.source ?? '', '/assets/index-old.js')).toBe(false);
  });

  it('caches hashed assets forever and never caches what detects updates', () => {
    expect(cacheFor('/assets/index-ClU5c6O7.js')).toMatch(/immutable/);
    for (const file of ['/sw.js', '/workbox-2fbc6a65.js', '/index.html', '/manifest.webmanifest']) {
      expect(cacheFor(file)).toMatch(/no-cache/);
    }
  });
});
