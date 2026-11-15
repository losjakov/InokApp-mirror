import { Capacitor } from '@capacitor/core';
import { Directory, Filesystem } from '@capacitor/filesystem';
import { isNative } from './platform';
import { netState } from './network';
import { decide, type PhotoMode, type Wait } from '@/data/photos/policy';
import { CLEAR_DIR, KEEP_DIR, LEGACY_DIR, dirFor, legacyKept, memPhotoStore, photoName, type MemPhotoStore, type PhotoStore } from '@/data/photos/store';

/** `downloadFile({ recursive: true })` does NOT create the parent folder on Android (API 34 emulator, logcat ENOENT) — mkdir once per folder
 *  (forgotten when the folder is removed, so a download racing «Очистити збережені фото» makes it again). */
const dirReady = new Map<string, Promise<void>>();
const ensureDir = (dir: string): Promise<void> => {
  let p = dirReady.get(dir);
  if (!p) {
    p = Filesystem.mkdir({ path: dir, directory: Directory.Data, recursive: true }).then(() => undefined, () => undefined); // exists already
    dirReady.set(dir, p);
  }
  return p;
};
const D = Directory.Data;
/** The device's files (the app's data directory). */
const deviceStore: PhotoStore = {
  async src(path) {
    try {
      await Filesystem.stat({ path, directory: D });
      return Capacitor.convertFileSrc((await Filesystem.getUri({ path, directory: D })).uri);
    } catch {
      return null; // not there
    }
  },
  async fetch(url, path) {
    const dir = path.split('/')[0];
    try {
      await ensureDir(dir);
      // native download: no CORS, no base64 round-trip through the bridge
      return !!(await Filesystem.downloadFile({ url, path, directory: D, recursive: true })).path;
    } catch {
      dirReady.delete(dir);
      return false;
    }
  },
  async list(dir) {
    try {
      return (await Filesystem.readdir({ path: dir, directory: D })).files.filter((f) => f.type === 'file').map((f) => ({ name: f.name, size: f.size }));
    } catch {
      return []; // no folder yet
    }
  },
  async move(from, to) {
    await ensureDir(to.split('/')[0]);
    await Filesystem.rename({ from, to, directory: D, toDirectory: D });
  },
  remove: (path) => Filesystem.deleteFile({ path, directory: D }).catch(() => undefined),
  async removeDir(dir) {
    dirReady.delete(dir);
    await Filesystem.rmdir({ path: dir, directory: D, recursive: true }).catch(() => undefined);
  },
};
/** The browser ring has no files: a screen sets `window.__inokPhotoStore = { bytes }` and gets the memory stand-in (`__inokPhotoStoreLive`:
 *  its files and every download it was asked for; `seed` = files already there). Without it the web shows the URL itself, as before. */
type G = { __inokPhotoStore?: { bytes?: number; seed?: Record<string, number> }; __inokPhotoStoreLive?: MemPhotoStore };
function activeStore(): PhotoStore | null {
  if (isNative()) return deviceStore;
  const g = globalThis as G;
  if (!g.__inokPhotoStore) return null;
  return (g.__inokPhotoStoreLive ??= memPhotoStore(g.__inokPhotoStore.bytes, g.__inokPhotoStore.seed));
}

/** What a photo slot shows: the picture, or the reason it waits (A-20 placeholder) and whether a tap may load it. */
export type PhotoResult = { src: string } | { src: null; why: Wait; canLoad: boolean; metered?: boolean };
export interface PhotoOpts {
  /** the content version (R-16 sha256): a new version at the same URL = a new file */
  version?: string | null;
  /** a SMALL picture (list thumbnails, channel avatars, icons): loaded on any network, whatever the setting (A-20 size class) */
  small?: boolean;
  /** A-111: a picture a LIST needs offline (thumbnails, avatars, eparchy pictures) - kept by «Очистити збережені фото» (census, JOURNAL cloud_34) */
  keep?: boolean;
  /** the user tapped «Завантажити» (this photo or «Завантажити всі фото») */
  manual?: boolean;
}

const inflight = new Map<string, Promise<string | null>>();

/** A file already on the device, from any folder (same name = same URL = same bytes). A legacy file moves to the asker's folder; a list
 *  picture found among the clearable ones moves to `kept/` (a publication's header = its row's cover: the clear must not take the row's). */
