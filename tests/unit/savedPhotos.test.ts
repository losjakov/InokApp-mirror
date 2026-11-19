import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CLEAR_DIR, KEEP_DIR, LEGACY_DIR, canClear, formatUsed, legacyKept, listPictureNames, photoName, type MemPhotoStore } from '@/data/photos/store';
import { dbPictureNames } from '@/data/photos/saved';
import { clearSavedPhotos, dropCached, photoSrc, savedPhotosBytes } from '@/native/covers';
import { listArticles, parseArticles, storeArticles } from '@/data/repo/articles';
import { freshDb, importedDb } from './helpers';

vi.mock('@/native/network', () => ({ netState: async () => ({ connected: true, metered: false, dataSaver: false }), online: async () => true, onNetChange: () => () => {} }));

type G = { __inokPhotoStore?: { bytes?: number }; __inokPhotoStoreLive?: MemPhotoStore };
const g = globalThis as G;
const live = () => g.__inokPhotoStoreLive!;
beforeEach(() => { g.__inokPhotoStore = { bytes: 230_000 }; delete g.__inokPhotoStoreLive; });
afterEach(() => { delete g.__inokPhotoStore; delete g.__inokPhotoStoreLive; });

/** The census of cloud_34 (JOURNAL): every request the app makes, by its caller - what the clear must keep and what it must remove. */
const U = 'https://inok.info/images';
const CENSUS = [
  { who: 'MonasteryRow', code: 242, url: `${U}/monasteries/242/thumb150.webp`, o: { small: true, keep: true, version: 'sha1' }, kept: true },
  { who: 'ArticleRow', code: 'a1714', url: `${U}/articles/1714/cover150.webp`, o: { small: true, keep: true }, kept: true },
  { who: 'StreamRow', code: 'ch7', url: `${U}/live/7/channel/ico150.webp`, o: { small: true, keep: true, version: 'sha2' }, kept: true },
  { who: 'Eparchies row', code: 'ep-3', url: `${U}/eparchies/3.webp`, o: { small: true, keep: true }, kept: true },
  { who: 'MonasteryCard cover', code: 242, url: `${U}/monasteries/242/cover_large.webp`, o: {}, kept: false },
  { who: 'ArticleView header', code: 'a1714', url: `${U}/articles/1714/cover_large.webp`, o: {}, kept: false },
  { who: 'HtmlLite body', code: 'a1714', url: `${U}/articles/1714/body1.jpg`, o: {}, kept: false },
  { who: 'Gallery grid (R-45)', code: 'a1714', url: `${U}/articles/1714/g1_small.jpg`, o: { small: true }, kept: false },
  { who: 'PhotoViewer card gallery (R-49)', code: '242', url: `${U}/monasteries/242/gallery/1.jpg`, o: { manual: true }, kept: false },
] as const;

