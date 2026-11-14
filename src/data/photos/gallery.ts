import type { AppConfig, MonasteryPhotos, PhotoFile } from '@/data/api/types';
import { ApiError } from '@/data/api/client';
import type { Lang } from '@/i18n';
import { dataSource } from '@/data/source';
import { online } from '@/native/network';

/** One picture of a gallery - a publication's site gallery (R-45) or a card's (R-49): the copy shown first (`src`), its own size, the full
 *  file behind it (`full`; = `src` when the server keeps no reduced copy - then the ONE copy is the full file) and the caption. */
export interface GalleryItem { src: string; full: string | null; w: number | null; h: number | null; alt: string }

/** R-49 / A-109: the card's «Фотогалерея» opens the app's viewer only when the server says it answers the list; else 1.0.7's site page. */
export const galleryInApp = (c?: Pick<AppConfig, 'features'> | null): boolean => c?.features?.monastery_photos === true;

const file = (f: unknown): PhotoFile | null => {
  const x = f as Partial<PhotoFile> | null;
  return x && typeof x.url === 'string' && /^https:\/\//.test(x.url) ? { url: x.url, w: Number(x.w) || 0, h: Number(x.h) || 0 } : null;
};

/**
 * R-49 contract table -> the viewer's items, in the server's order (photos[0] first). `thumb` null (every photo today) = the full file is
 * the ONE copy (`src` = `full`), w / h = the full file's (the frame keeps its shape before the picture arrives); `alt` null (every photo
 * today) = the card's name, as the site's viewer titles every slide. A photo without an https `full` is skipped, never guessed.
 */
export function galleryItems(a: Pick<MonasteryPhotos, 'photos'> | null | undefined, name: string, lang: Lang): GalleryItem[] {
  return (Array.isArray(a?.photos) ? a.photos : []).flatMap((p) => {
    const full = file(p?.full);
    if (!full) return [];
    const thumb = file(p?.thumb);
    const shown = thumb ?? full;
    const alt = (p?.alt && (p.alt[lang] || p.alt.uk)) || name;
    return [{ src: shown.url, full: full.url, w: shown.w || null, h: shown.h || null, alt }];
  });
}

/** What a tap gets: the photos, none (the server says 0 / 404 - the cover alone), or no answer (offline / a failed request - the message). */
export type GalleryLoad = { kind: 'photos'; items: GalleryItem[] } | { kind: 'none' } | { kind: 'offline' };

/** A-109: the list held in memory for this launch (never written to SQLite); keyed by code. A failed request is not kept. */
const held = new Map<number, MonasteryPhotos | null>();
export const forgetGalleries = () => held.clear(); // tests

/**
 * A-109: the card's list, asked ON A TAP only (never when the card opens, never ahead). A list held from an earlier tap of this launch is
 * used without the network (so photos opened before show from the photo store offline); else offline = `offline` with no request.
 */
export async function loadGallery(code: number, name: string, lang: Lang, deps: { fetch: (code: number) => Promise<MonasteryPhotos>; online: () => Promise<boolean> }): Promise<GalleryLoad> {
  let a = held.get(code);
  if (a === undefined) {
    if (!(await deps.online())) return { kind: 'offline' };
    try {
      a = await deps.fetch(code);
    } catch (e) {
      if (!(e instanceof ApiError && e.status === 404)) return { kind: 'offline' }; // no answer / 5xx / timeout: the message, ask again next tap
      a = null; // unknown / inactive card: nothing to page through
    }
    held.set(code, a);
  }
  const items = galleryItems(a, name, lang);
  return items.length ? { kind: 'photos', items } : { kind: 'none' };
}

/** The card's tap: THE data source + THE network reading (A-15: one of each). */
export const cardGallery = (code: number, name: string, lang: Lang): Promise<GalleryLoad> =>
  loadGallery(code, name, lang, { fetch: (c) => dataSource().monasteryPhotos(c), online });
