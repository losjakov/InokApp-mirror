import type { Db } from './db/types';
import { getMeta, type FtsMode } from './db/schema';
import { importDirectory, ImportError } from './db/import';
import { cacheGet, cacheSet } from './repo/cache';
import { dataSource } from './source';
import type { AppConfig, LiveStatus } from './api/types';
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

async function doSync(db: Db, fts: FtsMode): Promise<SyncResult> {
  const src = dataSource();
  try {
    failure = null;
    const man = await src.manifest();
    const have = await getMeta(db, 'export_version');
    if (have === man.export_version) return 'up_to_date';
    const dir = await src.directory(man);
    await importDirectory(db, dir, fts);
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
