import type { Db } from '@/data/db/types';
import type { Article, ArticlesPage, Cover, RatingAnswer, VideoLink } from '@/data/api/types';
import { videoUrl } from '@/data/live/streams';
import { castBody } from './cast';
import { ApiError } from '@/data/api/client';
import { ARTICLE_KINDS, dataSource, type ArticleKind } from '@/data/source';
import { sortArticles, type ArticleSort } from './articleOrder';
import { cacheGet, cacheSet } from './cache';
import { getMeta, setMeta } from '@/data/db/schema';
import type { Lang } from '@/i18n';
import { dropCached, photoSrc } from '@/native/covers';
import { bodyPictures } from '@/data/links/router';
import { normalize, stripHtml } from '@/data/search/normalize';
import type { PhotoMode } from '@/data/photos/policy';

/** Stage 4 + A-19 (owner 01.11): the 30 newest items per language stay readable offline (all three kinds in one cache), their
 *  covers cached by the «Wi-Fi only» rule of the house covers; an evicted item takes its picture files with it. */
export const CACHE_N = 30;
const KINDS = new Set(['publication', 'video', 'news']);
/** The older items seen this run (in memory, «Показати більше»): they open like cached ones while the app runs. */
const older = new Map<number, Article>();

/** Keeps the items the app can show: a known kind, an id, a title, a date (unknown fields are ignored, contract §0). */
export function parseArticles(j: unknown): ArticlesPage {
  const x = j as Partial<ArticlesPage> | null;
  const items = Array.isArray(x?.items) ? x!.items : [];
  return {
    items: items.filter((a): a is Article => !!a && typeof a.id === 'number' && KINDS.has(a.kind) && !!a.title && !!a.published_at),
    next: typeof x?.next === 'string' && x.next ? x.next : null,
  };
}

/** Returns the ids that left the cache (their pictures are deleted by the caller on the device — `dropCached`).
 *  D70: `newest` = these items ARE the site's newest page: a cached id inside its date window (from its oldest date up) that the
 *  answer no longer carries was hidden or moved by the site - it leaves the cache (an empty answer removes nothing). */
export async function storeArticles(db: Db, lang: Lang, items: Article[], newest = false): Promise<number[]> {
  const now = Date.now();
  const vanished: number[] = [];
  if (newest && items.length) {
    const from = items.reduce((m, a) => (a.published_at < m ? a.published_at : m), items[0].published_at);
    const ids = items.map((a) => a.id);
    const out = `lang = ? AND published_at >= ? AND id NOT IN (${ids.map(() => '?').join(',')})`;
    vanished.push(...(await db.query<{ id: number }>(`SELECT id FROM article WHERE ${out}`, [lang, from, ...ids])).map((r) => r.id));
    if (vanished.length) await db.run(`DELETE FROM article WHERE ${out}`, [lang, from, ...ids]);
  }
  for (const a of items)
    await db.run('INSERT OR REPLACE INTO article(id, lang, kind, published_at, json, fetched_at) VALUES (?,?,?,?,?,?)',
      [a.id, lang, a.kind, a.published_at, JSON.stringify(a), now]);
  // only the newest CACHE_N per language stay
  const keep = `SELECT id FROM article WHERE lang = ? ORDER BY published_at DESC, id DESC LIMIT ${CACHE_N}`;
  const gone = [...vanished, ...(await db.query<{ id: number }>(`SELECT id FROM article WHERE lang = ? AND id NOT IN (${keep})`, [lang, lang])).map((r) => r.id)];
  if (gone.length) await db.run(`DELETE FROM article WHERE lang = ? AND id NOT IN (${keep})`, [lang, lang]);
  // a picture is kept while ANY language still holds the item
  const still = new Set((await db.query<{ id: number }>('SELECT DISTINCT id FROM article')).map((r) => r.id));
  return gone.filter((id) => !still.has(id));
}

/** The cached feed, newest first (the site's order: date, then id), optionally one kind. */
export async function listArticles(db: Db, lang: Lang, kind?: string | null, limit = CACHE_N): Promise<Article[]> {
  const rows = await db.query<{ json: string }>(
    `SELECT json FROM article WHERE lang = ?${kind ? ' AND kind = ?' : ''} ORDER BY published_at DESC, id DESC LIMIT ?`,
    kind ? [lang, kind, limit] : [lang, limit]);
  return rows.map((r) => JSON.parse(r.json) as Article);
}

