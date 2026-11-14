import { describe, expect, it } from 'vitest';
import { getFacets, listMonasteries } from '@/data/repo/monasteries';
import type { Filters } from '@/data/repo/types';
import { importedDb } from './helpers';

/** A-13: dependent filters as /monasteries/ — every facet is recounted under the OTHER filters; nothing impossible is offered. */
describe('dependent facets', () => {
  it('no filter: every value of the data with its count; the counts of a facet add up to the houses', async () => {
    const { db, fts } = await importedDb();
    const f = await getFacets(db);
    const total = (await listMonasteries(db, fts, { lang: 'uk' })).length;
    expect(f.types.reduce((a, x) => a + x.n, 0)).toBe(total);
    expect(f.object_types.map((x) => x.v).sort((a, b) => a - b)).toEqual([1, 2, 4, 5, 17]);
  });
  it('after a choice the OTHER lists shrink to what exists, each count = the list it would give; its own list stays whole', async () => {
    const { db, fts } = await importedDb();
    const all = await getFacets(db);
    const filters: Filters = { object_type: 5 }; // the lavras: male, stauropegial and eparchial
    const f = await getFacets(db, filters);
    expect(f.types.map((x) => x.v)).toEqual(['m']); // no female lavra → «жіночі» is not offered
    expect(f.object_types).toEqual(all.object_types); // its own facet ignores its selection (switchable)
    for (const e of f.eparchies) {
      const rows = await listMonasteries(db, fts, { lang: 'uk', filters: { ...filters, eparchy_id: e.id } });
      expect(rows.length).toBe(e.n);
      expect(e.n).toBeGreaterThan(0);
    }
    expect(f.eparchies.length).toBeLessThan(all.eparchies.length);
    // every offered combination is non-empty; a value not offered gives nothing
    const f2 = await getFacets(db, { type: 'f', subordination: 2 });
    for (const o of f2.object_types) expect((await listMonasteries(db, fts, { lang: 'uk', filters: { type: 'f', subordination: 2, object_type: o.v } })).length).toBe(o.n);
    for (const o of all.object_types.filter((x) => !f2.object_types.some((y) => y.v === x.v)))
      expect((await listMonasteries(db, fts, { lang: 'uk', filters: { type: 'f', subordination: 2, object_type: o.v } })).length).toBe(0);
  });
  it('«has stream» counts under the other filters', async () => {
    const { db, fts } = await importedDb();
    const f = await getFacets(db, { type: 'f' });
    expect(f.streams).toBe((await listMonasteries(db, fts, { lang: 'uk', filters: { type: 'f', has_stream: true } })).length);
    expect((await getFacets(db, { object_type: 5 })).streams).toBe(3); // the three lavras have channels
  });
});

/** D19: the sheet's apply button carries the live count — the SAME list query as the list (filterState.listQueryOf). */
describe('live count on «Показати N»', () => {
  it('countFor = the list the state gives (facets, near-me, search text) and agrees with the facet counts', async () => {
    const { db, fts } = await importedDb();
    const { countFor, listQueryOf, EMPTY_FILTERS } = await import('@/data/repo/filterState');
    const ctx = { q: '', lang: 'uk' as const, pos: { lat: 50.4501, lon: 30.5234 } };
    const lavras = { ...EMPTY_FILTERS, filters: { object_type: 5 } };
    expect(await countFor(db, fts, lavras, ctx)).toBe(3);
    expect((await getFacets(db, {})).object_types.find((o) => o.v === 5)!.n).toBe(3);
    const near = { ...EMPTY_FILTERS, nearMe: true, radiusKm: 25 };
    expect(await countFor(db, fts, near, ctx)).toBe((await listMonasteries(db, fts, listQueryOf(near, ctx))).length);
    expect(await countFor(db, fts, near, { ...ctx, pos: null })).toBe(await countFor(db, fts, EMPTY_FILTERS, ctx)); // no position → no radius
    const q = { ...ctx, q: 'церковщина' }; // the search text narrows the count exactly as it narrows the list
    expect(await countFor(db, fts, EMPTY_FILTERS, q)).toBe((await listMonasteries(db, fts, listQueryOf(EMPTY_FILTERS, q))).length);
    expect(await countFor(db, fts, EMPTY_FILTERS, q)).toBeLessThan(await countFor(db, fts, EMPTY_FILTERS, ctx));
  });
  it('the label in three languages with plural forms', async () => {
    const { makeT, tCount } = await import('@/i18n');
    const lbl = (lang: 'uk' | 'ru' | 'en', n: number) => tCount(makeT(lang), lang, 'monasteries.show', n);
    expect([1, 3, 18, 21].map((n) => lbl('uk', n))).toEqual(['Показати 1 обитель', 'Показати 3 обителі', 'Показати 18 обителей', 'Показати 21 обитель']);
    expect([1, 3, 18].map((n) => lbl('ru', n))).toEqual(['Показать 1 обитель', 'Показать 3 обители', 'Показать 18 обителей']);
    expect([1, 3].map((n) => lbl('en', n))).toEqual(['Show 1 monastery', 'Show 3 monasteries']);
  });
});

/** A-21(в): «×» clears ONE filter; the others stay and the facets recount from the new state. */
describe('clear one filter', () => {
  it('drops only that key; near-me drops the distance sort; the facets widen again', async () => {
    const { db } = await importedDb();
    const { clearOne, EMPTY_FILTERS } = await import('@/data/repo/filterState');
    const s = { ...EMPTY_FILTERS, filters: { object_type: 5, type: 'm' as const, has_stream: true }, nearMe: true, sort: 'distance' as const };
    expect(clearOne(s, 'object_type').filters).toEqual({ object_type: null, type: 'm', has_stream: true });
    expect(clearOne(s, 'has_stream').filters).toEqual({ object_type: 5, type: 'm', has_stream: false });
    const n = clearOne(s, 'near');
    expect([n.nearMe, n.sort, n.filters]).toEqual([false, 'name', s.filters]);
    const before = (await getFacets(db, { object_type: 5 })).types.map((x) => x.v);
    const after = (await getFacets(db, clearOne({ ...EMPTY_FILTERS, filters: { object_type: 5 } }, 'object_type').filters)).types.map((x) => x.v);
    expect(before).toEqual(['m']);
    expect(after.sort()).toEqual(['f', 'm']);
  });
});
