import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { importedDb } from './helpers';
import { openWasmDb } from '@/data/db/wasmDb';
import { ensureSchema } from '@/data/db/schema';
import type { Article } from '@/data/api/types';
import { anchorAt, continueList, CONTINUE_DAYS, getPlace, getSaved, listPlaces, listSaved, noteOpened, pctOf, PLACES_KEPT, resumeOf, saveArticle,
  savedIds, savePlace, setFinished, unsaveArticle, yOfAnchor, dismissPlace, type Place } from '@/data/repo/reading';
import { getArticle, storeArticles } from '@/data/repo/articles';
import { KEPT_TABLES, resetData } from '@/data/repo/resetData';
import { listFavourites, toggleFavourite } from '@/data/repo/monasteries';
import { listVisited, toggleVisited } from '@/data/repo/visited';

const art = (id: number, kind = 'publication', extra: Partial<Article> = {}): Article => ({ id, kind, title: `T${id}`, subtitle: null, published_at: `2026-11-${String(10 + (id % 9)).padStart(2, '0')}T08:00:00Z`,
  site_url: `https://inok.info/articles/publications/${id}/`, body: `<p>a${id}</p><p>b</p>`, cover: { url: `https://inok.info/images/a${id}.webp`, w: 150, h: 100 }, ...extra } as Article);
const DAY = 86_400_000;

describe('A-141 the place (pure)', () => {
  const blocks: [number, number][] = [[100, 50], [150, 200], [350, 20]];
  it('anchorAt: the block under the reading line + the fraction; before the text = 0/0, after = the last end', () => {
    expect(anchorAt(blocks, 0)).toEqual({ anchor: 0, frac: 0 });
    expect(anchorAt(blocks, 125)).toEqual({ anchor: 0, frac: 0.5 });
    expect(anchorAt(blocks, 250)).toEqual({ anchor: 1, frac: 0.5 });
    expect(anchorAt(blocks, 999)).toEqual({ anchor: 2, frac: 1 });
    expect(anchorAt([], 50)).toEqual({ anchor: 0, frac: 0 });
  });
  it('P3: the anchor survives A−/A+ and a rotation - the same paragraph and fraction land at the new geometry, never the old pixels', () => {
    const p = anchorAt(blocks, 250); // paragraph 1, half way
    const bigger: [number, number][] = [[100, 80], [180, 320], [500, 30]]; // A+: every block taller
    expect(yOfAnchor(bigger, p)).toBe(180 + 160);
    expect(anchorAt(bigger, yOfAnchor(bigger, p))).toEqual(p);
    expect(yOfAnchor(bigger, { anchor: 9, frac: 0 })).toBe(500); // a shorter (changed) article: the last block
  });
  it('N % = the text above the screen\'s bottom edge, the text only', () => {
    expect(pctOf(100, 1000, 100)).toBe(0);
    expect(pctOf(100, 1000, 520)).toBe(42);
    expect(pctOf(100, 1000, 5000)).toBe(100);
    expect(pctOf(0, 0, 10)).toBe(0);
  });
  it('THE continue rule: started, unfinished, not dismissed, not a video, opened <= 30 days; the latest first', () => {
    const now = 100 * DAY;
    const p = (id: number, o: Partial<Place>): Place => ({ id, kind: 'publication', snap: { id } as Place['snap'], anchor: 0, frac: 0, pct: 10, started: true, finished: false, dismissed: false, opened_at: now - DAY, ...o });
    const list = continueList([p(1, {}), p(2, { opened_at: now }), p(3, { finished: true }), p(4, { started: false }), p(5, { dismissed: true }), p(6, { kind: 'video' }),
      p(7, { opened_at: now - CONTINUE_DAYS * DAY - 1 }), p(8, { opened_at: now - CONTINUE_DAYS * DAY })], now);
    expect(list.map((x) => x.id)).toEqual([2, 1, 8]);
    expect(resumeOf(p(1, {}))).toEqual({ anchor: 0, frac: 0 });
    expect(resumeOf(p(3, { finished: true }))).toBeNull();
    expect(resumeOf(p(4, { started: false }))).toBeNull();
    expect(resumeOf(p(6, { kind: 'video' }))).toBeNull();
  });
});

