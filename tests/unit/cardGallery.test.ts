import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { serveFixtures } from './helpers';
import { ApiError } from '@/data/api/client';
import type { MonasteryPhotos } from '@/data/api/types';
import { dataSource } from '@/data/source';
import { forgetGalleries, galleryInApp, galleryItems, loadGallery } from '@/data/photos/gallery';
import { viewerPhotos } from '@/components/PhotoViewer';

/** The live R-49 answers (14.11.2026, one request each): 242 = 40, 16 / 275 = one, 47 = none. */
const LIVE = JSON.parse(readFileSync(new URL('../../fixtures/monastery_photos.json', import.meta.url), 'utf8')) as Record<string, MonasteryPhotos>;
const deps = (answer: () => Promise<MonasteryPhotos>, on = true) => ({ fetch: vi.fn(answer), online: vi.fn(async () => on) });

describe('A-98 / A-109 / R-49: the card gallery in the app viewer', () => {
  beforeEach(() => { forgetGalleries(); serveFixtures(); });
  afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

  it('the switch: config.features.monastery_photos true = the app viewer; absent / false / no config = 1.0.7 (gallery_url)', () => {
    expect(galleryInApp({ features: { comments_write: false, embedded_player: false, monastery_photos: true } })).toBe(true);
    expect(galleryInApp({ features: { comments_write: false, embedded_player: false } })).toBe(false); // an old server
    expect(galleryInApp({ features: { comments_write: false, embedded_player: false, monastery_photos: false } })).toBe(false);
    expect(galleryInApp(null)).toBe(false); // config not loaded yet (first seconds, offline first run)
  });

  it('contract row «photos» (242): 40 items in the server order, photos[0] first; thumb null = the full file is the ONE copy; alt null = the name', () => {
    const items = galleryItems(LIVE['242'], 'Святогірська лавра', 'uk');
    expect(items).toHaveLength(40);
    expect(items[0]).toEqual({ src: 'https://inok.info/images/monasteries/242/00.jpg', full: 'https://inok.info/images/monasteries/242/00.jpg', w: 2045, h: 1153, alt: 'Святогірська лавра' });
    expect(items.map((x) => x.full)).toEqual(LIVE['242'].photos.map((p) => p.full.url));
    expect(items.every((x) => x.src === x.full)).toBe(true);
  });

  it('contract row «a photo with a reduced copy» (none today): the small copy is shown first, the full file behind it; alt in the language', () => {
    const a = { photos: [{ thumb: { url: 'https://inok.info/t/1.jpg', w: 300, h: 200 }, full: { url: 'https://inok.info/f/1.jpg', w: 3000, h: 2000 }, alt: { uk: 'Собор', ru: 'Собор ru', en: null } }] };
    expect(galleryItems(a, 'N', 'ru')).toEqual([{ src: 'https://inok.info/t/1.jpg', full: 'https://inok.info/f/1.jpg', w: 300, h: 200, alt: 'Собор ru' }]);
    expect(galleryItems(a, 'N', 'en')[0].alt).toBe('Собор'); // en missing -> uk, as every L10n of the app
  });

  it('contract rows «one photo» (16, 275) and «no photos» (47); a broken entry is skipped, never guessed', () => {
    expect(galleryItems(LIVE['16'], 'N', 'uk')).toHaveLength(1);
    expect(galleryItems(LIVE['275'], 'N', 'uk')[0].full).toBe('https://inok.info/images/monasteries/275/00.JPG');
    expect(galleryItems(LIVE['47'], 'N', 'uk')).toEqual([]);
    expect(galleryItems({ photos: [{ thumb: null, full: { url: 'http://x/1.jpg', w: 1, h: 1 }, alt: null }, { thumb: null, full: null as never, alt: null }] }, 'N', 'uk')).toEqual([]);
    expect(galleryItems(null, 'N', 'uk')).toEqual([]);
  });

  it('a tap online: ONE request; photos -> the set; 0 photos or 404 -> none (the cover alone); the list is held for this launch', async () => {
    const d = deps(async () => LIVE['242']);
    expect((await loadGallery(242, 'N', 'uk', d)).kind).toBe('photos');
    expect((await loadGallery(242, 'N', 'uk', d)).kind).toBe('photos');
    expect(d.fetch).toHaveBeenCalledTimes(1); // held: the second tap asks nothing
    expect(await loadGallery(47, 'N', 'uk', deps(async () => LIVE['47']))).toEqual({ kind: 'none' });
    const gone = deps(async () => { throw new ApiError(404, 'not_found'); });
    expect(await loadGallery(9999, 'N', 'uk', gone)).toEqual({ kind: 'none' });
  });

  it('offline = the message (no request at all); a failed request (5xx / no answer) = the message, asked again on the next tap', async () => {
    const off = deps(async () => LIVE['242'], false);
    expect(await loadGallery(242, 'N', 'uk', off)).toEqual({ kind: 'offline' });
    expect(off.fetch).not.toHaveBeenCalled();
    const bad = deps(async () => { throw new ApiError(503, 'busy'); });
    expect(await loadGallery(242, 'N', 'uk', bad)).toEqual({ kind: 'offline' });
    const dead = deps(async () => { throw new TypeError('Failed to fetch'); });
    expect(await loadGallery(242, 'N', 'uk', dead)).toEqual({ kind: 'offline' });
    expect((await loadGallery(242, 'N', 'uk', deps(async () => LIVE['242']))).kind).toBe('photos'); // not held after a failure
  });

  it('A-109 (4): a list held from an earlier tap opens offline too - the photos he opened come from the photo store', async () => {
    await loadGallery(242, 'N', 'uk', deps(async () => LIVE['242']));
    const off = deps(async () => LIVE['242'], false);
    expect((await loadGallery(242, 'N', 'uk', off)).kind).toBe('photos');
    expect(off.fetch).not.toHaveBeenCalled();
  });

  it('the viewer set: the card code is the photo store key; w / h carried (the frame without a jump); no neighbour is marked shown', () => {
    const set = viewerPhotos(galleryItems(LIVE['242'], 'N', 'uk'), 242);
    expect(set[0]).toEqual({ code: '242', src: LIVE['242'].photos[0].full.url, shown: null, full: LIVE['242'].photos[0].full.url, alt: 'N', w: 2045, h: 1153 });
    expect(set.every((p) => p.shown === null)).toBe(true);
  });

  it('the fixtures source answers as the server: the live table by code, 404 for an unknown code', async () => {
    expect((await dataSource().monasteryPhotos(242)).count).toBe(40);
    expect((await dataSource().monasteryPhotos(47)).photos).toEqual([]);
    await expect(dataSource().monasteryPhotos(1)).rejects.toMatchObject({ status: 404 });
  });
});
