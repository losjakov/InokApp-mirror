import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { siteUrl } from '@/native/intents';

const walk = (d: string): string[] => readdirSync(d).flatMap((f) => (statSync(join(d, f)).isDirectory() ? walk(join(d, f)) : [join(d, f)]));

describe('A-96 W-1: every inok.info address opens in the app\'s language (THE `siteUrl` rule)', () => {
  it('no screen calls `openExternal(` - they call `openLink(url, lang)` (siteUrl inside); only intents.ts keeps the raw opener', () => {
    const bare = walk('src').filter((f) => /\.tsx?$/.test(f) && !f.endsWith(join('native', 'intents.ts')))
      .flatMap((f) => readFileSync(f, 'utf8').split('\n').map((l, i) => [f, i + 1, l] as const))
      .filter(([, , l]) => /\bopenExternal\(/.test(l)).map(([f, n]) => `${f}:${n}`);
    expect(bare).toEqual([]);
  });
  it('the three places of the review (More «Підтримати», Commission, About «site») pass their URL through openLink', () => {
    expect(readFileSync('src/pages/More.tsx', 'utf8')).toMatch(/openLink\(r\.ext, lang\)/);
    expect(readFileSync('src/pages/Commission.tsx', 'utf8')).toMatch(/openLink\(SITE_URL, lang\)/);
    expect(readFileSync('src/pages/About.tsx', 'utf8')).toMatch(/openLink\(SITE_URL, lang\)/);
  });
  it('siteUrl: uk bare, ru / en ?lang=, an address that names a language kept, www too, foreign hosts UNCHANGED, idempotent', () => {
    expect(siteUrl('https://inok.info/', 'uk')).toBe('https://inok.info/');
    expect(siteUrl('https://inok.info/', 'ru')).toBe('https://inok.info/?lang=ru');
    expect(siteUrl('https://inok.info/donate/', 'en')).toBe('https://inok.info/donate/?lang=en');
    expect(siteUrl('https://www.inok.info/about/', 'ru')).toBe('https://www.inok.info/about/?lang=ru');
    expect(siteUrl('https://inok.info/monasteries/37/?gallery=Y', 'en')).toBe('https://inok.info/monasteries/37/?gallery=Y&lang=en');
    expect(siteUrl('https://inok.info/articles/news/5/?lang=en', 'ru')).toBe('https://inok.info/articles/news/5/?lang=en');
    expect(siteUrl(siteUrl('https://inok.info/', 'ru'), 'ru')).toBe('https://inok.info/?lang=ru');
    for (const f of ['https://lavra.ua/', 'https://www.youtube.com/@x', 'https://uk.wikipedia.org/wiki/X']) expect(siteUrl(f, 'ru')).toBe(f);
  });
});