export async function getArticle(db: Db, id: number, lang: Lang): Promise<Article | null> {
  const r = await db.query<{ json: string }>('SELECT json FROM article WHERE id = ? ORDER BY lang = ? DESC LIMIT 1', [id, lang]);
  if (r[0]) return JSON.parse(r[0].json) as Article;
  return older.get(id) ?? (await cacheGet<Article[]>(db, newestKey(lang)))?.value.find((a) => a.id === id) ?? null;
}

/**
 * A-51 (R-35) + D69: an opened article, when online, takes that ONE item from the server; a cached copy that differs is replaced (the
 * feed row shows the same), an uncached one (a push tap on a warm app, an older page) is remembered for this run. 404 = the site
 * does not show it (null); offline / busy throws - the caller keeps the cache.
 */
export async function fetchArticle(db: Db, id: number, lang: Lang): Promise<Article | null> {
  let raw: unknown;
  try { raw = await dataSource().article(id, lang); } catch (e) { if (e instanceof ApiError && e.status === 404) return null; throw e; }
  const a = parseArticles({ items: [raw] }).items[0];
  if (!a) return null;
  const json = JSON.stringify(a);
  const cached = await db.query<{ json: string }>('SELECT json FROM article WHERE id = ? AND lang = ?', [id, lang]);
  if (cached[0] && cached[0].json !== json) await db.run('UPDATE article SET json = ?, kind = ?, published_at = ? WHERE id = ? AND lang = ?', [json, a.kind, a.published_at, id, lang]);
  if (!cached[0]) older.set(id, a);
  return a;
}

/**
 * A-25 #3 «Нове на сайті»: the newest publication, the newest video, the newest news — one each, in that order (R-19: the
 * section list of each kind, 1 item). Kept in the cache table (the 30-item feed cache may hold no video at all), so the home and
 * the article open offline; offline / a failed kind = the last answer, then the feed cache of that kind.
 */
const newestKey = (lang: Lang) => `newest_by_kind:${lang}`;
export async function cachedNewestByKind(db: Db, lang: Lang): Promise<Article[]> {
  const kept = (await cacheGet<Article[]>(db, newestKey(lang)))?.value ?? [];
  const out: Article[] = [];
  for (const k of ARTICLE_KINDS) {
    const a = kept.find((x) => x.kind === k) ?? (await listArticles(db, lang, k, 1))[0];
    if (a) out.push(a);
  }
  return out;
}
export async function fetchNewestByKind(db: Db, lang: Lang): Promise<Article[]> {
  const pages = await Promise.allSettled(ARTICLE_KINDS.map((kind) => dataSource().articles(lang, null, { kind, limit: 1 })));
  const got = pages.flatMap((p) => (p.status === 'fulfilled' ? parseArticles(p.value).items.slice(0, 1) : []));
  if (got.length) {
    const kept = (await cacheGet<Article[]>(db, newestKey(lang)))?.value ?? [];
    await cacheSet(db, newestKey(lang), ARTICLE_KINDS.map((k) => got.find((a) => a.kind === k) ?? kept.find((a) => a.kind === k)).filter(Boolean));
  }
  return cachedNewestByKind(db, lang);
}

/**
 * One page from the API into the cache. `since` = the cursor of the page before (null = the newest page, which also refreshes
 * the cached items). Throws when offline — the caller keeps showing the cache. Returns the next cursor.
 */
export async function fetchArticles(db: Db, lang: Lang, since: string | null = null, photos?: PhotoMode): Promise<{ next: string | null; count: number }> {
  const page = parseArticles(await dataSource().articles(lang, since));
  await dropCached((await storeArticles(db, lang, page.items, !since)).map((id) => `a${id}`));
  if (photos && !since) void keepPictures(page.items, photos);
  await setMeta(db, `articles_next:${lang}`, page.next ?? ''); // where «Показати більше» continues ('' = the last page)
  return { next: page.next, count: page.items.length };
}