async function stored(store: PhotoStore, name: string, keep?: boolean): Promise<string | null> {
  const own = dirFor(keep);
  for (const dir of [own, dirFor(!keep), LEGACY_DIR]) {
    const src = await store.src(`${dir}/${name}`);
    if (!src) continue;
    if (dir === own || dir === KEEP_DIR) return src; // a clearable request may show a kept file (same bytes); it never moves it
    try {
      await store.move(`${dir}/${name}`, `${own}/${name}`);
      return (await store.src(`${own}/${name}`)) ?? src;
    } catch {
      return src;
    }
  }
  return null;
}

/**
 * ONE photo pipeline for the app (A-19/A-20, A-15, A-111): the on-device store (two folders by class, `src/data/photos/store.ts`), the
 * decision table (network × «Автозавантаження фото» × Data Saver) and ONE download queue (at most 3 at a time).
 * On the web there is no file store: the URL is returned when the rule allows it.
 */
export async function photoSrc(code: number | string, url: string | null, mode: PhotoMode, o: PhotoOpts = {}): Promise<PhotoResult> {
  if (!url) return { src: null, why: 'offline', canLoad: false };
  const name = photoName(code, url, o.version);
  const store = activeStore();
  if (store) {
    const hit = await stored(store, name, o.keep);
    if (hit) return { src: hit };
  }
  const net = await netState();
  const d = decide(net, mode, o.manual, o.small ? 'small' : 'large'); // small: only «offline» stops them
  if (!d.load) return { src: null, why: d.why, canLoad: d.canLoad, metered: net.metered };
  if (!store) return { src: url };
  const path = `${dirFor(o.keep)}/${name}`;
  let p = inflight.get(path);
  if (!p) {
    p = queued(() => store.fetch(url, path).then((ok) => (ok ? store.src(path) : null))).finally(() => inflight.delete(path));
    inflight.set(path, p);
  }
  const src = await p;
  return src ? { src } : { src: null, why: 'offline', canLoad: true };
}

// the ONE download queue: a long list or «Завантажити всі фото» never opens dozens of connections at once
const MAX = 3;
let running = 0;
const waiting: (() => void)[] = [];
async function queued<T>(job: () => Promise<T>): Promise<T> {
  if (running >= MAX) await new Promise<void>((r) => waiting.push(r));
  running++;
  try {
    return await job();
  } finally {
    running--;
    waiting.shift()?.();
  }
}

/** Deletes the stored pictures of the given keys (`a<id>` for an evicted article, A-19: the item and its pictures leave together), every folder. */
export async function dropCached(keys: (number | string)[]): Promise<void> {
  const store = activeStore();
  if (!store || keys.length === 0) return;
  const prefixes = keys.map((k) => `${k}-`);
  for (const dir of [KEEP_DIR, CLEAR_DIR, LEGACY_DIR])
    for (const f of await store.list(dir)) if (prefixes.some((p) => f.name.startsWith(p))) await store.remove(`${dir}/${f.name}`);
}

/**
 * A-111 «зайнято»: the bytes of the clearable photos, read from the FILES (never remembered). First the legacy folder of 1.0.0 … 1.0.8 is
 * sorted: what is not a list picture (`legacyKept`, the database's names) moves to `photos/`, so the button sees 1.0.7's large photos too.
 * Idempotent: `covers/` is never written by 1.0.9, so a second pass finds only the kept ones.
 */
export async function savedPhotosBytes(keepNames: () => Promise<ReadonlySet<string> | null>): Promise<number> {
  const store = activeStore();
  if (!store) return 0;
  const legacy = await store.list(LEGACY_DIR);
  // no names (no database yet, a failed read) = no judgement: the legacy files wait for the next measure, none is moved blind
  const names = legacy.length ? await keepNames().catch(() => null) : null;
  if (names) for (const f of legacy) if (!legacyKept(f.name, names)) await store.move(`${LEGACY_DIR}/${f.name}`, `${CLEAR_DIR}/${f.name}`).catch(() => undefined);
  return (await store.list(CLEAR_DIR)).reduce((s, f) => s + f.size, 0);
}

/** A-111 «Очистити збережені фото»: the clearable folder goes in ONE call; kept pictures, the database and the settings are not touched. */
export async function clearSavedPhotos(): Promise<void> {
  await activeStore()?.removeDir(CLEAR_DIR);
}
