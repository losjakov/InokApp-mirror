import type { Db } from '@/data/db/types';
import { getMeta, setMeta } from '@/data/db/schema';
import { dataSource } from '@/data/source';
import { kyivToday } from '@/data/live/streams';
import { cacheGet, cacheSet } from './cache';
import { sendCast } from './cast';

/**
 * A-65 / R-38 (contract §3): the site's eye on an OPENED article or monastery, and ONE app view of it by the site's rules.
 * - the number: the site's own total (null below 40 = nothing shown); asked when the screen opens; offline = the last number kept;
 * - a view: sent ONCE per install, page and Kyiv day, with the server's dwell token, after `gi` s with a touch or `gn` s without;
 *   never while «Статистика використання» is off, never from an own device (A-65's hidden mark); a hit never moves the shown number.
 */
export type ViewTarget = { kind: 'article'; id: number } | { kind: 'monastery'; code: number };
const key = (t: ViewTarget) => (t.kind === 'article' ? t.id : t.code);
/** The contract's path of the page - the app never builds the site's page key (R-38). */
export const viewsPath = (t: ViewTarget): string => (t.kind === 'article' ? `articles/${t.id}/views` : `monasteries/${t.code}/views`);
/** Contract §3: the view's Play Integrity line `view|article|<id>|<install>` / `view|monastery|<code>|<install>`. */
export const viewLine = (t: ViewTarget, install: string): (string | number)[] => ['view', t.kind, key(t), install];

export interface ViewsState { views: number | null; token: string | null; gi: number; gn: number }
const DWELL = { gi: 10, gn: 30 }; // the contract's example: the server's own values win

export async function loadViews(db: Db, t: ViewTarget): Promise<ViewsState> {
  const ck = `views:${viewsPath(t)}`;
  try {
    const a = await dataSource().views(viewsPath(t));
    const views = typeof a.views === 'number' && a.views >= 0 ? a.views : null;
    await cacheSet(db, ck, views);
    return { views, token: a.token || null, gi: a.gi > 0 ? a.gi : DWELL.gi, gn: a.gn > 0 ? a.gn : DWELL.gn };
  } catch {
    return { views: (await cacheGet<number | null>(db, ck))?.value ?? null, token: null, ...DWELL }; // offline: the kept number, no view
  }
}

/** Sends the view unless one went today (Kyiv) from this install; true when it went (202). Any failure: nothing kept, no retry loop. */
export async function sendView(db: Db, t: ViewTarget, token: string, now: Date = new Date()): Promise<boolean> {
  const mk = `view_sent:${viewsPath(t)}`;
  const today = kyivToday(now);
  if ((await getMeta(db, mk)) === today) return false;
  try {
    await sendCast(db, (i) => viewLine(t, i), { token }, (b) => dataSource().view(viewsPath(t), b));
    await setMeta(db, mk, today);
    return true;
  } catch {
    return false;
  }
}

/** The dwell rule (R-38: the site's): `gi` seconds with a touch, else `gn` seconds; time counts only while the page is shown. */
export const dwellMet = (shownMs: number, touched: boolean, d: { gi: number; gn: number }): boolean => shownMs >= (touched ? d.gi : d.gn) * 1000;
