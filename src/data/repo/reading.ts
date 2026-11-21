import type { Db } from '@/data/db/types';
import type { Article } from '@/data/api/types';
import type { Lang } from '@/i18n';

/**
 * A-141 (cloud_42) - ONLY on the phone, the server never hears of it:
 * (1) SAVED articles («★»): the item stored WHOLE (its JSON as shown: text, lead, cover, pictures' addresses) in `saved_article`; it opens
 *     offline, survives the 30-item feed rotation and A-132's reset_data (KEPT_TABLES), and stays readable when the site removes it.
 * (2) THE PLACE in the last 50 opened articles (`reading`): an ANCHOR - the index of the text block at the top edge + the fraction inside it
 *     (never pixels: A−/A+, a rotation, a changed article keep it); started / finished by the rule of A-141 (2); a video has none (4).
 */
export const PLACES_KEPT = 50;
export const CONTINUE_DAYS = 30;
export const STARTED_AFTER_MS = 20_000;
export const LAST_SEEN_MS = 2_000;
const DAY = 86_400_000;

/** what a row / the continue card needs of an article (no body) - the place outlives the 30-item feed cache */
export type Snap = Pick<Article, 'id' | 'kind' | 'title' | 'subtitle' | 'cover' | 'published_at' | 'site_url'>;
export const snapOf = (a: Article): Snap => ({ id: a.id, kind: a.kind, title: a.title, subtitle: a.subtitle ?? null, cover: a.cover ?? null, published_at: a.published_at, site_url: a.site_url });

export interface Place { id: number; kind: string; snap: Snap; anchor: number; frac: number; pct: number; started: boolean; finished: boolean; dismissed: boolean; opened_at: number }
type PlaceRow = Omit<Place, 'snap' | 'started' | 'finished' | 'dismissed'> & { snap: string; started: number; finished: number; dismissed: number };
const toPlace = (r: PlaceRow): Place => ({ ...r, snap: JSON.parse(r.snap) as Snap, started: !!r.started, finished: !!r.finished, dismissed: !!r.dismissed });

/** A-141 (4): a video item keeps no place and never shows in «continue» */
export const keepsPlace = (kind: string): boolean => kind !== 'video';

export async function listPlaces(db: Db): Promise<Place[]> {
  return (await db.query<PlaceRow>('SELECT id, kind, snap, anchor, frac, pct, started, finished, dismissed, opened_at FROM reading ORDER BY opened_at DESC, id DESC')).map(toPlace);
}
export async function getPlace(db: Db, id: number): Promise<Place | null> {
  const r = await db.query<PlaceRow>('SELECT id, kind, snap, anchor, frac, pct, started, finished, dismissed, opened_at FROM reading WHERE id = ?', [id]);
  return r[0] ? toPlace(r[0]) : null;
}

/** An article opened: its snapshot and «opened now» (a dismissed one comes back to «continue» by being opened again); the last 50 stay. */
export async function noteOpened(db: Db, a: Article, now: number = Date.now()): Promise<void> {
  if (!keepsPlace(a.kind)) return;
  await db.run(`INSERT INTO reading(id, kind, snap, opened_at) VALUES (?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET kind = excluded.kind, snap = excluded.snap, opened_at = excluded.opened_at, dismissed = 0`, [a.id, a.kind, JSON.stringify(snapOf(a)), now]);
  await db.run(`DELETE FROM reading WHERE id NOT IN (SELECT id FROM reading ORDER BY opened_at DESC, id DESC LIMIT ${PLACES_KEPT})`);
}

/** The reader moved: the anchor, the per cent of the text, and the two marks (a mark once set is only cleared by the person, `setFinished`). */
export async function savePlace(db: Db, id: number, p: { anchor: number; frac: number; pct: number; started?: boolean; finished?: boolean }): Promise<void> {
  await db.run(`UPDATE reading SET anchor = ?, frac = ?, pct = ?, started = MAX(started, ?), finished = MAX(finished, ?) WHERE id = ?`,
    [Math.max(0, Math.floor(p.anchor)), Math.min(1, Math.max(0, p.frac)), Math.min(100, Math.max(0, Math.round(p.pct))), p.started ? 1 : 0, p.finished ? 1 : 0, id]);
}

/** A-142 (3): «Позначити як прочитане / непрочитане» - read = finished (leaves «continue», «✓ прочитано»); unread = back to the start. */
export async function setFinished(db: Db, a: Article | Snap, finished: boolean, now: number = Date.now()): Promise<void> {
  if (!keepsPlace(a.kind)) return;
  await db.run(`INSERT INTO reading(id, kind, snap, opened_at) VALUES (?, ?, ?, ?) ON CONFLICT(id) DO NOTHING`, [a.id, a.kind, JSON.stringify('body' in a ? snapOf(a as Article) : a), now]);
  if (finished) await db.run('UPDATE reading SET finished = 1, pct = 100 WHERE id = ?', [a.id]);
  else await db.run('UPDATE reading SET finished = 0, started = 0, pct = 0, anchor = 0, frac = 0 WHERE id = ?', [a.id]);
}

