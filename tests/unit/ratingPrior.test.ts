import { describe, expect, it, vi, afterEach } from 'vitest';
import { articleOrder, ratingScore, sortArticles } from '@/data/repo/articleOrder';
import { fetchQuery, keptPrior, localQuery, parseArticles } from '@/data/repo/articles';
import { dataSource } from '@/data/source';
import { freshDb, serveFixtures } from './helpers';

// A-179 / R-64 (cloud_46): the rating order with confidence - the SAME five examples as the site's unit (InokSite ruling 424)
const C = { mean: 4.84, weight: 5 };
const it_ = (id: number, value: number, count: number) => ({ id, kind: 'publication', title: `t${id}`, published_at: '2026-11-01T00:00:00Z', rating: { value, count }, views: 0 }) as never;
const FIVE = [it_(5, 4.8, 6), it_(4, 5.0, 1), it_(3, 5.0, 2), it_(2, 4.9, 20), it_(1, 5.0, 21)];
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe('rating with confidence (A-179)', () => {
  it('the site\'s five at C 4.84: 21x5.0 (4.969) > 20x4.9 (4.888) > 2x5.0 (4.886) > 1x5.0 (4.867) > 6x4.8 (4.818)', () => {
    expect(sortArticles(FIVE, 'rating', C).map((a: { id: number }) => a.id)).toEqual([1, 2, 3, 4, 5]);
    expect([[5, 21], [4.9, 20], [5, 2], [5, 1], [4.8, 6]].map(([value, count]) => Math.round(ratingScore({ value, count }, C) * 1000) / 1000))
      .toEqual([4.969, 4.888, 4.886, 4.867, 4.818]);
  });
  it('no prior ever received = the old rule (value as shown, then count) - never a client guess', () => {
    expect(sortArticles(FIVE, 'rating').map((a: { id: number }) => a.id)).toEqual([1, 3, 4, 2, 5]);
    expect(articleOrder('rating', null)).not.toBeNull();
  });
  it('the answer\'s `rating_prior` is parsed (R-64); an old answer without it parses as before; a broken one is ignored', () => {
    expect(parseArticles({ items: [], next: null, rating_prior: { mean: 4.8367, weight: 5 } }).rating_prior).toEqual({ mean: 4.8367, weight: 5 });
    expect(parseArticles({ items: [], next: null })).toEqual({ items: [], next: null });
    expect(parseArticles({ items: [], next: null, rating_prior: { mean: 'x', weight: 5 } }).rating_prior).toBeUndefined();
  });
  it('the C received is kept per language; OFFLINE = online for the same data and C', async () => {
    serveFixtures();
    const { db } = await freshDb();
    expect(await keptPrior(db, 'uk')).toBeNull();
    const online = await fetchQuery(db, 'uk', null, '', 'rating', null);
    expect(online.rating_prior?.weight).toBe(5);
    const kept = await keptPrior(db, 'uk');
    expect(kept).toEqual(online.rating_prior);
    // the whole rated list (all pages) from the server vs the phone's own order of the same items with the kept C
    const all = [...online.items]; let next = online.next;
    while (next) { const p = await fetchQuery(db, 'uk', null, '', 'rating', next); all.push(...p.items); next = p.next; }
    const shuffled = [...all].reverse();
    const ratedIds = (xs: typeof all) => xs.filter((a) => (a.rating?.count ?? 0) > 0).map((a) => a.id); // the unrated: full ties keep the list's own order
    expect(ratedIds(localQuery(shuffled, '', 'rating', kept))).toEqual(ratedIds(all));
    expect(ratedIds(all).length).toBeGreaterThan(3);
    vi.spyOn(dataSource(), 'articles').mockRejectedValue(new TypeError('offline'));
    expect(await keptPrior(db, 'uk'), 'offline: the last C received').toEqual(online.rating_prior);
  });
});
