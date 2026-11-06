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

describe('app identity', () => {
  const web = resolve(__dirname, '..');
  const read = (path: string) => readFileSync(resolve(web, path), 'utf8');
  const brand = /--brand:\s*(#[0-9a-f]{6})/i.exec(read('src/index.css'))?.[1]?.toLowerCase();

  it('uses one brand colour for the page, the manifest and the app icon', () => {
    expect(brand).toBeDefined();
    expect(read('index.html')).toContain(`name="theme-color" content="${brand}"`);
    expect(read('vite.config.ts')).toContain(`theme_color: '${brand}'`);
    expect(read('public/icons/icon.svg').toLowerCase()).toContain(`fill="${brand}"`);
  });

  it('ships the icon sizes the manifest names', () => {
    for (const size of [192, 512]) {
      const png = readFileSync(resolve(web, `public/icons/icon-${size}.png`));
      // PNG header, then width and height as 32-bit big-endian numbers.
      expect(png.subarray(1, 4).toString()).toBe('PNG');
      expect(png.readUInt32BE(16)).toBe(size);
      expect(png.readUInt32BE(20)).toBe(size);
    }
  });
});