/** The header picture of an article (A-30 / R-26): the page's own large picture, else the feed preview. ONE rule for the view and the offline list. */
export const articleHeader = (a: Article): Cover | null => a.cover_large ?? a.cover ?? null;
/** A-40: the lead (анонс) the article shows above its text - the html-lite when it says anything (tags, &nbsp; and spaces alone = none) */
export const articleLead = (a: Pick<Article, 'lead'>): string | null =>
  a.lead && stripHtml(a.lead).replace(/&nbsp;|&#160;/g, ' ').trim() ? a.lead : null;
/** R-47 (A-101): THE video link of an item, any kind - its `video` (https only; an unknown host = `other`); a copy saved by 1.0.6 has no
 *  `video` field, then `youtube_video_id` makes the YouTube link as before. ONE source for ONE button (P5). */
export function videoLink(a: Pick<Article, 'video' | 'youtube_video_id'>): VideoLink | null {
  if (a.video !== undefined) {
    const v = a.video;
    if (!v || typeof v.url !== 'string' || !/^https:\/\//i.test(v.url)) return null;
    return { url: v.url, host: v.host === 'youtube' || v.host === 'facebook' ? v.host : 'other' };
  }
  return a.youtube_video_id ? { url: videoUrl(a.youtube_video_id), host: 'youtube' } : null;
}
/** A-101: «Читати повністю на inok.info» ONLY for an item the site assembles from an included file - no body AND no video. A video
 *  item without text (1892) shows its button and lead, nothing more (CD S302: the page holds only the same video). */
export const readOnSite = (a: Pick<Article, 'body' | 'video' | 'youtube_video_id'>): boolean => !a.body && !videoLink(a);
/** The pictures an article keeps offline (A-19): its row's cover, its header picture and its body's own `<img src>` list (R-18) — one list. */
export const articlePictures = (a: Article): string[] => [...new Set([...(a.cover ? [a.cover.url] : []), ...(articleHeader(a) ? [articleHeader(a)!.url] : []), ...bodyPictures(a.body)])];

/** A-19: with the text, its pictures — through the ONE pipeline (the A-20 rule decides): the row's thumbnail is SMALL (any network,
 *  so the feed has its pictures offline), the header and body pictures are large (the setting; nothing large on a metered network). */
async function keepPictures(items: Article[], mode: PhotoMode): Promise<void> {
  for (const a of items.slice(0, CACHE_N)) for (const url of articlePictures(a)) await photoSrc(`a${a.id}`, url, mode, { small: url === a.cover?.url }).catch(() => undefined);
}

/** R-19: a kind tab pages the SERVER's section list (`articles?kind=`, the site's /articles/<section>/ order), not the cache. */
export const fetchKind = async (lang: Lang, kind: ArticleKind, cursor: string | null): Promise<ArticlesPage> =>
  remember(parseArticles(await dataSource().articles(lang, cursor, { kind })));

/** «Показати більше»: an older page, shown while online and NOT cached (A-19 keeps only the 30 newest). */
export async function fetchOlder(lang: Lang, cursor: string): Promise<ArticlesPage> {
  return remember(parseArticles(await dataSource().articles(lang, cursor)));
}
/** Items shown outside the 30-item cache (older pages, a card's blocks) open like cached ones while the app runs. */
const remember = (p: ArticlesPage): ArticlesPage => { for (const a of p.items) older.set(a.id, a); return p; };

/** A-18 / R-17: a card's block «Публікації» / «Відео» / «Новини» — its rows and where «Показати більше» continues. */
export interface RelatedBlock { kind: ArticleKind; items: Article[]; next: string | null }
/** The card's blocks in the site's order; a block with no rows is not drawn at all (no heading, no empty list). */
export const buildBlocks = (pages: Partial<Record<ArticleKind, ArticlesPage>>): RelatedBlock[] =>
  ARTICLE_KINDS.map((kind) => ({ kind, items: pages[kind]?.items ?? [], next: pages[kind]?.next ?? null })).filter((b) => b.items.length > 0);

/**
 * The card's three blocks in the INTERFACE language (the lists differ by language): ONE call per block, in parallel; the first
 * pages are kept per card + language, so a card opened before shows its blocks offline. Network failure → the kept pages.
 */
export async function loadRelated(db: Db, code: number, lang: Lang): Promise<RelatedBlock[]> {
  const key = `related:${code}:${lang}`;
  try {
    const pages = await Promise.all(ARTICLE_KINDS.map(async (kind) => [kind, remember(parseArticles(await dataSource().articles(lang, null, { monastery: code, kind })))] as const));
    const byKind = Object.fromEntries(pages) as Record<ArticleKind, ArticlesPage>;
    await cacheSet(db, key, byKind);
    return buildBlocks(byKind);
  } catch {
    const kept: Partial<Record<ArticleKind, ArticlesPage>> = (await cacheGet<Record<ArticleKind, ArticlesPage>>(db, key))?.value ?? {};
    for (const p of Object.values(kept)) remember(p as ArticlesPage);
    return buildBlocks(kept);
  }
}

/** A block's «Показати більше»: the next 5 rows (online). */
export const moreRelated = async (code: number, kind: ArticleKind, lang: Lang, cursor: string): Promise<ArticlesPage> =>
  remember(parseArticles(await dataSource().articles(lang, cursor, { monastery: code, kind })));


/** The cursor of the next page after what was fetched (null = none / the last page). */
export const nextCursor = async (db: Db, lang: Lang): Promise<string | null> => (await getMeta(db, `articles_next:${lang}`)) || null;

/** The item's numbers that the server recounts (R-29): written into every cached copy of the item, so the feed row and the open
 *  article show the same. A copy that is not cached stays uncached (the 30-item rule, A-19). */
export type Counts = Pick<Article, 'rating' | 'comments_count'>;
export async function keepCounts(db: Db, id: number, n: Counts): Promise<void> {
  for (const r of await db.query<{ lang: string; json: string }>('SELECT lang, json FROM article WHERE id = ?', [id]))
    await db.run('UPDATE article SET json = ? WHERE id = ? AND lang = ?', [JSON.stringify({ ...(JSON.parse(r.json) as Article), ...n }), id, r.lang]);
}

export const myRating = async (db: Db, id: number): Promise<number | null> =>
  (await db.query<{ value: number }>('SELECT value FROM article_rating WHERE id = ?', [id]))[0]?.value ?? null;

/** Casts a rating (200), or learns the one already cast (409) — either way the install's value is stored and the item's
 *  cached rating updated. Play Integrity (A-66): the shared cast body. */
export async function rateArticle(db: Db, a: Article, value: number, lang: Lang): Promise<RatingAnswer> {
  const ans = await dataSource().rate(a.id, await castBody(db, (i) => ['rating', a.id, value, i], { value }));
  await db.run('INSERT OR REPLACE INTO article_rating(id, value) VALUES (?, ?)', [a.id, ans.mine]);
  if (ans.rating) await storeArticles(db, lang, [{ ...a, rating: ans.rating }]);
  return ans;
}

/** R-44 / A-97: the search text as sent - trimmed, a run of spaces = one, 2..64 characters; shorter = no search ('') */
export const QUERY_MIN = 2;
export const QUERY_MAX = 64;
export const queryText = (q: string): string => { const s = q.trim().replace(/\s+/g, ' '); return s.length >= QUERY_MIN ? s.slice(0, QUERY_MAX).trim() : ''; };

/** R-44 / A-97: ONE page of a found / sorted list (the feed or a kind; `next` serves only THIS list); `signal` cancels it (a newer query).
 *  R-48 (P8): its `views_week` and `rating` go into the saved copies of its items, so a later OFFLINE sort orders them by the same numbers. */
export async function fetchQuery(db: Db, lang: Lang, kind: ArticleKind | null, q: string, sort: ArticleSort, cursor: string | null, signal?: AbortSignal): Promise<ArticlesPage> {
  const page = remember(parseArticles(await dataSource().articles(lang, cursor, { ...(kind ? { kind } : {}), ...(q ? { q } : {}), sort }, signal)));
  await keepWeek(db, lang, page.items);
  return page;
}
/** The R-48 numbers of a sorted answer into the copies saved in THAT language (an unsaved item stays unsaved, A-19). */
async function keepWeek(db: Db, lang: Lang, items: Article[]): Promise<void> {
  for (const a of items) {
    if (typeof a.views_week !== 'number') continue;
    const r = await db.query<{ json: string }>('SELECT json FROM article WHERE id = ? AND lang = ?', [a.id, lang]);
    if (!r[0]) continue;
    const cur = JSON.parse(r[0].json) as Article;
    const n = { ...cur, views_week: a.views_week, ...(a.rating !== undefined ? { rating: a.rating } : {}) };
    if (JSON.stringify(n) !== r[0].json) await db.run('UPDATE article SET json = ? WHERE id = ? AND lang = ?', [JSON.stringify(n), a.id, lang]);
  }
}

/** A page appended to a list: an item already there is not repeated (R-44: a views order may repeat one between pages). */
export const mergePage = (shown: Article[], page: Article[]): Article[] => [...shown, ...page.filter((a) => !shown.some((b) => b.id === a.id))];

/** The search's text test (title or subtitle, never across the two; the search's ONE folding: case, apostrophes, і/и …). */
const folded = (s: string) => normalize(s);
export const matchesQuery = (a: Pick<Article, 'title' | 'subtitle'>, q: string): boolean => {
  const f = folded(q);
  return !f || [a.title, a.subtitle ?? ''].some((s) => folded(s).includes(f));
};

/**
 * A-97 / A-101 offline: the SAVED publications filtered and ordered on the phone (the note says so) by THE comparator the fixtures' server
 * uses too (`articleOrder`): `created` by what the item carries (`created_at`, else the publication date), `views_week` / `rating` by the
 * saved `views_week` (absent = 0) and `rating`; a tie keeps the list's order.
 */
export const localQuery = (items: Article[], q: string, sort: ArticleSort): Article[] => sortArticles(items.filter((a) => matchesQuery(a, q)), sort);
