import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { afterEach, vi } from 'vitest';
import { CACHE_N, fetchArticle, getArticle, listArticles, myRating, parseArticles, rateArticle, storeArticles } from '@/data/repo/articles';
import type { Article } from '@/data/api/types';
import { freshDb } from './helpers';

const fx = JSON.parse(readFileSync(new URL('../../fixtures/articles.json', import.meta.url), 'utf8'));

/** Stage 4: the feed parse and the on-device cache (offline reading). */
describe('articles feed', () => {
  it('parses the contract page; drops items the app cannot show; next = null on the last page', () => {
    const p = parseArticles(fx);
    expect(p.items.length).toBe(fx.items.length);
    expect(p.next).toBeNull();
    const bad = parseArticles({ items: [{ id: 1, kind: 'poll', title: 'x', published_at: 'y' }, { kind: 'news' }, fx.items[0]], next: 'c2' });
    expect(bad.items.map((a) => a.id)).toEqual([fx.items[0].id]);
    expect(bad.next).toBe('c2');
    expect(parseArticles(null)).toEqual({ items: [], next: null });
  });
  it('cache: newest first, by kind, per language, offline read of one item; only the newest CACHE_N stay', async () => {
    const { db } = await freshDb();
    await storeArticles(db, 'uk', parseArticles(fx).items);
    const all = await listArticles(db, 'uk');
    expect(all.length).toBe(fx.items.length);
    expect(all.map((a) => a.published_at)).toEqual([...all.map((a) => a.published_at)].sort().reverse());
    const news = await listArticles(db, 'uk', 'news');
    expect(news.length).toBe(fx.items.filter((a: Article) => a.kind === 'news').length);
    expect(await listArticles(db, 'ru')).toEqual([]);
    expect((await getArticle(db, fx.items[0].id, 'uk'))!.body).toBe(fx.items[0].body);
    const many: Article[] = Array.from({ length: CACHE_N + 30 }, (_, i) => ({ ...fx.items[0], id: 100000 + i, published_at: `2026-01-01T00:${String(i % 60).padStart(2, '0')}:${String(Math.floor(i / 60)).padStart(2, '0')}Z` }));
    const gone = await storeArticles(db, 'uk', many);
    expect((await listArticles(db, 'uk', null, 1000)).length).toBe(CACHE_N);
    expect(CACHE_N).toBe(30); // A-19
    expect(gone.length).toBe(fx.items.length + many.length - CACHE_N); // evicted ids → their pictures are deleted on the device
    expect(gone).toContain(100000); // the oldest go, the newest (the fixture items, October) stay
    expect(gone).not.toContain(fx.items[0].id);
  });
  it('a cast rating is stored as the install own value and updates the cached item', async () => {
    const { db } = await freshDb();
    const a = parseArticles(fx).items[0];
    await storeArticles(db, 'uk', [a]);
    vi.stubGlobal('fetch', vi.fn(async () => new Response('{}', { status: 200, headers: { 'content-type': 'application/json' } }))); // the cast goes over the network (D73 seam)
    const ans = await rateArticle(db, a, 4, 'uk').finally(() => vi.unstubAllGlobals()); // fixtures source echoes the value
    expect(ans.mine).toBe(4);
    expect(await myRating(db, a.id)).toBe(4);
    expect((await getArticle(db, a.id, 'uk'))!.rating).toEqual(ans.rating);
  });
  it('D70: the NEWEST page removes a cached id inside its date window that the site stopped returning; older pages and other languages stay', async () => {
    const { db } = await freshDb();
    const items = parseArticles(fx).items;
    await storeArticles(db, 'uk', items, true);
    await storeArticles(db, 'ru', items, true);
    const hidden = items[1]; // the site deactivated it (or moved it to the future)
    const page = items.filter((a) => a !== hidden);
    const old: Article = { ...items[0], id: 999, published_at: '2001-01-01T00:00:00Z' }; // older than the page window: not judged by it
    await storeArticles(db, 'uk', [old]);
    const gone = await storeArticles(db, 'uk', page, true);
    expect((await listArticles(db, 'uk', null, 100)).map((a) => a.id)).not.toContain(hidden.id);
    expect((await listArticles(db, 'uk', null, 100)).map((a) => a.id)).toContain(999);
    expect(gone).toEqual([]); // the ru copy still holds it: its pictures stay
    expect((await listArticles(db, 'ru')).map((a) => a.id)).toContain(hidden.id);
    expect(await storeArticles(db, 'ru', page, true)).toEqual([hidden.id]); // the last copy gone -> its pictures go too
    expect(await storeArticles(db, 'ru', [], true)).toEqual([]); // an empty answer removes nothing
    expect((await listArticles(db, 'ru')).length).toBe(page.length);
  });
});

/** A-51 (R-35) + D69: an opened article asks the server for that ONE item. */
describe('one article from the server', () => {
  afterEach(() => vi.unstubAllGlobals());
  const serve = () => vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify(fx), { status: 200, headers: { 'content-type': 'application/json' } })));
  it('a changed item replaces the cached copy (the feed row shows the same); an equal one writes nothing', async () => {
    const { db } = await freshDb();
    const a = parseArticles(fx).items[0];
    await storeArticles(db, 'uk', [a]);
    const edited = { ...a, title: 'Виправлений заголовок' };
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ items: [edited], next: null }), { status: 200, headers: { 'content-type': 'application/json' } })));
    expect((await fetchArticle(db, a.id, 'uk'))?.title).toBe('Виправлений заголовок');
    expect((await getArticle(db, a.id, 'uk'))?.title).toBe('Виправлений заголовок');
    expect((await listArticles(db, 'uk'))[0].title).toBe('Виправлений заголовок');
  });
  it('D69: an id the cache lacks (a push tap on a warm app) is fetched and then opens; the site\'s 404 = null; offline throws (the cache stays)', async () => {
    const { db } = await freshDb();
    serve();
    const a = await fetchArticle(db, parseArticles(fx).items[3].id, 'uk');
    expect(a?.id).toBe(parseArticles(fx).items[3].id);
    expect((await getArticle(db, a!.id, 'uk'))?.title).toBe(a!.title); // remembered for this run, not added to the 30-item cache
    expect(await listArticles(db, 'uk')).toEqual([]);
    expect(await fetchArticle(db, 424242, 'uk')).toBeNull(); // fixtures: not in the feed = 404
    vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('Failed to fetch'); }));
    await expect(fetchArticle(db, a!.id, 'uk')).rejects.toThrow();
  });
});


/** A-55 (07.11.2026, A-54 withdrawn): NO lead line in any list row - the ONE row component neither reads the lead nor styles a lead line;
 *  the lead stays DATA (SQLite / the feed) for the article view (A-40). */
describe('no lead in list rows (A-55)', () => {
  const src = (f: string) => readFileSync(new URL(`../../src/${f}`, import.meta.url), 'utf8');
  it('ArticleRow draws no lead and the CSS has no lead line', () => {
    const row = src('components/ArticleRow.tsx');
    expect(row).not.toMatch(/\.lead\b|rowLead|arow__lead|alead-/);
    expect(src('theme/app.css')).not.toMatch(/arow__lead/);
  });
  it('the lead stays data: stored and read back with the item (the article view shows it)', async () => {
    const { db } = await freshDb();
    await storeArticles(db, 'uk', parseArticles(fx).items);
    const news = await listArticles(db, 'uk', 'news');
    expect(news.length).toBeGreaterThan(0);
    for (const a of news) expect(a.lead, `news ${a.id}`).toBe(fx.items.find((x: Article) => x.id === a.id).lead);
  });
});
