import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cachedNewestByKind, fetchNewestByKind, getArticle, parseArticles, storeArticles } from '@/data/repo/articles';
import { freshDb, serveFixtures } from './helpers';

const file = (name: string) => readFileSync(new URL(`../../fixtures/${name}`, import.meta.url), 'utf8');
afterEach(() => vi.unstubAllGlobals());

/** A-25 #3: «Нове на сайті» = the newest publication, video, news — one each, in that order; offline from the cache. */
describe('newest by kind', () => {
  it('one of each kind, publication → video → news, the newest of its section', async () => {
    serveFixtures();
    const { db } = await freshDb();
    const got = await fetchNewestByKind(db, 'uk');
    expect(got.map((a) => a.kind)).toEqual(['publication', 'video', 'news']);
    const feed = parseArticles(JSON.parse(file('articles.json'))).items;
    const newest = (k: string) => feed.filter((a) => a.kind === k).sort((a, b) => b.published_at.localeCompare(a.published_at))[0].id;
    expect(got[0].id).toBe(newest('publication'));
    expect(got[2].id).toBe(newest('news'));
    expect(got[1].id).toBe(JSON.parse(file('articles_video.json')).items[0].id);
  });
  it('offline: the last answer; the video opens though the 30-item feed cache has none', async () => {
    serveFixtures();
    const { db } = await freshDb();
    const online = await fetchNewestByKind(db, 'uk');
    vi.stubGlobal('fetch', async () => { throw new Error('offline'); });
    expect((await fetchNewestByKind(db, 'uk')).map((a) => a.id)).toEqual(online.map((a) => a.id));
    expect((await getArticle(db, online[1].id, 'uk'))?.kind).toBe('video');
  });
  it('never fetched: the feed cache of each kind (a kind it lacks is skipped)', async () => {
    const { db } = await freshDb();
    await storeArticles(db, 'uk', parseArticles(JSON.parse(file('articles.json'))).items);
    expect((await cachedNewestByKind(db, 'uk')).map((a) => a.kind)).toEqual(['publication', 'news']);
  });
});
