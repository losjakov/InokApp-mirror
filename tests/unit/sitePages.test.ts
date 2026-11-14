import { describe, expect, it } from 'vitest';
import { ARTICLE_SECTIONS, SITE_PAGES, sitePageUrl } from '@/data/links/sitePages';
import { siteUrl } from '@/native/intents';
import { readFileSync } from 'node:fs';

describe('A-43: THE map «screen -> page on inok.info» for «Поділитися»', () => {
  it('every list screen -> its site page; uk bare, ru / en with ?lang=', () => {
    const want: Record<string, string> = {
      '/monasteries': 'https://inok.info/monasteries/', '/more/eparchies': 'https://inok.info/dioceses/', '/streams': 'https://inok.info/live/',
      '/articles': 'https://inok.info/articles/', '/more/commission': 'https://inok.info/about/', '/more/contacts': 'https://inok.info/about/contacts/',
    };
    expect(Object.keys(SITE_PAGES).sort()).toEqual(Object.keys(want).sort());
    for (const [route, url] of Object.entries(want)) {
      expect(sitePageUrl(route as keyof typeof SITE_PAGES, 'uk')).toBe(url);
      expect(sitePageUrl(route as keyof typeof SITE_PAGES, 'ru')).toBe(`${url}?lang=ru`);
      expect(sitePageUrl(route as keyof typeof SITE_PAGES, 'en')).toBe(`${url}?lang=en`);
    }
  });
  it('the articles kind tabs -> the site sections (the same paths the feed\'s site_url carries); «all» -> /articles/', () => {
    expect(sitePageUrl('/articles', 'uk', 'publication')).toBe('https://inok.info/articles/publications/');
    expect(sitePageUrl('/articles', 'ru', 'video')).toBe('https://inok.info/articles/video/?lang=ru');
    expect(sitePageUrl('/articles', 'en', 'news')).toBe('https://inok.info/articles/news/?lang=en');
    expect(sitePageUrl('/articles', 'uk', 'all')).toBe('https://inok.info/articles/');
    const feed = JSON.parse(readFileSync('fixtures/articles.json', 'utf8')).items as { kind: keyof typeof ARTICLE_SECTIONS; site_url: string }[];
    for (const a of feed) expect(a.site_url.startsWith(`https://inok.info/${ARTICLE_SECTIONS[a.kind]}`), a.site_url).toBe(true);
  });
  it('no Home, no Map, nothing the site has no page for', () => {
    for (const r of ['/home', '/map', '/more/favourites', '/more/language', '/more/notifications', '/more/about']) expect(r in SITE_PAGES).toBe(false);
  });
  it('an item shares its own site_url by the same rule (an eparchy, an article)', () => {
    expect(siteUrl('https://inok.info/dioceses/1/', 'uk')).toBe('https://inok.info/dioceses/1/');
    expect(siteUrl('https://inok.info/dioceses/1/', 'en')).toBe('https://inok.info/dioceses/1/?lang=en');
  });
});
