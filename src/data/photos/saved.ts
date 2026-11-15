import type { Db } from '@/data/db/types';
import { listPictureNames } from './store';

/** A-111: the list pictures the database names today (houses' thumbnails, the saved publications' covers) - what a legacy file must match
 *  to stay kept (`legacyKept`). Read when «Ще» measures, never held; null = cannot judge (no sort). */
export async function dbPictureNames(db: Db): Promise<Set<string> | null> {
  const thumbs = await db.query<{ code: number; thumb_url: string | null; thumb_sha256: string | null }>('SELECT code, thumb_url, thumb_sha256 FROM monastery');
  const rows = await db.query<{ id: number; json: string }>('SELECT id, json FROM article');
  const covers = rows.map((r) => {
    try {
      const u = (JSON.parse(r.json) as { cover?: { url?: unknown } | null }).cover?.url;
      return { id: r.id, url: typeof u === 'string' ? u : null };
    } catch {
      return { id: r.id, url: null };
    }
  });
  // a database without houses' thumbnails (not imported yet) cannot judge a legacy file: no sort this time (P1)
  return thumbs.some((m) => m.thumb_url) ? listPictureNames(thumbs, covers) : null;
}
