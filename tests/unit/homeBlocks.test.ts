import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { BLOCK_FETCH, blockRows, cachedBlock, fetchBlock, getArticle, parseArticles, shownIds, storeArticles } from '@/data/repo/articles';
import { dataSource } from '@/data/source';
import { articleOrder } from '@/data/repo/articleOrder';
import { freshDb, serveFixtures } from './helpers';

const file = (name: string) => readFileSync(new URL(`../../fixtures/${name}`, import.meta.url), 'utf8');
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });
const ids = (a: { id: number }[]) => a.map((x) => x.id);
const kinds = (a: { kind: string }[]) => a.map((x) => x.kind);

const art = (id: number, kind: string, created: string, week = 0) => ({ id, kind, created_at: created, published_at: created, views_week: week }) as never;

/** A-128 / A-176: the home's two blocks - 3 rows from ONE queue of «Статті» + «Відео» + the first «Новина»; «Популярне» never repeats «Нове». */
describe('home blocks (A-128, A-176)', () => {
  it('«Нове на сайті»: each kind asked as its section list, limit 7, sort=created', async () => {
    serveFixtures();
    const { db } = await freshDb();
    const asked = vi.spyOn(dataSource(), 'articles');
    const pool = await fetchBlock(db, 'uk', 'created');
    expect(BLOCK_FETCH).toBe(7);
    expect(asked.mock.calls.map((c) => c[2])).toEqual(['publication', 'video', 'news'].map((kind) => ({ kind, sort: 'created', limit: 7 })));
    const rows = blockRows(pool, 'created');
    expect(rows).toHaveLength(4);
    expect(kinds(rows).slice(0, 3).every((k) => k === 'publication' || k === 'video')).toBe(true);
    expect(kinds(rows)[3]).toBe('news');
  });
  it('ONE queue, no quota per kind: the 3 newest are 2 video + 1 publication -> that order', () => {
    const pool = [art(1, 'publication', '2026-11-20T10:00:00Z'), art(2, 'publication', '2026-11-23T10:00:00Z'), art(3, 'video', '2026-11-24T05:00:00Z'),
      art(4, 'video', '2026-11-22T10:00:00Z'), art(5, 'video', '2026-11-24T06:00:00Z'), art(9, 'news', '2026-11-24T07:00:00Z')];
    expect(ids(blockRows(pool, 'created'))).toEqual([5, 3, 2, 9]);
  });
  it('«Популярне» skips what «Нове» shows: its top 2 shown in «Нове» -> ranks 3-5; its news row skips «Нове»\'s news', () => {
    const pool = [art(10, 'publication', '2026-11-01T00:00:00Z', 50), art(11, 'publication', '2026-11-01T00:00:00Z', 40), art(12, 'video', '2026-11-01T00:00:00Z', 30),
      art(13, 'publication', '2026-11-01T00:00:00Z', 20), art(14, 'video', '2026-11-01T00:00:00Z', 10), art(20, 'news', '2026-11-01T00:00:00Z', 9), art(21, 'news', '2026-11-01T00:00:00Z', 5)];
    expect(ids(blockRows(pool, 'views_week'))).toEqual([10, 11, 12, 20]);
    expect(ids(blockRows(pool, 'views_week', new Set([10, 11, 99, 20])))).toEqual([12, 13, 14, 21]);
    // fewer left = fewer rows, never a repeat
    expect(ids(blockRows(pool, 'views_week', new Set([10, 11, 12, 13, 20, 21])))).toEqual([14]);
  });
  it('the order code is the screen\'s own comparator (one source, no second comparator in the repo)', () => {
    const src = readFileSync('src/data/repo/articles.ts', 'utf8');
    expect(src).toMatch(/sortArticles\(pool\.filter/);
    expect(src).not.toMatch(/\.sort\(\(a, b\) =>/);
    expect(articleOrder('created')).not.toBeNull();
  });
  it('the live fixture: «Популярне» shares no id with «Нове»', async () => {
    serveFixtures();
    const { db } = await freshDb();
    const n = blockRows(await fetchBlock(db, 'uk', 'created'), 'created');
    const p = blockRows(await fetchBlock(db, 'uk', 'views_week'), 'views_week', shownIds(n));
    expect(p.length).toBeGreaterThan(0);
    expect(ids(p).filter((id) => ids(n).includes(id))).toEqual([]);
  });
  it('offline: the kept candidates of both blocks, the same rule -> no repeats; its articles open', async () => {
    serveFixtures();
    const { db } = await freshDb();
    const newOnline = blockRows(await fetchBlock(db, 'uk', 'created'), 'created');
    const popOnline = blockRows(await fetchBlock(db, 'uk', 'views_week'), 'views_week', shownIds(newOnline));
    vi.stubGlobal('fetch', async () => { throw new TypeError('offline'); });
    await expect(fetchBlock(db, 'uk', 'views_week')).rejects.toThrow();
    const newOff = blockRows((await cachedBlock(db, 'uk', 'created'))!, 'created');
    const popOff = blockRows((await cachedBlock(db, 'uk', 'views_week'))!, 'views_week', shownIds(newOff));
    expect(ids(newOff)).toEqual(ids(newOnline));
    expect(ids(popOff)).toEqual(ids(popOnline));
    expect(ids(popOff).filter((id) => ids(newOff).includes(id))).toEqual([]);
    expect((await getArticle(db, popOff[0].id, 'uk'))?.id).toBe(popOff[0].id);
  });
  it('offline, nothing kept: «Популярне» = null (the caller shows the «no connection» line); «Нове» = the saved feed by date of placing', async () => {
    const { db } = await freshDb();
    expect(await cachedBlock(db, 'uk', 'views_week')).toBeNull();
    expect(await cachedBlock(db, 'uk', 'created')).toBeNull();
    await storeArticles(db, 'uk', parseArticles(JSON.parse(file('articles.json'))).items);
    expect(await cachedBlock(db, 'uk', 'views_week')).toBeNull();
    expect(blockRows((await cachedBlock(db, 'uk', 'created'))!, 'created').length).toBeGreaterThan(0);
  });
  it('one kind failed: its kept candidates stay, the others are new', async () => {
    serveFixtures();
    const { db } = await freshDb();
    const before = blockRows(await fetchBlock(db, 'uk', 'created'), 'created');
    const real = dataSource().articles;
    vi.spyOn(dataSource(), 'articles').mockImplementation((l, s, f, sig) => (f?.kind === 'video' ? Promise.reject(new TypeError('x')) : real(l, s, f, sig)));
    expect(ids(blockRows(await fetchBlock(db, 'uk', 'created'), 'created'))).toEqual(ids(before));
  });
});
