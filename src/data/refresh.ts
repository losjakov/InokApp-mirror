import { DEVICE_TZ, longDate } from '@/i18n/date';
import type { Db } from './db/types';
import { getMeta, setMeta } from './db/schema';
import { isServerBusy, SERVER_BUSY } from './api/client';
import { lastSyncFailure, type SyncResult } from './sync';
import { online } from '@/native/network';
import type { Translate } from '@/i18n';

/**
 * A-51 + A-52 (owner 05.11.2026): ONE full refresh of what changes on the site — the live status, the newest articles page and the
 * directory check (download only when `export_version` changed). The SAME function runs on return to the app (silently, when the last
 * successful check is >= 15 min old), at the start, from the Home header button, its pull-down, the Home bottom line and «Ще → Оновити
 * дані». One run at a time: a second caller gets the running one (no double requests). Offline: no request at all.
 */
export const RETURN_STALE_MS = 15 * 60_000;
export type RefreshResult = 'updated' | 'up_to_date' | 'offline' | 'busy' | 'update_app' | 'error';

/** The three sources; each keeps its cache on failure and throws (or returns the directory's result). `articles` = true when the cached list changed. */
export interface RefreshParts {
  live(): Promise<unknown>;
  articles(): Promise<boolean>;
  directory(): Promise<SyncResult>;
}

const LAST_CHECK = 'last_check';
/** When the last FULL refresh succeeded (ms), null = never. Kept in meta: it survives a restart (the Home line, «Ще», the 15-min rule). */
export const lastCheck = async (db: Db): Promise<number | null> => Number(await getMeta(db, LAST_CHECK)) || null;
/** A-51: the return refresh is due when nothing was checked yet or the last success is at least 15 minutes old. */
export const dueOnReturn = (last: number | null, now: number): boolean => last == null || now - last >= RETURN_STALE_MS;

let inflight: Promise<RefreshResult> | null = null;

export function runRefresh(db: Db, parts: RefreshParts, now: () => number = Date.now): Promise<RefreshResult> {
  inflight ??= doRefresh(db, parts, now).finally(() => { inflight = null; });
  return inflight;
}

async function doRefresh(db: Db, parts: RefreshParts, now: () => number): Promise<RefreshResult> {
  if (!(await online())) return 'offline'; // A-51: without the network - nothing (no request, no message on return)
  const [live, articles, dir] = await Promise.allSettled([parts.live(), parts.articles(), parts.directory()]);
  const failed = [live, articles].filter((r): r is PromiseRejectedResult => r.status === 'rejected').map((r) => r.reason);
  const d = dir.status === 'fulfilled' ? dir.value : 'error';
  if (d === 'update_app') return 'update_app';
  const dirBusy = d === 'error' && (lastSyncFailure()?.code.includes(SERVER_BUSY) ?? false);
  if (dirBusy || failed.some(isServerBusy)) return 'busy'; // D72: the hoster's protection page
  if (failed.length || d === 'error') return 'error';
  if (d === 'offline') return 'offline';
  await setMeta(db, LAST_CHECK, String(now()));
  return d === 'updated' || (articles.status === 'fulfilled' && articles.value) ? 'updated' : 'up_to_date';
}

/** The ONE result message of a manual refresh (A-52): the existing `data.*` keys, `data.offline` / `data.busy` added (D72). */
export const REFRESH_MESSAGE: Record<RefreshResult, string> = {
  updated: 'data.updated', up_to_date: 'data.up_to_date', offline: 'data.offline', busy: 'data.busy', update_app: 'data.update_app', error: 'data.error',
};

/** «Перевірено сьогодні о 12:05» / «вчора о 21:40» / «3 листопада 2026 р. о 09:12» - the device's own clock and calendar. */
export function checkedLabel(t: Translate, lang: string, at: number, now: number = Date.now()): string {
  const d = new Date(at);
  const time = new Intl.DateTimeFormat(lang, { hour: '2-digit', minute: '2-digit' }).format(d);
  const day = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const days = Math.round((day(new Date(now)) - day(d)) / 86_400_000);
  if (days === 0) return t('data.checked_today', { time });
  if (days === 1) return t('data.checked_yesterday', { time });
  return t('data.checked_on', { date: longDate(d, lang, DEVICE_TZ), time });
}
