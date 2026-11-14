import { describe, expect, it } from 'vitest';
import { getEparchy, listEparchies } from '@/data/repo/eparchies';
import { fixtureDirectory, importedDb } from './helpers';

describe('PLAN 7 eparchies (R-15)', () => {
  it('lists the eparchies that have houses, counts from the DB, sorted by name', async () => {
    const { db } = await importedDb();
    const d = fixtureDirectory();
    const list = await listEparchies(db, 'uk');
    const withHouses = new Set(d.monasteries.map((m) => m.eparchy_id));
    expect(list.map((e) => e.id).sort()).toEqual([...withHouses].filter((x) => x != null).sort());
    for (const e of list) expect(e.monasteries).toBe(d.monasteries.filter((m) => m.eparchy_id === e.id).length);
    expect(list.map((e) => e.name_uk)).toEqual([...list.map((e) => e.name_uk)].sort(new Intl.Collator('uk').compare));
  });
  it('searches in any language; the page fields arrive', async () => {
    const { db } = await importedDb();
    expect((await listEparchies(db, 'uk', 'kyiv')).map((e) => e.id)).toContain(1);
    expect((await listEparchies(db, 'uk', 'киевск')).map((e) => e.id)).toContain(1);
    const e = await getEparchy(db, 1);
    expect(e?.residents).toBe(fixtureDirectory().eparchies.find((x) => x.id === 1)?.residents);
    expect(e?.image_url).toMatch(/dioceses\/medium\/1\.webp/);
    expect(JSON.parse(e!.credit_json!).uk).toMatch(/rightsholders/);
    expect(e?.about_uk).toMatch(/Київської єпархії/);
  });
  it('R-23: the own site as the export carries it (null when the site prints none)', async () => {
    const { db } = await importedDb();
    const d = fixtureDirectory();
    for (const x of d.eparchies) expect((await getEparchy(db, x.id))?.own_site_url ?? null).toBe(x.own_site?.url ?? null);
    expect((await getEparchy(db, 1))?.own_site_url).toMatch(/^https?:\/\//);
  });
});
