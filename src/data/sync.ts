import type { Db } from './db/types';
import { getMeta, type FtsMode } from './db/schema';
import { importDirectory, ImportError } from './db/import';
import { cacheGet, cacheSet } from './repo/cache';
import { dataSource } from './source';
import type { AppConfig, Directory, LiveStatus, Manifest } from './api/types';
import { ApiError, SERVER_BUSY } from './api/client';
import { online } from '@/native/network';
import { classifySyncFailure, type SyncFailure } from './syncFailure';
export type { FailureKind, SyncFailure } from './syncFailure';

export type SyncResult = 'updated' | 'up_to_date' | 'offline' | 'update_app' | 'error';

let inflight: Promise<SyncResult> | null = null;
let failure: SyncFailure | null = null;
/** A-46: why the last sync ended in 'offline' / 'error' (null after a success) - the first-run screen shows it. */
export const lastSyncFailure = (): SyncFailure | null => failure;

/**
 * Manifest poll → download only when export_version changed → atomic import (REF_app_architecture §2.2).
 * One sync at a time, whoever asks (boot, «Оновити», first-run retry): a second caller awaits the running one.
 */
export function syncDirectory(db: Db, fts: FtsMode): Promise<SyncResult> {
  inflight ??= doSync(db, fts).finally(() => {
    inflight = null;
  });
  return inflight;
}

/** A-144: an export is taken only when it is NEWER than the stored one (either host); ISO times of the site, compared as instants. */
export const newerExport = (got: string, have: string | null): boolean => {
  if (!have) return true;
  const a = Date.parse(got); const b = Date.parse(have);
  return Number.isNaN(a) || Number.isNaN(b) ? got > have : a > b;
};

/** A-144 (3): the site did not answer as the API - no network / a timeout / 5xx / 429 after the retries / a page instead of JSON -> the mirror */
export const siteDown = (e: unknown): boolean =>
  e instanceof TypeError || (e instanceof Error && (e.name === 'AbortError' || e.name === 'TimeoutError'))
  || (e instanceof ApiError && (e.status >= 500 || e.status === 429 || e.code === SERVER_BUSY));

/** A-144 (2): the FIRST launch with an EMPTY database imports the pair built into the app at once (no network wait, no first-run screen).
 *  Only into an empty DB (no houses, no export_version): never over a stored export. true = imported. */
export async function importBundled(db: Db, fts: FtsMode): Promise<boolean> {
  try {
    if (await getMeta(db, 'export_version')) return false;
    const n = (await db.query<{ n: number }>('SELECT COUNT(*) AS n FROM monastery'))[0]?.n ?? 0;
    if (n > 0) return false;
    const b = await dataSource().bundled();
    if (!b) return false;
    await importDirectory(db, b.dir, fts);
    console.info(`InokBoot: bundled export ${b.man.export_version} imported`);
    return true;
  } catch (e) {
    console.warn('InokBoot: bundled export refused', e instanceof Error ? e.message : String(e)); // a bad sha / a broken file: as if none
    return false;
  }
}

async function doSync(db: Db, fts: FtsMode): Promise<SyncResult> {
  const src = dataSource();
  try {
    failure = null;
    const have = await getMeta(db, 'export_version');
    let man: Manifest;
    let fromMirror = false;
    try { man = await src.manifest(); } catch (e) {
      if (!siteDown(e)) throw e;
      try { man = await src.mirrorManifest(); fromMirror = true; } catch { throw e; } // both silent: the SITE's failure is the one told
    }
    if (!newerExport(man.export_version, have)) return 'up_to_date';
    let dir: Directory;
    if (fromMirror) dir = await src.mirrorDirectory(man);
    else {
      try { dir = await src.directory(man); } catch (e) {
        if (!siteDown(e)) throw e;
        let mm: Manifest;
        try { mm = await src.mirrorManifest(); } catch { throw e; }
        if (!newerExport(mm.export_version, have)) throw e;
        dir = await src.mirrorDirectory(mm);
      }
    }
    await importDirectory(db, dir, fts);
    if (fromMirror) console.info(`InokSync: directory ${man.export_version} from the mirror`);
    return 'updated';
  } catch (e) {
    if (e instanceof ImportError && e.code === 'contract_version') return 'update_app';
    const on = await online();
    failure = classifySyncFailure(e, on, typeof navigator === 'undefined' ? '' : navigator.userAgent);
    return failure.kind === 'offline' ? 'offline' : 'error';
  }
}

export async function loadConfig(db: Db): Promise<AppConfig | null> {
  try {
    const c = await dataSource().config();
    await cacheSet(db, 'config', c);
    return c;
  } catch {
    return (await cacheGet<AppConfig>(db, 'config'))?.value ?? null;
  }
}

/** The server's live status into the cache (throws: offline, busy - the cache stays). */
export async function fetchLiveStatus(db: Db): Promise<LiveStatus> {
  const s = await dataSource().liveStatus();
  await cacheSet(db, 'live-status', s);
  return s;
}
/** The last kept answer, marked stale (offline / before the first answer of this run). */
export async function cachedLiveStatus(db: Db): Promise<{ status: LiveStatus; stale: boolean } | null> {
  const c = await cacheGet<LiveStatus>(db, 'live-status');
  return c ? { status: c.value, stale: true } : null;
}
export async function loadLiveStatus(db: Db): Promise<{ status: LiveStatus; stale: boolean } | null> {
  try {
    return { status: await fetchLiveStatus(db), stale: false };
  } catch {
    return cachedLiveStatus(db);
  }
}
