import { Capacitor } from '@capacitor/core';
import { Directory, Filesystem } from '@capacitor/filesystem';
import { isNative } from './platform';
import { netState } from './network';
import { decide, type PhotoMode, type Wait } from '@/data/photos/policy';

const DIR = 'covers';
/** djb2 of the URL: list and large covers of one code get different files; a changed URL refetches. */
const hash = (s: string) => {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36);
};
const pathOf = (code: number | string, key: string) => `${DIR}/${code}-${hash(key)}.${key.split('#')[0].split('.').pop()?.split('?')[0] || 'img'}`;
const inflight = new Map<string, Promise<string | null>>();
let dirReady: Promise<void> | null = null;
/** `downloadFile({ recursive: true })` does NOT create the parent folder on Android (API 34 emulator, logcat ENOENT) — mkdir once. */
const ensureDir = () =>
  (dirReady ??= Filesystem.mkdir({ path: DIR, directory: Directory.Data, recursive: true }).then(
    () => undefined,
    () => undefined, // already exists
  ));

/** What a photo slot shows: the picture, or the reason it waits (A-20 placeholder) and whether a tap may load it. */
export type PhotoResult = { src: string } | { src: null; why: Wait; canLoad: boolean; metered?: boolean };
export interface PhotoOpts {
  /** the content version (R-16 sha256): a new version at the same URL = a new file */
  version?: string | null;
  /** a SMALL picture (list thumbnails, channel avatars, icons): loaded on any network, whatever the setting (A-20 size class) */
  small?: boolean;
  /** the user tapped «Завантажити» (this photo or «Завантажити всі фото») */
  manual?: boolean;
}

/**
 * ONE photo pipeline for the app (A-19/A-20, A-15): the on-device cache (written once into the app's data directory), the
 * decision table (network × «Автозавантаження фото» × Data Saver) and ONE download queue (at most 3 at a time).
 * On the web there is no file cache: the URL is returned when the rule allows it.
 */
export async function photoSrc(code: number | string, url: string | null, mode: PhotoMode, o: PhotoOpts = {}): Promise<PhotoResult> {
  if (!url) return { src: null, why: 'offline', canLoad: false };
  const path = pathOf(code, o.version ? `${url}#${o.version}` : url); // a new sha256 at the same URL = a new file (R-16)
  if (isNative()) {
    const hit = await cachedUri(path);
    if (hit) return { src: hit };
  }
  const net = await netState();
  const d = decide(net, mode, o.manual, o.small ? 'small' : 'large'); // small: only «offline» stops them
  if (!d.load) return { src: null, why: d.why, canLoad: d.canLoad, metered: net.metered };
  if (!isNative()) return { src: url };
  let p = inflight.get(path);
  if (!p) {
    p = queued(() => download(path, url)).finally(() => inflight.delete(path));
    inflight.set(path, p);
  }
  const src = await p;
  return src ? { src } : { src: null, why: 'offline', canLoad: true };
}

async function cachedUri(path: string): Promise<string | null> {
  try {
    await Filesystem.stat({ path, directory: Directory.Data });
    const { uri } = await Filesystem.getUri({ path, directory: Directory.Data });
    return Capacitor.convertFileSrc(uri);
  } catch {
    return null; // not cached yet
  }
}

async function download(path: string, url: string): Promise<string | null> {
  try {
    // native download: no CORS, no base64 round-trip through the bridge
    await ensureDir();
    const { path: saved } = await Filesystem.downloadFile({ url, path, directory: Directory.Data, recursive: true });
    return saved ? cachedUri(path) : null;
  } catch {
    return null;
  }
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

/** Deletes the cached pictures of the given keys (`a<id>` for an evicted article, A-19: the item and its pictures leave together). */
export async function dropCached(keys: (number | string)[]): Promise<void> {
  if (!isNative() || keys.length === 0) return;
  try {
    const { files } = await Filesystem.readdir({ path: DIR, directory: Directory.Data });
    const prefixes = keys.map((k) => `${k}-`);
    for (const f of files) if (prefixes.some((p) => f.name.startsWith(p))) await Filesystem.deleteFile({ path: `${DIR}/${f.name}`, directory: Directory.Data }).catch(() => undefined);
  } catch {
    /* no folder yet */
  }
}