describe('A-141 storage', () => {
  it('a place: opened -> moved -> the marks only grow; a video keeps nothing; the last 50 stay', async () => {
    const { db } = await importedDb();
    await noteOpened(db, art(1), 1000);
    await savePlace(db, 1, { anchor: 3, frac: 0.25, pct: 42, started: true });
    await savePlace(db, 1, { anchor: 1, frac: 0, pct: 20 }); // scrolled back: the place follows, the «started» mark stays
    expect(await getPlace(db, 1)).toMatchObject({ anchor: 1, frac: 0, pct: 20, started: true, finished: false, snap: { id: 1, title: 'T1' } });
    await noteOpened(db, art(2, 'video'), 1001);
    expect(await getPlace(db, 2)).toBeNull();
    for (let i = 10; i < 10 + PLACES_KEPT + 5; i++) await noteOpened(db, art(i), 2000 + i);
    const all = await listPlaces(db);
    expect(all).toHaveLength(PLACES_KEPT);
    expect(all.some((x) => x.id === 1)).toBe(false); // the oldest left
  });
  it('✕ dismisses (the place kept); opening again brings it back; «прочитане / непрочитане»', async () => {
    const { db } = await importedDb();
    await noteOpened(db, art(1), 1000);
    await savePlace(db, 1, { anchor: 2, frac: 0.5, pct: 30, started: true });
    await dismissPlace(db, 1);
    expect(continueList(await listPlaces(db), 2000)).toHaveLength(0);
    expect(await getPlace(db, 1)).toMatchObject({ anchor: 2, dismissed: true });
    await noteOpened(db, art(1), 3000);
    expect(continueList(await listPlaces(db), 3000).map((x) => x.id)).toEqual([1]);
    await setFinished(db, art(1), true);
    expect(await getPlace(db, 1)).toMatchObject({ finished: true, pct: 100 });
    await setFinished(db, art(1), false);
    expect(await getPlace(db, 1)).toMatchObject({ finished: false, started: false, pct: 0, anchor: 0 });
    await setFinished(db, art(5), true); // never opened: marked read from a list
    expect(await getPlace(db, 5)).toMatchObject({ finished: true });
  });
  it('P2: a saved article is stored whole, opens offline after the feed forgot it and after reset_data; newest-saved first', async () => {
    const { db } = await importedDb();
    await storeArticles(db, 'uk', [art(1)], true);
    await saveArticle(db, art(1, 'publication', { body: '<p>whole text</p>' }), 'uk', 10);
    await saveArticle(db, art(2), 'uk', 20);
    expect(await savedIds(db)).toEqual([2, 1]);
    await storeArticles(db, 'uk', Array.from({ length: 31 }, (_, i) => art(100 + i, 'news', { published_at: '2026-11-30T00:00:00Z' })), true); // the cache rotates
    await resetData(db); // A-132
    expect((await getArticle(db, 1, 'uk'))?.body).toBe('<p>whole text</p>');
    expect((await getArticle(db, 1, 'ru'))?.id).toBe(1); // another interface language: the saved copy, not «not found»
    expect((await listSaved(db)).map((a) => a.id)).toEqual([2, 1]);
    await saveArticle(db, art(1, 'publication', { title: 'new' }), 'uk', 30); // saved again (a refresh): the saving time stays
    expect(await savedIds(db)).toEqual([2, 1]);
    expect((await getSaved(db, 1))?.title).toBe('new');
    await unsaveArticle(db, 2);
    expect(await savedIds(db)).toEqual([1]);
  });
  it('P1: an older install\'s database (no new tables) opens with the new code - «Обрані», «Я тут був», settings and ratings all kept', async () => {
    const db = await openWasmDb();
    await db.exec(`CREATE TABLE meta(key TEXT PRIMARY KEY, value TEXT); CREATE TABLE favourite(code INTEGER PRIMARY KEY, added_at INTEGER NOT NULL);
      CREATE TABLE visited(code INTEGER PRIMARY KEY, at INTEGER NOT NULL); CREATE TABLE settings(key TEXT PRIMARY KEY, value TEXT);
      CREATE TABLE article_rating(id INTEGER PRIMARY KEY, value INTEGER NOT NULL);
      INSERT INTO favourite VALUES (242, 1); INSERT INTO visited VALUES (37, 2); INSERT INTO settings VALUES ('lang', 'ru'); INSERT INTO article_rating VALUES (5, 4);`);
    await ensureSchema(db);
    await ensureSchema(db); // twice = the next start
    expect(await listFavourites(db)).toEqual([242]);
    expect(await listVisited(db)).toEqual([37]);
    expect((await db.query<{ value: string }>("SELECT value FROM settings WHERE key = 'lang'"))[0]?.value).toBe('ru');
    expect((await db.query<{ value: number }>('SELECT value FROM article_rating WHERE id = 5'))[0]?.value).toBe(4);
    await noteOpened(db, art(1), 1); await saveArticle(db, art(1), 'uk', 1); // the new tables exist and work
    await resetData(db);
    expect(await listFavourites(db)).toEqual([242]);
    expect(await savedIds(db)).toEqual([1]);
    expect((await listPlaces(db)).map((p) => p.id)).toEqual([1]);
    await toggleFavourite(db, 7); await toggleVisited(db, 8, 3);
  });
  it('KEPT_TABLES name the two new tables; ONE message for both stars (the card\'s keys, A-141 amendment)', () => {
    expect(KEPT_TABLES).toEqual(expect.arrayContaining(['saved_article', 'reading', 'favourite', 'visited']));
    const fav = readFileSync('src/components/FavMark.tsx', 'utf8');
    expect(fav).toMatch(/card\.favourite_added/);
    expect(fav).toMatch(/card\.favourite_removed/);
    expect(readFileSync('src/pages/MonasteryCard.tsx', 'utf8')).toMatch(/useFavToast\(\)/);
    expect(readFileSync('src/pages/MonasteryCard.tsx', 'utf8')).not.toMatch(/favourite_added/);
  });
});
