import { describe, expect, it } from 'vitest';
import { fixtureDirectory, importedDb } from './helpers';
import { importDirectory } from '@/data/db/import';
import { listVisited, toggleVisited, visitedCount } from '@/data/repo/visited';
import { listFavourites, toggleFavourite } from '@/data/repo/monasteries';
import { KEPT_TABLES, resetData } from '@/data/repo/resetData';
import { getMeta } from '@/data/db/schema';

// cloud_41 (A-133 «Я тут був» storage; A-132 reset_data): local only, kept through a re-import, a reset, a house gone from the directory
describe('visited (A-133)', () => {
  it('mark -> unmark -> mark: one row, the state after each tap', async () => {
    const { db } = await importedDb();
    const code = fixtureDirectory().monasteries[0].code;
    expect(await toggleVisited(db, code, 1)).toBe(true);
    expect(await toggleVisited(db, code, 2)).toBe(false);
    expect(await toggleVisited(db, code, 3)).toBe(true);
    expect(await listVisited(db)).toEqual([code]);
  });
  it('the counter: n of m (m = the directory)', async () => {
    const { db } = await importedDb();
    const d = fixtureDirectory();
    await toggleVisited(db, d.monasteries[0].code); await toggleVisited(db, d.monasteries[1].code);
    expect(await visitedCount(db)).toEqual({ n: 2, m: d.monasteries.length });
  });
  it('kept through a re-import (a data refresh)', async () => {
    const { db, fts } = await importedDb();
    const d = fixtureDirectory();
    await toggleVisited(db, d.monasteries[2].code);
    await importDirectory(db, { ...d, export_version: 'next' }, fts);
    expect(await listVisited(db)).toEqual([d.monasteries[2].code]);
  });
  it('a house gone from the directory: the mark KEPT, the counter does not break (not counted)', async () => {
    const { db, fts } = await importedDb();
    const d = fixtureDirectory();
    const gone = d.monasteries[3].code;
    await toggleVisited(db, gone); await toggleVisited(db, d.monasteries[4].code);
    await importDirectory(db, { ...d, export_version: 'next', monasteries: d.monasteries.filter((m) => m.code !== gone) }, fts);
    expect((await listVisited(db)).sort()).toEqual([gone, d.monasteries[4].code].sort());
    expect(await visitedCount(db)).toEqual({ n: 1, m: d.monasteries.length - 1 });
  });
});

describe('reset_data (A-132): the downloaded data goes, the person\'s own things stay', () => {
  it('directory + caches + the download state cleared; «Обрані», «Я тут був», settings kept', async () => {
    const { db } = await importedDb();
    const code = fixtureDirectory().monasteries[0].code;
    await toggleFavourite(db, code); await toggleVisited(db, code);
    await db.run("INSERT INTO cache(key, json, fetched_at) VALUES ('config', '{}', 1)");
    await db.run("INSERT INTO settings(key, value) VALUES ('x', 'y')");
    await db.run("INSERT INTO meta(key, value) VALUES ('install_id', 'kept')");
    expect(await getMeta(db, 'export_version')).not.toBeNull();
    await resetData(db);
    expect((await db.query<{ n: number }>('SELECT COUNT(*) AS n FROM monastery'))[0].n).toBe(0);
    expect((await db.query<{ n: number }>('SELECT COUNT(*) AS n FROM cache'))[0].n).toBe(0);
    expect(await getMeta(db, 'export_version')).toBeNull();
    expect(await listFavourites(db)).toEqual([code]);
    expect(await listVisited(db)).toEqual([code]);
    expect((await db.query<{ value: string }>("SELECT value FROM settings WHERE key = 'x'"))[0].value).toBe('y');
    expect(await getMeta(db, 'install_id')).toBe('kept');
    expect(KEPT_TABLES).toEqual(expect.arrayContaining(['favourite', 'visited', 'settings']));
  });
});

describe('the list filter «Усі / Відвідані / Ще не відвідані» (A-133) - with the other filters', () => {
  it('yes / no / all and the sheet\'s counts under the other filters', async () => {
    const { listMonasteries, getFacets } = await import('@/data/repo/monasteries');
    const { db, fts } = await importedDb();
    const d = fixtureDirectory();
    const a = d.monasteries[0], b = d.monasteries[1];
    await toggleVisited(db, a.code); await toggleVisited(db, b.code);
    const codes = async (visited: 'yes' | 'no' | null, extra = {}) => (await listMonasteries(db, fts, { lang: 'uk', filters: { visited, ...extra } })).map((r) => r.code).sort();
    expect(await codes('yes')).toEqual([a.code, b.code].sort());
    expect((await codes('no')).length).toBe(d.monasteries.length - 2);
    expect((await codes(null)).length).toBe(d.monasteries.length);
    expect((await getFacets(db, {})).visited).toEqual({ yes: 2, no: d.monasteries.length - 2 });
    // with another filter: the eparchy of «a» only
    const inA = d.monasteries.filter((m) => m.eparchy_id === a.eparchy_id);
    expect(await codes('yes', { eparchy_id: a.eparchy_id })).toEqual([a, b].filter((m) => m.eparchy_id === a.eparchy_id).map((m) => m.code).sort());
    expect((await getFacets(db, { eparchy_id: a.eparchy_id })).visited.yes + (await getFacets(db, { eparchy_id: a.eparchy_id })).visited.no).toBe(inA.length);
  });
});
