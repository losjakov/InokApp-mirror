import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { BLOCK_SLOTS, blockRows, cachedBlock, fetchBlock, getArticle, parseArticles, storeArticles } from '@/data/repo/articles';
import { dataSource } from '@/data/source';
import { articleOrder } from '@/data/repo/articleOrder';
import { freshDb, serveFixtures } from './helpers';

const file = (name: string) => readFileSync(new URL(`../../fixtures/${name}`, import.meta.url), 'utf8');
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });
const ids = (a: { id: number }[]) => a.map((x) => x.id);
const kinds = (a: { kind: string }[]) => a.map((x) => x.kind);

/** A-128: the home's two blocks - 2 «Статті», 1 «Відео», 1 «Новина», each kind by the block's order (the «Публікації» screen's sort code). */
describe('home blocks (A-128)', () => {
  it('the slots: publication x2, video, news - in that order', () => {
    expect(BLOCK_SLOTS).toEqual([{ kind: 'publication', n: 2 }, { kind: 'video', n: 1 }, { kind: 'news', n: 1 }]);
  });
  it('«Нове на сайті» = by the date of placing (sort=created): each kind asked as its section list with ITS limit', async () => {
    serveFixtures();
    const { db } = await freshDb();
    const asked = vi.spyOn(dataSource(), 'articles');
    const got = await fetchBlock(db, 'uk', 'created');
    expect(asked.mock.calls.map((c) => c[2])).toEqual([{ kind: 'publication', sort: 'created', limit: 2 }, { kind: 'video', sort: 'created', limit: 1 }, { kind: 'news', sort: 'created', limit: 1 }]);
    expect(kinds(got)).toEqual(['publication', 'publication', 'video', 'news']);
    expect(ids(got)).toEqual([2869, 2868, 1892, 2871]);
  });
  it('«Популярне за тиждень» = the same four places by views of the week (sort=views_week)', async () => {
    serveFixtures();
    const { db } = await freshDb();
    expect(ids(await fetchBlock(db, 'uk', 'views_week'))).toEqual([2869, 2738, 1892, 2871]);
  });
  it('a kind with nothing = its row is absent (never an empty row)', () => {
    const a = (id: number, kind: string) => ({ id, kind }) as never;
    expect(ids(blockRows({ publication: [a(1, 'publication')], video: [], news: [a(3, 'news'), a(4, 'news')] }))).toEqual([1, 3]);
  });
  it('the order code is the screen\'s own comparator (one source): the live answer order is kept as given', async () => {
    expect(articleOrder('created')).not.toBeNull();
    expect(readFileSync('src/data/repo/articles.ts', 'utf8')).not.toMatch(/newest_by_kind|fetchNewestByKind/);
  });
  it('offline: the last list received (both blocks); its articles open', async () => {
    serveFixtures();
    const { db } = await freshDb();
    const pop = await fetchBlock(db, 'uk', 'views_week');
    vi.stubGlobal('fetch', async () => { throw new TypeError('offline'); });
    await expect(fetchBlock(db, 'uk', 'views_week')).rejects.toThrow();
    expect(ids((await cachedBlock(db, 'uk', 'views_week'))!)).toEqual(ids(pop));
    expect((await getArticle(db, 1892, 'uk'))?.kind).toBe('video');
  });
  it('offline, nothing kept: «Популярне» = null (the caller shows the «no connection» line); «Нове» = the saved feed by date of placing', async () => {
    const { db } = await freshDb();
    expect(await cachedBlock(db, 'uk', 'views_week')).toBeNull();
    expect(await cachedBlock(db, 'uk', 'created')).toBeNull();
    await storeArticles(db, 'uk', parseArticles(JSON.parse(file('articles.json'))).items);
    expect(await cachedBlock(db, 'uk', 'views_week')).toBeNull();
    expect(kinds((await cachedBlock(db, 'uk', 'created'))!)).toEqual(['publication', 'publication', 'news']);
  });
  it('one kind failed: its kept rows stay, the others are new', async () => {
    serveFixtures();
    const { db } = await freshDb();
    await fetchBlock(db, 'uk', 'created');
    const real = dataSource().articles;
    vi.spyOn(dataSource(), 'articles').mockImplementation((l, s, f, sig) => (f?.kind === 'video' ? Promise.reject(new TypeError('x')) : real(l, s, f, sig)));
    expect(ids(await fetchBlock(db, 'uk', 'created'))).toEqual([2869, 2868, 1892, 2871]);
  });
});