/** ✕ on the continue card: out of «continue» (the place itself is kept - opening the article resumes there and brings it back) */
export const dismissPlace = (db: Db, id: number): Promise<void> => db.run('UPDATE reading SET dismissed = 1 WHERE id = ?', [id]).then(() => undefined);

/** A-141 (3) THE rule of «Продовжити читання»: started, not finished, not dismissed, not a video, opened within 30 days; the latest first. */
export const continueList = (places: Place[], now: number = Date.now()): Place[] =>
  places.filter((p) => p.started && !p.finished && !p.dismissed && keepsPlace(p.kind) && now - p.opened_at <= CONTINUE_DAYS * DAY)
    .sort((a, b) => b.opened_at - a.opened_at);

/** T1 (cloud_43, remark 1): WHERE the continue card stands over «Публікації» - every kind tab, any order, any entry (tab bar, a Home block
 *  with ?sort=, a site link); not on «★» (`saved`) and not while a search text is typed. */
export const SAVED = 'saved'; // the «★» tab's value (Articles.tsx)
export const continueOver = (kind: string, q: string): boolean => kind !== SAVED && q.trim() === '';

/** A-141 (2): the started article shows its place on reopening; a finished / never started one opens at the top */
export const resumeOf = (p: Place | null): { anchor: number; frac: number } | null => (p && p.started && !p.finished && keepsPlace(p.kind) ? { anchor: p.anchor, frac: p.frac } : null);

// ---- saved articles ----
export async function savedIds(db: Db): Promise<number[]> {
  return (await db.query<{ id: number }>('SELECT id FROM saved_article ORDER BY saved_at DESC, id DESC')).map((r) => r.id);
}
/** «★»: newest-saved first */
export async function listSaved(db: Db): Promise<Article[]> {
  return (await db.query<{ json: string }>('SELECT json FROM saved_article ORDER BY saved_at DESC, id DESC')).map((r) => JSON.parse(r.json) as Article);
}
export async function getSaved(db: Db, id: number): Promise<Article | null> {
  const r = await db.query<{ json: string }>('SELECT json FROM saved_article WHERE id = ?', [id]);
  return r[0] ? (JSON.parse(r[0].json) as Article) : null;
}
export async function saveArticle(db: Db, a: Article, lang: Lang, now: number = Date.now()): Promise<void> {
  await db.run('INSERT OR REPLACE INTO saved_article(id, lang, json, saved_at) VALUES (?, ?, ?, COALESCE((SELECT saved_at FROM saved_article WHERE id = ?), ?))',
    [a.id, lang, JSON.stringify(a), a.id, now]);
}
export const unsaveArticle = (db: Db, id: number): Promise<void> => db.run('DELETE FROM saved_article WHERE id = ?', [id]).then(() => undefined);
/** a saved copy follows the site's newer text when the article is opened online (the saving time stays) */
export async function refreshSaved(db: Db, a: Article, lang: Lang): Promise<void> {
  await db.run('UPDATE saved_article SET json = ?, lang = ? WHERE id = ? AND json <> ?', [JSON.stringify(a), lang, a.id, JSON.stringify(a)]);
}

// ---- the anchor (pure; the view measures, this decides) ----
/** The block at the reading line `y` (the top edge under the header): its index and how far into it (0..1). Blocks = the text's blocks
 *  in order, as [top, height] in the scroller's coordinates. Before the text = 0 / 0; after it = the last block's end. */
export function anchorAt(blocks: [number, number][], y: number): { anchor: number; frac: number } {
  if (!blocks.length) return { anchor: 0, frac: 0 };
  for (let i = 0; i < blocks.length; i++) {
    const [top, h] = blocks[i];
    if (y < top + h) return { anchor: i, frac: y <= top || h <= 0 ? 0 : (y - top) / h };
  }
  return { anchor: blocks.length - 1, frac: 1 };
}
/** the scroll position that puts the anchor back at the reading line */
export const yOfAnchor = (blocks: [number, number][], p: { anchor: number; frac: number }): number => {
  const b = blocks[Math.min(Math.max(0, p.anchor), blocks.length - 1)];
  return b ? b[0] + b[1] * p.frac : 0;
};
/** A-141 (2): N % = the share of the TEXT above the screen's bottom edge (the text only: no header, no ratings / comments) */
export const pctOf = (textTop: number, textHeight: number, viewBottom: number): number =>
  textHeight <= 0 ? 0 : Math.round(Math.min(1, Math.max(0, (viewBottom - textTop) / textHeight)) * 100);
