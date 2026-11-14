import { describe, expect, it } from 'vitest';
import { searchMonasteries } from '@/data/search/query';
import { listMonasteries, getFacets } from '@/data/repo/monasteries';
import { field } from '@/data/repo/types';
import { fixtureDirectory, importedDb } from './helpers';
import { normalize } from '@/data/search/normalize';

const d = fixtureDirectory();
const first = d.monasteries[0];
const firstName = first.name.uk!;
const words = normalize(firstName).split(' ').filter((w) => w.length >= 5);
const word = words[0];

describe('search (FTS5 trigram + JS ranking)', () => {
  it('finds by an exact word of the uk name', async () => {
    const { db, fts } = await importedDb();
    const hits = await searchMonasteries(db, fts, word);
    expect(hits.map((h) => h.code)).toContain(first.code);
  });
  it('finds by the ru name typed in Russian letters (і/и, є/е folding)', async () => {
    const { db, fts } = await importedDb();
    const ru = d.monasteries.find((m) => m.name.ru)!;
    const ruWord = normalize(ru.name.ru!).split(' ').find((w) => w.length >= 5)!;
    const hits = await searchMonasteries(db, fts, ruWord);
    expect(hits.map((h) => h.code)).toContain(ru.code);
  });
  it('tolerates one typo in a long word (dropped letter, swapped letter)', async () => {
    const { db, fts } = await importedDb();
    // «Церковщина» (code 37) typed as «церковшина» and «церкощина»; «Світязський» (159) as «свитяский»
    expect((await searchMonasteries(db, fts, 'церковшина')).map((h) => h.code)).toContain(37);
    expect((await searchMonasteries(db, fts, 'церкощина')).map((h) => h.code)).toContain(37);
    expect((await searchMonasteries(db, fts, 'свитяский')).map((h) => h.code)).toContain(159);
    // «Петро-Павлівський» typed without the dash and in Russian letters
    expect((await searchMonasteries(db, fts, 'петропавловский')).map((h) => h.code)).toContain(159);
  });
  it('ranks a name match above a town/eparchy match', async () => {
    const { db, fts } = await importedDb();
    const hits = await searchMonasteries(db, fts, 'миколаївський');
    expect(hits[0]?.code).toBe(295);
  });
  it('finds by town and by eparchy name', async () => {
    const { db, fts } = await importedDb();
    const withTown = d.monasteries.find((m) => m.town?.uk)!;
    expect((await searchMonasteries(db, fts, withTown.town!.uk!)).map((h) => h.code)).toContain(withTown.code);
    const withEp = d.monasteries.find((m) => m.eparchy_id != null)!;
    const ep = d.eparchies.find((e) => e.id === withEp.eparchy_id)!;
    expect((await searchMonasteries(db, fts, ep.name.uk!)).map((h) => h.code)).toContain(withEp.code);
  });
  it('words found as typed show only those rows — no typo-tolerant extras (cloud_06: «лавр» brought «ставропігійний»)', async () => {
    const { db, fts } = await importedDb();
    const codes = (await searchMonasteries(db, fts, 'лавр')).map((h) => h.code);
    const all = await db.query<{ code: number; norm_all: string }>('SELECT code, norm_all FROM monastery');
    const want = all.filter((r) => r.norm_all.includes('лавр')).map((r) => r.code);
    expect(codes.sort((a, b) => a - b)).toEqual(want.sort((a, b) => a - b));
    expect(codes).toEqual(expect.arrayContaining([98, 111, 242]));
    expect(want.length).toBeLessThan(all.length / 2); // the trigram «авр» of «ставропігійний» no longer drags half the list in
  });
  it('the address is searched (A-23 #4)', async () => {
    const { db, fts } = await importedDb();
    expect((await searchMonasteries(db, fts, 'Лаврська')).map((h) => h.code)).toContain(242);
  });
  it('1–2 character queries work through LIKE', async () => {
    const { db, fts } = await importedDb();
    const two = normalize(firstName).slice(0, 2);
    expect((await searchMonasteries(db, fts, two)).length).toBeGreaterThan(0);
  });
  it('an unrelated word returns nothing', async () => {
    const { db, fts } = await importedDb();
    expect(await searchMonasteries(db, fts, 'qzxwvjk')).toEqual([]);
  });
  it('LIKE fallback mode (fts = none) still finds exact substrings', async () => {
    const { db } = await importedDb();
    expect((await searchMonasteries(db, 'none', word)).map((h) => h.code)).toContain(first.code);
  });
});

describe('list: filters, sort, near me', () => {
  it('sorts by the site SORT, then by name with a locale collator (A-44), and filters by type / eparchy / has_stream', async () => {
    const { db, fts } = await importedDb();
    const all = await listMonasteries(db, fts, { lang: 'uk' });
    expect(all.length).toBe(d.monasteries.length);
    expect(all.slice(0, 3).map((r) => r.code), 'the three lavras first: Kyiv 10, Pochaiv 20, Sviatohirsk 30').toEqual([242, 111, 98]);
    const names = all.slice(3).map((r) => field(r, 'name', 'uk'));
    const col = new Intl.Collator('uk', { sensitivity: 'base', numeric: true });
    expect([...names].sort(col.compare)).toEqual(names);
    const facets = await getFacets(db);
    const m = await listMonasteries(db, fts, { lang: 'uk', filters: { type: 'm' } });
    expect(m.every((r) => r.type === 'm')).toBe(true);
    const ep = facets.eparchies[0].id;
    const byEp = await listMonasteries(db, fts, { lang: 'uk', filters: { eparchy_id: ep } });
    expect(byEp.length).toBe(d.monasteries.filter((x) => x.eparchy_id === ep).length);
    const streams = await listMonasteries(db, fts, { lang: 'uk', filters: { has_stream: true } });
    expect(streams.every((r) => r.has_stream === 1)).toBe(true);
  });
  it('near me: radius filter and distance sort', async () => {
    const { db, fts } = await importedDb();
    const here = d.monasteries.find((m) => m.lat != null)!;
    const near = await listMonasteries(db, fts, {
      lang: 'uk', sort: 'distance', filters: { near: { lat: here.lat!, lon: here.lon!, radius_km: 1 } },
    });
    expect(near[0].code).toBe(here.code);
    expect(near[0].distance_km).toBeLessThan(0.01);
    const sorted = await listMonasteries(db, fts, { lang: 'uk', sort: 'distance', at: { lat: here.lat!, lon: here.lon! } });
    const dists = sorted.map((r) => r.distance_km ?? 1e9);
    expect([...dists].sort((a, b) => a - b)).toEqual(dists);
  });
  it('search + filter combine', async () => {
    const { db, fts } = await importedDb();
    const rows = await listMonasteries(db, fts, { lang: 'uk', q: word, filters: { type: first.type as 'm' | 'f' } });
    expect(rows.map((r) => r.code)).toContain(first.code);
  });
});
