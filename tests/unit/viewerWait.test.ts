import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { NetState, PhotoMode } from '@/data/photos/policy';
import { CLEAR_DIR, photoName, type MemPhotoStore } from '@/data/photos/store';
import { photoSrc } from '@/native/covers';
import { fullAsk, viewerPhotos, type ViewerSet } from '@/components/PhotoViewer';

/** The network the pipeline sees (the phone's: Wi-Fi off = mobile data, metered). */
const NET: { v: NetState } = { v: { connected: true, metered: true, dataSaver: false } };
vi.mock('@/native/network', () => ({ netState: async () => NET.v, online: async () => NET.v.connected, onNetChange: () => () => {} }));

type G = { __inokPhotoStore?: { bytes?: number; seed?: Record<string, number> }; __inokPhotoStoreLive?: MemPhotoStore };
const g = globalThis as G;
const downloads = () => g.__inokPhotoStoreLive?.downloads.length ?? 0;
beforeEach(() => { g.__inokPhotoStore = { bytes: 230_000 }; delete g.__inokPhotoStoreLive; NET.v = { connected: true, metered: true, dataSaver: false }; });
afterEach(() => { delete g.__inokPhotoStore; delete g.__inokPhotoStoreLive; });

/** A card gallery as R-49 sends it (thumb null: the full file is the ONE copy) - 242, five photos. */
const U = 'https://inok.info/images/monasteries/242';
const items = [0, 1, 2, 3, 4].map((k) => ({ src: `${U}/0${k}.jpg`, full: `${U}/0${k}.jpg`, w: 2045, h: 1153, alt: 'Святогірська лавра' }));
const open = (at = 0): ViewerSet => ({ at, photos: viewerPhotos(items, 242) });
/** What the viewer asks for the picture it shows - exactly its call: `usePhoto(code, full, fullAsk(consent, set))` -> `photoSrc`. */
const show = (set: ViewerSet, i: number, consent: ViewerSet | null, mode: PhotoMode = 'unmetered') =>
  photoSrc(set.photos[i].code, set.photos[i].full, mode, fullAsk(consent, set));

