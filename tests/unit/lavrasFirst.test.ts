import { describe, expect, it } from 'vitest';
import { bySiteSort, getMonasteriesInOrder, getUnits, getMonastery, lavrasFirst, listKeys, listMonasteries, nearbyMonasteries } from '@/data/repo/monasteries';
import { field } from '@/data/repo/types';
import { fixtureDirectory, importedDb } from './helpers';

const LAVRAS = [242, 111, 98]; // R-31: Kyiv 10, Pochaiv 20, Sviatohirsk 30
const d = fixtureDirectory();

describe('A-44: the three lavras first in every name-sorted list of houses (R-31 `sort`)', () => {
  it('the fixture is the live export with `sort` (D29)', () => {
    expect(Object.fromEntries(d.monasteries.filter((m) => m.sort !== 500).map((m) => [m.code, m.sort]))).toEqual({ 242: 10, 111: 20, 98: 30 });
  });
  it('«Монастирі» (rows and keys - ONE order) in every language: lavras, then the name as before', async () => {
    const { db, fts } = await importedDb();
    for (const lang of ['uk', 'ru', 'en'] as const) {
      const rows = await listMonasteries(db, fts, { lang });
      const keys = await listKeys(db, fts, { lang });
      expect(keys.map((k) => k.code)).toEqual(rows.map((r) => r.code));
      expect(rows.slice(0, 3).map((r) => r.code)).toEqual(LAVRAS);
      const col = new Intl.Collator(lang, { sensitivity: 'base', numeric: true });
      const rest = rows.slice(3).map((r) => field(r, 'name', lang));
      expect([...rest].sort(col.compare)).toEqual(rest);
    }
  });
  it('an eparchy\'s houses (the Kyiv eparchy holds the Kyiv lavra) and a filter: the lavra on top', async () => {
    const { db, fts } = await importedDb();
    const kyiv = d.monasteries.find((m) => m.code === 242)!.eparchy_id!;
    const rows = await listMonasteries(db, fts, { lang: 'uk', filters: { eparchy_id: kyiv } });
    expect(rows.length).toBeGreaterThan(1);
    expect(rows[0].code).toBe(242);
    const lavrasOnly = await listMonasteries(db, fts, { lang: 'uk', filters: { object_type: 5 } });
    expect(lavrasOnly.map((r) => r.code)).toEqual(LAVRAS);
  });
  it('favourites: the lavras first, the rest keep their own order (newest first)', async () => {
    const { db } = await importedDb();
    const codes = [37, 98, 159, 242, 267]; // newest first
    expect((await getMonasteriesInOrder(db, codes)).map((r) => r.code)).toEqual([242, 98, 37, 159, 267]);
  });
  it('canonical units keep the site order (no lavra among them: unchanged)', async () => {
    const { db } = await importedDb();
    const parent = d.monasteries.find((m) => (m.units?.uk ?? []).length > 0)!;
    const row = (await getMonastery(db, parent.code))!;
    expect((await getUnits(db, row, 'uk')).map((r) => r.code)).toEqual(parent.units!.uk!.filter((c) => d.monasteries.some((m) => m.code === c)));
  });
  it('distance and search relevance keep their own order', async () => {
    const { db, fts } = await importedDb();
    const at = { lat: 50.3, lon: 30.4 }; // near Kyiv, not at the lavra
    const near = await listMonasteries(db, fts, { lang: 'uk', sort: 'distance', at });
    const km = near.map((r) => r.distance_km ?? 1e9);
    expect([...km].sort((a, b) => a - b)).toEqual(km);
    const home = await nearbyMonasteries(db, at, 500, 5);
    expect(home.map((r) => r.distance_km!)).toEqual([...home.map((r) => r.distance_km!)].sort((a, b) => a - b));
    // a search lists by relevance: «Почаївська» finds the Pochaiv lavra first though Kyiv sorts before it
    const hits = await listMonasteries(db, fts, { lang: 'uk', q: 'Почаїв' });
    expect(hits[0]?.code).toBe(111);
  });
  it('the comparator: null = 500 (an export before R-31), stable', () => {
    expect(bySiteSort({ sort: null }, { sort: 500 })).toBe(0);
    expect(lavrasFirst([{ c: 1, sort: 500 }, { c: 2 }, { c: 3, sort: 10 }]).map((x) => x.c)).toEqual([3, 1, 2]);
  });
});
