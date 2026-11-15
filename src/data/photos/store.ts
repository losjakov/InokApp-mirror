/**
 * A-111: WHERE the app keeps its photos - the ONE rule of the photo store (the census: `reports/cloud_34/JOURNAL.md`). The only writer is
 * `src/native/covers.ts` (photoSrc -> download); this module holds the names, the folders, the selection rule and the «зайнято» number.
 *  - `kept/`   - what a list needs offline: list thumbnails (houses, publications), channel avatars, eparchy pictures. Never cleared.
 *  - `photos/` - what the setting calls «великі фото»: the card's cover, card galleries (R-49), publication pictures (header, body, gallery),
 *               every photo opened in the viewer. «Очистити збережені фото» removes this folder and nothing else.
 *  - `covers/` - the ONE folder of 1.0.0 … 1.0.8 (both kinds, names without a class). Never written again; a file there is classified when
 *               it is next asked for (it moves to the asker's folder), the rest by `legacyKept()` when «Ще» measures.
 */
export const KEEP_DIR = 'kept';
export const CLEAR_DIR = 'photos';
export const LEGACY_DIR = 'covers';

/** djb2 of the URL: two pictures of one code get different files; a changed URL (or a new sha256) = a new file. Same since 1.0.0. */
const hash = (s: string) => {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36);
};
/** The file name of a picture (the same in every folder, the same as 1.0.0's): `<code>-<hash>.<ext>`; a version (R-16 sha256) is part of the key. */
export function photoName(code: number | string, url: string, version?: string | null): string {
  const key = version ? `${url}#${version}` : url;
  return `${code}-${hash(key)}.${key.split('#')[0].split('.').pop()?.split('?')[0] || 'img'}`;
}

/** The folder a request writes to: a list's picture (`keep`) or a clearable one. */
export const dirFor = (keep?: boolean): string => (keep ? KEEP_DIR : CLEAR_DIR);

/** Channel avatars (`ch<id>`) and eparchy pictures (`ep-<id>`) are kept whatever asked for them (census rows 3-5). */
const KEPT_KEY = /^(ch\d|ep-)/;
/**
 * A legacy file (`covers/`) stays kept when it is a list picture the DATABASE names (a house's thumbnail, a saved publication's cover:
 * `keepNames`) or an avatar / eparchy picture; anything else (covers of cards, publication pictures, gallery photos, stale thumbnails of an
 * older sha) is clearable. A misjudged thumbnail only downloads again (small: any network, A-20).
 */
export const legacyKept = (name: string, keepNames: ReadonlySet<string>): boolean => KEPT_KEY.test(name) || keepNames.has(name);

/** The list pictures the database names (census rows 1, 2, 6): THE names `MonasteryRow` / `ArticleRow` / `keepPictures` ask for. */
export function listPictureNames(thumbs: { code: number; thumb_url: string | null; thumb_sha256: string | null }[], covers: { id: number; url: string | null }[]): Set<string> {
  const s = new Set<string>();
  for (const m of thumbs) if (m.thumb_url) s.add(photoName(m.code, m.thumb_url, m.thumb_sha256));
  for (const a of covers) if (a.url) s.add(photoName(`a${a.id}`, a.url));
  return s;
}

/** The button is active only when there is something to clear (A-111: 0 = «0 МБ», inactive). */
export const canClear = (bytes: number | null): boolean => typeof bytes === 'number' && bytes > 0;

/** «12,4 МБ» in the language's number format: megabytes of 1 000 000 b (as Android's storage screens), one decimal; any non-zero amount shows
 *  at least 0,1 (never «0 МБ» beside an active button). `unit` = the i18n word (`photos.mb`). */
export function formatUsed(bytes: number, lang: string, unit: string): string {
  const mb = bytes <= 0 ? 0 : Math.max(0.1, Math.round(bytes / 100_000) / 10);
  return `${new Intl.NumberFormat(lang, { maximumFractionDigits: 1 }).format(mb)} ${unit}`;
}

/** What the pipeline needs from a file store - the device's files (`covers.ts`) or a memory stand-in (unit tests, the browser ring). */
export interface PhotoStore {
  /** a src the page can show for an existing file, else null */
  src(path: string): Promise<string | null>;
  /** downloads `url` into `path` (its folder made first); true when the file is there */
  fetch(url: string, path: string): Promise<boolean>;
  /** the files of a folder with their sizes in bytes (a missing folder = none) */
  list(dir: string): Promise<{ name: string; size: number }[]>;
  move(from: string, to: string): Promise<void>;
  remove(path: string): Promise<void>;
  /** removes a folder with everything in it (ONE call, A-111 P6) */
  removeDir(dir: string): Promise<void>;
}

/** The memory stand-in: every `fetch` is recorded (`downloads`: the pipeline asked the network again), files have `bytes` each; `src` = the URL;
 *  `seed` = files already there (path -> size: a store after weeks of use, for a screen). */
export interface MemPhotoStore extends PhotoStore {
  files: Map<string, { url: string; size: number }>;
  downloads: string[];
}
export function memPhotoStore(bytes = 240_000, seed: Record<string, number> = {}): MemPhotoStore {
  const files = new Map<string, { url: string; size: number }>(Object.entries(seed).map(([p, size]) => [p, { url: `https://inok.info/seed/${p}`, size }]));
  const downloads: string[] = [];
  return {
    files, downloads,
    src: async (p) => files.get(p)?.url ?? null,
    fetch: async (url, p) => { downloads.push(url); files.set(p, { url, size: bytes }); return true; },
    list: async (dir) => [...files].filter(([p]) => p.startsWith(`${dir}/`)).map(([p, f]) => ({ name: p.slice(dir.length + 1), size: f.size })),
    move: async (from, to) => { const f = files.get(from); if (f) { files.delete(from); files.set(to, f); } },
    remove: async (p) => { files.delete(p); },
    removeDir: async (dir) => { for (const p of [...files.keys()]) if (p.startsWith(`${dir}/`)) files.delete(p); },
  };
}