describe('A-111 the selection rule (census cloud_34)', () => {
  it('a list picture goes to kept/, every large photo to photos/; the clear removes photos/ only and they come back by the A-20 rule', async () => {
    for (const c of CENSUS) expect((await photoSrc(c.code, c.url, 'unmetered', c.o)).src).toBe(c.url);
    const paths = [...live().files.keys()];
    for (const c of CENSUS) expect(paths, c.who).toContain(`${c.kept ? KEEP_DIR : CLEAR_DIR}/${photoName(c.code, c.url, 'version' in c.o ? c.o.version : null)}`);
    expect(await savedPhotosBytes(async () => new Set())).toBe(5 * 230_000);
    await clearSavedPhotos();
    expect([...live().files.keys()].sort()).toEqual(CENSUS.filter((c) => c.kept).map((c) => `${KEEP_DIR}/${photoName(c.code, c.url, 'version' in c.o ? c.o.version : null)}`).sort());
    expect(await savedPhotosBytes(async () => new Set())).toBe(0);
    const before = live().downloads.length;
    await photoSrc(242, CENSUS[8].url, 'unmetered', { manual: true }); // the gallery photo opened again = asked from the network again
    await photoSrc(242, CENSUS[0].url, 'unmetered', CENSUS[0].o); // a kept thumbnail = from the device, no request
    expect(live().downloads.slice(before)).toEqual([CENSUS[8].url]);
  });

  it('the header that IS the row cover: one file, moved to kept/ when the row asks, so the clear never takes a row picture', async () => {
    const url = `${U}/articles/9/cover.webp`;
    await photoSrc('a9', url, 'any'); // the article page first (header = cover, no large copy)
    expect([...live().files.keys()]).toEqual([`${CLEAR_DIR}/${photoName('a9', url)}`]);
    await photoSrc('a9', url, 'any', { small: true, keep: true }); // its row in the feed
    expect([...live().files.keys()]).toEqual([`${KEEP_DIR}/${photoName('a9', url)}`]);
    await clearSavedPhotos();
    expect((await photoSrc('a9', url, 'manual')).src).toBe(url); // the header shows the kept copy even with auto-download off
    expect(live().downloads).toEqual([url]);
  });

  it('every <CoverImage> / photoSrc( / usePhoto( call site in src/ is in the census: a new one must choose its class here (P5)', () => {
    const calls: string[] = [];
    const walk = (d: string): void => { for (const f of readdirSync(d)) { const p = join(d, f); if (statSync(p).isDirectory()) walk(p); else if (/\.tsx?$/.test(f)) {
      for (const line of readFileSync(p, 'utf8').split('\n')) if (/<CoverImage\b|[^.]photoSrc\(|[^.]usePhoto\(/.test(line) && !/^\s*(\/?\*|\/\/|import|export async function photoSrc|export function usePhoto)/.test(line))
        calls.push(`${p.replace(/^.*src\//, '')}: ${/\bkeep\b/.test(line) ? 'KEEP' : 'CLEAR'}`);
    } } };
    walk(join(__dirname, '../../src'));
    expect(calls.sort()).toEqual([
      'components/ArticleRow.tsx: KEEP', 'components/CoverImage.tsx: KEEP', // the slot passes its caller's class through
      'components/PhotoWait.tsx: KEEP', // A-112: `usePhoto` = the ONE asker of the slot and the viewer (passes the class through)
      'components/Gallery.tsx: CLEAR', 'components/HtmlLite.tsx: CLEAR', 'components/MonasteryRow.tsx: KEEP',
      'components/PhotoViewer.tsx: CLEAR', 'components/PhotoViewer.tsx: CLEAR', 'components/StreamRow.tsx: KEEP',
      'data/repo/articles.ts: KEEP', // the row's cover keeps, the rest clears (keep: url === cover)
      'data/repo/articles.ts: KEEP', // cloud_42 (A-141 (1)): a SAVED article keeps ALL its pictures (keepSavedPictures)
      'components/ContinueReading.tsx: KEEP', // A-141 (3): the continue card's cover = the row's kept cover
      'pages/ArticleView.tsx: CLEAR', 'pages/Eparchies.tsx: KEEP', 'pages/Eparchies.tsx: KEEP', 'pages/MonasteryCard.tsx: CLEAR',
    ].map((s) => s.replace('pages/ArticleView', 'components/ArticleView')).sort());
  });
});

describe('A-111 the legacy folder of 1.0.0 … 1.0.8 (P12)', () => {
  it('a database list picture, an avatar, an eparchy picture stay; a card cover, publication pictures, a stale thumbnail move to photos/', async () => {
    const names = listPictureNames([{ code: 242, thumb_url: `${U}/m/242/t.webp`, thumb_sha256: 'new' }], [{ id: 1714, url: `${U}/a/1714/c.webp` }]);
    const legacy = {
      thumb: photoName(242, `${U}/m/242/t.webp`, 'new'), cover: photoName('a1714', `${U}/a/1714/c.webp`), avatar: photoName('ch7', `${U}/ch.webp`, 's'),
      eparchy: photoName('ep-3', `${U}/e.webp`), cardCover: photoName(242, `${U}/m/242/large.webp`), body: photoName('a1714', `${U}/a/1714/b.jpg`),
      stale: photoName(242, `${U}/m/242/t.webp`, 'old'), history: photoName('html', `${U}/h.jpg`),
    };
    const store = (await import('@/data/photos/store')).memPhotoStore(100);
    g.__inokPhotoStoreLive = store;
    for (const n of Object.values(legacy)) store.files.set(`${LEGACY_DIR}/${n}`, { url: n, size: 100 });
    expect(await savedPhotosBytes(async () => null)).toBe(0); // no names = no judgement, nothing moved
    expect(await savedPhotosBytes(async () => names)).toBe(4 * 100);
    const left = [...store.files.keys()].filter((p) => p.startsWith(`${LEGACY_DIR}/`)).map((p) => p.slice(LEGACY_DIR.length + 1)).sort();
    expect(left).toEqual([legacy.thumb, legacy.cover, legacy.avatar, legacy.eparchy].sort());
    for (const n of left) expect(legacyKept(n, names)).toBe(true);
    await clearSavedPhotos();
    expect([...store.files.keys()].filter((p) => p.startsWith(`${LEGACY_DIR}/`))).toHaveLength(4);
    // a legacy file asked for again moves to the asker's folder (classified by the request itself)
    expect((await photoSrc(242, `${U}/m/242/t.webp`, 'any', { small: true, keep: true, version: 'new' })).src).toBe(legacy.thumb);
    expect(store.files.has(`${KEEP_DIR}/${legacy.thumb}`)).toBe(true);
  });

  it('dbPictureNames: the imported houses\' thumbnails (as MonasteryRow asks) + the saved publications\' covers; no houses = null', async () => {
    const { db } = await importedDb();
    const rows = await db.query<{ code: number; thumb_url: string | null; thumb_sha256: string | null }>('SELECT code, thumb_url, thumb_sha256 FROM monastery WHERE thumb_url IS NOT NULL LIMIT 1');
    const fx = parseArticles(JSON.parse(readFileSync(new URL('../../fixtures/articles.json', import.meta.url), 'utf8'))).items.filter((a) => a.cover);
    await storeArticles(db, 'uk', fx);
    const names = (await dbPictureNames(db))!;
    expect(names.has(photoName(rows[0].code, rows[0].thumb_url!, rows[0].thumb_sha256))).toBe(true);
    expect(names.has(photoName(`a${fx[0].id}`, fx[0].cover!.url))).toBe(true);
    expect(await dbPictureNames((await freshDb()).db)).toBeNull();
  });
});

describe('A-111 the number and the button', () => {
  it('«зайнято» in the language\'s format; 0 = «0 МБ»; a few bytes never read as 0', () => {
    expect(formatUsed(12_400_000, 'uk', 'МБ')).toBe('12,4 МБ');
    expect(formatUsed(12_400_000, 'en', 'MB')).toBe('12.4 MB');
    expect(formatUsed(0, 'ru', 'МБ')).toBe('0 МБ');
    expect(formatUsed(3_000, 'uk', 'МБ')).toBe('0,1 МБ');
    expect(formatUsed(230_000_000, 'uk', 'МБ')).toBe('230 МБ');
  });
  it('the button is active only above 0 b (and not while measuring)', () => {
    expect([canClear(0), canClear(null), canClear(1)]).toEqual([false, false, true]);
  });
});

describe('A-111 + A-19: the clear never touches the saved publications', () => {
  it('the saved 30 are the same after the clear; their pictures are asked again when opened; eviction still removes every folder', async () => {
    const { db } = await freshDb();
    const items = parseArticles(JSON.parse(readFileSync(new URL('../../fixtures/articles.json', import.meta.url), 'utf8'))).items;
    await storeArticles(db, 'uk', items);
    const before = (await listArticles(db, 'uk')).map((a) => a.id);
    const a = items.find((x) => x.cover)!;
    await photoSrc(`a${a.id}`, a.cover!.url, 'any', { small: true, keep: true });
    await photoSrc(`a${a.id}`, `${U}/body-of-${a.id}.jpg`, 'any');
    await clearSavedPhotos();
    expect((await listArticles(db, 'uk')).map((x) => x.id)).toEqual(before);
    expect(before.length).toBeGreaterThan(0);
    await photoSrc(`a${a.id}`, `${U}/body-of-${a.id}.jpg`, 'any');
    expect(live().downloads.filter((u) => u.endsWith(`body-of-${a.id}.jpg`))).toHaveLength(2);
    await dropCached([`a${a.id}`]);
    expect([...live().files.keys()]).toEqual([]);
  });
});
