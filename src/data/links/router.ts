import { SITE_HOSTS, SITE_URL } from '@/data/api/client';
import { ARTICLE_SECTIONS } from './sitePages';
import type { ArticleKind } from '@/data/source';

const SITE = new URL(SITE_URL);

/** Absolute URL of an html-lite href (a relative one is the site's): null for anything but http(s). */
export function absoluteHref(href: string): string | null {
  try {
    const u = new URL(href.trim(), SITE);
    return u.protocol === 'https:' || u.protocol === 'http:' ? u.href : null;
  } catch {
    return null;
  }
}

/** R-39: `/<section><id>/` of the site's article sections - built from THE section table (`ARTICLE_SECTIONS`, sitePages.ts; A-15). */
const ARTICLE_LINK = new RegExp(`^/(?:${Object.values(ARTICLE_SECTIONS).join('|')})(\\d+)/?$`);
const CARD_LINK = /^\/(?:(?:uk|ru|en)\/)?monasteries\/(\d+)\/?$/;
const EPARCHY_LINK = /^\/(?:(?:uk|ru|en)\/)?dioceses\/(\d+)\/?$/;

/** A-138 (+ amendment): the app's LIST screens a site list page names - ONE table (DRY): the site's path (no language prefix, no query)
 *  -> the list. The article sections come from THE section table (`ARTICLE_SECTIONS`). */
export type SiteList = 'monasteries' | 'eparchies' | 'streams' | ArticleKind;
const SITE_LISTS: [string, SiteList][] = [
  ['monasteries/', 'monasteries'],
  ['dioceses/', 'eparchies'],
  ['live/', 'streams'], // A-143 (5): the site's /live/ -> «Трансляції» (the App Store's «Трансляції» page and the feast events link here)
  ...(Object.entries(ARTICLE_SECTIONS) as [ArticleKind, string][]).map(([k, path]): [string, SiteList] => [path, k]),
];
const listOf = (pathname: string): SiteList | null => {
  const p = `${pathname.replace(/^\/(?:uk|ru|en)\//, '/').replace(/\/+$/, '')}/`.slice(1);
  return SITE_LISTS.find(([path]) => path === p)?.[1] ?? null;
};

/** What a site link names IN the app: a house's card, an article, an eparchy's page or a list screen; null = nothing of the app (the browser). */
export type LinkTarget = { kind: 'card'; code: number } | { kind: 'article'; id: number } | { kind: 'eparchy'; id: number } | { kind: 'list'; list: SiteList };

/**
 * A-21(а) + R-39 + A-76: THE ONE link router - of every html-lite text (article lead / body, card history) AND of an App Link that opened the
 * app. A link to the site's card `/monasteries/<code>/` or to an article `/articles/<publications|news|video>/<id>/` - absolute or relative,
 * http or https, with or without www, `?lang=` (ignored: the app shows its own language) and `#…` - names that card / article.
 * A-138 (cloud_42): an eparchy `/dioceses/<id>/` names its page; a LIST page (`/monasteries/`, `/dioceses/`, `/live/`, `/articles/publications|video|news/`,
 * any query) names that list. Anything else (`/monasteries/table/…`, `/live/<anything>`, `/articles/`, an unknown form, another host) is null: the browser.
 */
export function linkTarget(href: string): LinkTarget | null {
  const abs = absoluteHref(href);
  if (!abs) return null;
  const u = new URL(abs);
  if (!SITE_HOSTS.has(u.host)) return null;
  const card = CARD_LINK.exec(u.pathname);
  if (card) return { kind: 'card', code: Number(card[1]) };
  const art = ARTICLE_LINK.exec(u.pathname);
  if (art) return { kind: 'article', id: Number(art[1]) };
  const ep = EPARCHY_LINK.exec(u.pathname);
  if (ep) return { kind: 'eparchy', id: Number(ep[1]) };
  const list = listOf(u.pathname);
  return list ? { kind: 'list', list } : null;
}

/** R-18: a picture of the site itself (the only pictures html-lite keeps; a foreign one is dropped). */
export function isSitePicture(src: string): boolean {
  const abs = absoluteHref(src);
  if (!abs) return false;
  const u = new URL(abs);
  return SITE_HOSTS.has(u.host) && /\.(?:jpe?g|png|webp|gif)$/i.test(u.pathname);
}

/** The pictures of an article body in order — the ONE offline download list (contract §3 R-18: «there is no second list»). */
export function bodyPictures(html: string | null | undefined): string[] {
  return Array.from((html ?? '').matchAll(/<img\b[^>]*\bsrc="([^"]+)"/g), (m) => m[1]).filter(isSitePicture);
}
