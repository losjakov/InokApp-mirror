import { SITE_HOSTS, SITE_URL } from '@/data/api/client';
import { ARTICLE_SECTIONS } from './sitePages';

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

/** What a site link names IN the app: a house's card or an article; null = nothing of the app (it leaves for the browser). */
export type LinkTarget = { kind: 'card'; code: number } | { kind: 'article'; id: number };

/**
 * A-21(а) + R-39 + A-76: THE ONE link router - of every html-lite text (article lead / body, card history) AND of an App Link that opened the
 * app. A link to the site's card `/monasteries/<code>/` or to an article `/articles/<publications|news|video>/<id>/` - absolute or relative,
 * http or https, with or without www, `?lang=` (ignored: the app shows its own language) and `#…` - names that card / article. Anything else
 * (the list `/monasteries/`, `/monasteries/table/…`, `/live/`, an unknown form, another host) is null: the caller opens the browser.
 */
export function linkTarget(href: string): LinkTarget | null {
  const abs = absoluteHref(href);
  if (!abs) return null;
  const u = new URL(abs);
  if (!SITE_HOSTS.has(u.host)) return null;
  const card = CARD_LINK.exec(u.pathname);
  if (card) return { kind: 'card', code: Number(card[1]) };
  const art = ARTICLE_LINK.exec(u.pathname);
  return art ? { kind: 'article', id: Number(art[1]) } : null;
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