describe('A-112: the viewer obeys «Автозавантаження фото» - one tap = the open gallery', () => {
  it('«Тільки Wi-Fi» on mobile data: opening and paging download NOTHING; each picture waits with the reason «wifi» and the mobile button', async () => {
    const set = open();
    for (let i = 0; i < 5; i++) expect(await show(set, i, null)).toEqual({ src: null, why: 'wifi', canLoad: true, metered: true });
    for (let i = 3; i >= 0; i--) await show(set, i, null); // and back
    expect(downloads(), 'open + page turns = 0 full files').toBe(0);
  });

  it('the tap = ONE download (the current picture); then each newly paged picture by itself, one each, no neighbour ahead', async () => {
    const set = open(2);
    await show(set, 2, null);
    expect(downloads()).toBe(0);
    const consent = set; // the button in this open set
    expect((await show(set, 2, consent)).src).toBe(items[2].full);
    expect(downloads(), 'the tap').toBe(1);
    expect((await show(set, 3, consent)).src).toBe(items[3].full);
    expect(downloads(), 'paged to the next').toBe(2);
    expect((await show(set, 2, consent)).src).toBe(items[2].full); // back: the saved file, not a second download
    expect(downloads()).toBe(2);
    expect(g.__inokPhotoStoreLive!.downloads).toEqual([items[2].full, items[3].full]);
  });

  it('closed and opened again (the same gallery or another): the consent is gone - 0 downloads until a new tap', async () => {
    const first = open();
    await show(first, 0, first);
    expect(downloads()).toBe(1);
    const again = open(); // the viewer opened anew = a new set object
    expect(fullAsk(first, again)).toEqual({ manual: false });
    expect(fullAsk(first, null)).toEqual({ manual: false }); // closed
    expect((await show(again, 1, first)).src).toBeNull();
    const other: ViewerSet = { at: 0, photos: viewerPhotos([{ ...items[0], src: `${U}/x.jpg`, full: `${U}/x.jpg` }], 47) };
    expect((await show(other, 0, first)).src).toBeNull();
    expect(downloads(), 'nothing after the reopening').toBe(1);
    expect((await show(again, 0, first)).src, 'a picture already on the phone shows at once').toBe(items[0].full);
  });

  it('Wi-Fi, or «Wi-Fi і мобільний інтернет» on mobile data: the full file loads by itself, no tap', async () => {
    const set = open();
    NET.v = { connected: true, metered: false, dataSaver: false };
    expect((await show(set, 0, null)).src).toBe(items[0].full);
    NET.v = { connected: true, metered: true, dataSaver: false };
    expect((await show(set, 1, null, 'any')).src).toBe(items[1].full);
    expect(downloads()).toBe(2);
  });

  it('a picture already saved on the phone is shown at once - any setting, offline too, no request', async () => {
    const path = `${CLEAR_DIR}/${photoName('242', items[0].full)}`;
    g.__inokPhotoStore = { bytes: 230_000, seed: { [path]: 230_000 } };
    NET.v = { connected: false, metered: false, dataSaver: false };
    for (const mode of ['unmetered', 'any', 'manual'] as const) expect((await show(open(), 0, null, mode)).src).toBe(`https://inok.info/seed/${path}`);
    expect(downloads()).toBe(0);
  });

  it('«Тільки вручну», Data Saver, offline: the block carries THEIR reason lines (as everywhere)', async () => {
    NET.v = { connected: true, metered: false, dataSaver: false };
    expect(await show(open(), 0, null, 'manual')).toMatchObject({ src: null, why: 'manual', canLoad: true });
    NET.v = { connected: true, metered: true, dataSaver: true };
    expect(await show(open(), 0, null, 'any')).toMatchObject({ src: null, why: 'saver', canLoad: true });
    NET.v = { connected: false, metered: false, dataSaver: false };
    expect(await show(open(), 0, null)).toMatchObject({ src: null, why: 'offline', canLoad: false });
    expect(downloads()).toBe(0);
  });

  it('DRY (A-15): ONE waiting block and ONE asker - the viewer imports them, has no photoSrc / `manual: true` of its own, no new words', () => {
    const src = join(__dirname, '../../src');
    const files: string[] = [];
    const walk = (d: string): void => { for (const f of readdirSync(d)) { const p = join(d, f); if (statSync(p).isDirectory()) walk(p); else if (/\.tsx?$/.test(f)) files.push(p); } };
    walk(src);
    const where = (re: RegExp) => files.filter((f) => re.test(readFileSync(f, 'utf8'))).map((f) => f.replace(/^.*src\//, ''));
    expect(where(/className="photo-wait__reason"/)).toEqual(['components/PhotoWait.tsx']);
    expect(where(/function PhotoWait\b/)).toEqual(['components/PhotoWait.tsx']);
    const viewer = readFileSync(join(src, 'components/PhotoViewer.tsx'), 'utf8');
    expect(viewer).toMatch(/import \{ PhotoWait, usePhoto \} from '\.\/PhotoWait'/);
    expect(viewer).not.toMatch(/photoSrc\(|manual: true/);
    // no new words: the viewer and the block speak only the keys that existed before A-112 (photos.* of A-20, gallery.* of A-96, «Закрити»)
    const used = (f: string) => [...readFileSync(join(src, f), 'utf8').matchAll(/\bt\(\s*[`'](photos\.reason_|[\w.]+)/g)].map((m) => m[1]);
    expect([...new Set([...used('components/PhotoWait.tsx'), ...used('components/PhotoViewer.tsx')])].sort())
      .toEqual(['common.close', 'gallery.next', 'gallery.photo', 'gallery.prev', 'photos.reason_', 'photos.title'].sort());
  });
});
