import type { Article, RatingPrior } from '@/data/api/types';

/** R-44 / R-48 (A-97, A-101): the orders of a list. `published` = the list's own (the default, never sent). */
export type ArticleSort = 'published' | 'created' | 'views_week' | 'rating';
/** Every order the app knows, in the sheet's order. */
export const ARTICLE_SORTS: ArticleSort[] = ['published', 'created', 'views_week', 'rating'];
/** The orders the sheet offers: the two dates always; `views_week` / `rating` only when the server takes them (R-48 flag). */
export const articleSorts = (features?: { articles_sort_v2?: boolean } | null): ArticleSort[] =>
  ARTICLE_SORTS.filter((s) => features?.articles_sort_v2 || (s !== 'views_week' && s !== 'rating'));

/** The average AS SHOWN (one decimal, contract §3 R-48 row 3: 4.66 and 4.74 are both 4.7). */
const shown = (v: number) => Math.round(v * 10) / 10;
const rated = (a: Pick<Article, 'rating'>) => !!a.rating && a.rating.count > 0;
const week = (a: Pick<Article, 'views_week'>) => a.views_week ?? 0; // contract: 0 = none; an item saved without it counts 0
const at = (a: Pick<Article, 'created_at' | 'published_at'>) => a.created_at ?? a.published_at;

/** the eye (`views`, contract §3: null = 0) - since 17.11.2026 the rating order's third key (it was `views_week`) */
const eye = (a: Pick<Article, 'views'>) => a.views ?? 0;
const newer = (a: Article, b: Article) => at(b).localeCompare(at(a));
/** A-179 / R-64: the rating order's first key with confidence - S = (n·v + m·C) / (n + m), v = the value AS SHOWN, m and C = the server's
 *  `rating_prior` (no prior ever received: the value itself, the old rule - never a client guess) */
export const ratingScore = (r: { value: number; count: number }, prior?: RatingPrior | null): number =>
  prior ? (r.count * shown(r.value) + prior.weight * prior.mean) / (r.count + prior.weight) : shown(r.value);

/**
 * THE comparator of an order (A-15: ONE function for the offline list and the fixtures' server), null = the list's own order.
 * `rating` (contract §3 R-48 table, A-131 cloud_41): the rated first - the value as shown higher, then more ratings, then more views (the
 * eye), then the NEWER first; after them the unrated (`{value:0,count:0}`) and news (`rating` null) together by views, then the newer.
 * A full tie returns 0: the caller keeps the list's order.
 */
export function articleOrder(sort: ArticleSort, prior?: RatingPrior | null): ((a: Article, b: Article) => number) | null {
  if (sort === 'created') return newer;
  if (sort === 'views_week') return (a, b) => week(b) - week(a);
  if (sort === 'rating') return (a, b) => {
    const ra = rated(a), rb = rated(b);
    if (ra !== rb) return ra ? -1 : 1;
    if (ra) return ratingScore(b.rating!, prior) - ratingScore(a.rating!, prior) || b.rating!.count - a.rating!.count || eye(b) - eye(a) || newer(a, b);
    return eye(b) - eye(a) || newer(a, b);
  };
  return null;
}

/** A list in that order; a tie keeps the given order (a stable sort by index, whatever the engine's). */
export function sortArticles<T extends Article>(items: T[], sort: ArticleSort, prior?: RatingPrior | null): T[] {
  const cmp = articleOrder(sort, prior);
  return cmp ? items.map((a, i) => ({ a, i })).sort((x, y) => cmp(x.a, y.a) || x.i - y.i).map((x) => x.a) : items;
}
