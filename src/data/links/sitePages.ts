import { SITE_URL } from '@/data/api/client';
import type { ArticleKind } from '@/data/source';
import type { Lang } from '@/i18n';
import { siteUrl } from '@/native/intents';

/**
 * A-43: THE map «screen of the app -> its page on inok.info» for «Поділитися» (one source, unit-tested). Only screens the site has a
 * page for: no Home, no Map (the owner), no favourites / language / notifications / about the app (no such page). An ITEM shares
 * its own address from the data (an eparchy's / an article's `site_url`); the card keeps its own share action (A-43).
 */
export const SITE_PAGES = {
  '/monasteries': 'monasteries/',
  '/more/eparchies': 'dioceses/',
  '/streams': 'live/',
  '/articles': 'articles/',
  '/more/commission': 'about/',
  '/more/contacts': 'about/contacts/',
} as const;
export type SharedRoute = keyof typeof SITE_PAGES;

/** the articles' kind tabs = the site's sections (R-19; the same paths the feed's `site_url` carries) */
export const ARTICLE_SECTIONS: Record<ArticleKind, string> = {
  publication: 'articles/publications/',
  video: 'articles/video/',
  news: 'articles/news/',
};

/** The address to share for a screen in the interface language (THE `siteUrl` rule: uk bare, ru / en `?lang=`). */
export function sitePageUrl(route: SharedRoute, lang: Lang, kind?: ArticleKind | 'all'): string {
  const path = route === '/articles' && kind && kind !== 'all' ? ARTICLE_SECTIONS[kind] : SITE_PAGES[route];
  return siteUrl(SITE_URL + path, lang);
}
