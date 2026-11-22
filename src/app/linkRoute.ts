import { linkTarget, type SiteList } from '@/data/links/router';
import { getMonastery } from '@/data/repo/monasteries';
import { getEparchy } from '@/data/repo/eparchies';
import type { ArticleKind } from '@/data/source';
import type { Db } from '@/data/db/types';
import { quickRoute } from './quickActions';

/** A-138: the mark a site LIST link puts on its screen's entry: the list resets (filters, search, order, its kind tab) as if just opened -
 *  also when that screen was already open with filters. `reset` = a fresh number per link (a new link = a new reset; Back to the same entry
 *  resets nothing again); `kind` = the article tab of an article section link. */
export type ListEntry = { reset: number; kind?: ArticleKind | 'all' };
/** A-166 (cloud_44): a GALLERY link's mark on the card's entry - the card opens its gallery on top once per mark (a fresh number per link;
 *  Back to the same entry opens nothing again) by the SAME path as its «Фотогалерея» button */
export type CardEntry = { gallery: number };
export type LinkRoute = { to: string; entry?: ListEntry | CardEntry };

const LIST_ROUTES: Record<SiteList, LinkRoute['to']> = {
  monasteries: '/monasteries', eparchies: '/more/eparchies', streams: '/streams', publication: '/articles', video: '/articles', news: '/articles', all: '/articles',
};

/** THE in-app screen of a site link (A-21(а), R-39, A-76, A-138): a card / an eparchy in the DB -> its page; an article -> `/articles?id=`
 *  (the screen asks the server for an id its cache lacks, R-35); a LIST page -> its list screen, reset; anything else -> null = the browser. */
export async function linkRoute(db: Db, href: string, now: () => number = Date.now): Promise<LinkRoute | null> {
  const quick = quickRoute(href); // cloud_41 (A-133 C1): a quick action on the app icon = its tab
  if (quick) return { to: quick };
  const to = linkTarget(href);
  if (to?.kind === 'card') return (await getMonastery(db, to.code)) ? { to: `/monasteries/${to.code}`, ...(to.gallery ? { entry: { gallery: now() } } : {}) } : null;
  if (to?.kind === 'article') return { to: `/articles?id=${to.id}` };
  if (to?.kind === 'eparchy') return (await getEparchy(db, to.id)) ? { to: `/more/eparchies/${to.id}` } : null;
  if (to?.kind === 'list') {
    const kind = to.list === 'monasteries' || to.list === 'eparchies' || to.list === 'streams' ? undefined : to.list;
    return { to: LIST_ROUTES[to.list], entry: { reset: now(), ...(kind ? { kind } : {}) } };
  }
  return null;
}
