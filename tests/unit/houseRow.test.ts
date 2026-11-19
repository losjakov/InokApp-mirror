import { beforeAll, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { importedDb, fixtureDirectory } from './helpers';
import { getMonastery, listByCodes, listMonasteries, nearbyMonasteries } from '@/data/repo/monasteries';
import { withoutPostcode, field } from '@/data/repo/types';
import { parentName } from '@/components/ParentLine';
import type { Db } from '@/data/db/types';
import type { FtsMode } from '@/data/db/schema';

/** A-140 (cloud_42): whose house - the parent's own name rides with EVERY list query (one LEFT JOIN), the postal code leaves the lists. */
describe('A-140 the house row data', () => {
  let db: Db; let fts: FtsMode;
  beforeAll(async () => { ({ db, fts } = await importedDb()); });
  it('withoutPostcode: a 5-digit part dropped wherever it stands; nothing else changes', () => {
    expect(withoutPostcode('Дніпропетровське ш. 3, м. Київ, 03026')).toBe('Дніпропетровське ш. 3, м. Київ');
    expect(withoutPostcode('01015, м. Київ, вул. Лаврська, 15')).toBe('м. Київ, вул. Лаврська, 15');
    expect(withoutPostcode('вул. Лаврська, 15, корп. 42, м. Київ, 01015')).toBe('вул. Лаврська, 15, корп. 42, м. Київ');
    expect(withoutPostcode('с. Світязь, 1234, буд. 12345a')).toBe('с. Світязь, 1234, буд. 12345a'); // not a postal code
    expect(withoutPostcode('')).toBe('');
  });
  it('the lean list row (a page of «Монастирі»), the full rows (search, favourites, units), «near me» and the card carry parent_<lang>', async () => {
    const lean = await listByCodes(db, [110, 98], 'uk');
    const unit = lean.find((r) => r.code === 110)!;
    const parent = await getMonastery(db, 98);
    expect(unit.parent_code).toBe(98);
    expect(parentName(unit, 'uk')).toBe(field(parent!, 'name', 'uk'));
    expect(parentName(lean.find((r) => r.code === 98)!, 'uk')).toBe(''); // a parent is nobody's unit: no line
    const en = await listByCodes(db, [110], 'en');
    expect(parentName(en[0], 'en')).toBe(field(parent!, 'name', 'en')); // the parent's OWN name in the app language
    const full = await listMonasteries(db, fts, { q: '', filters: {}, sort: 'name', lang: 'uk' });
    expect(parentName(full.find((r) => r.code === 110)!, 'uk')).toBe(field(parent!, 'name', 'uk'));
    expect(parentName((await getMonastery(db, 110))!, 'ru')).toBe(field(parent!, 'name', 'ru'));
    const near = await nearbyMonasteries(db, { lat: 50.43, lon: 30.55 }, 300, 20);
    for (const r of near) expect(parentName(r, 'uk') !== '', `near ${r.code}`).toBe(r.parent_code != null);
  });
  it('InokSite 380: the name comes from the export as it is - the app strips no word (the 2026-11-19 shape imports; old readers see the same field)', async () => {
    const d = fixtureDirectory();
    for (const m of d.monasteries) if (m.parent_code) for (const l of ['uk', 'ru', 'en'] as const) {
      const n = (m.name as Record<string, string | null>)[l];
      if (n) (m.name as Record<string, string | null>)[l] = n.replace(/\s*(ставропігійн|ставропигиальн|stauropegial)\S*/i, '');
    }
    const { db: db2 } = await importedDb(d);
    const r = (await listByCodes(db2, [110], 'uk'))[0];
    expect(field(r, 'name', 'uk')).toBe((d.monasteries.find((m) => m.code === 110)!.name as Record<string, string>).uk);
    expect(field(r, 'name', 'uk')).not.toMatch(/ставропігійн/);
  });
  it('no list shows the type chip any more (A-140: «чол. / жін.» removed from EVERY list); the units list of a parent has no «↳»', () => {
    const row = readFileSync('src/components/MonasteryRow.tsx', 'utf8');
    expect(row).not.toMatch(/type\.\$\{|mrow__type/);
    expect(readFileSync('src/pages/MonasteryCard.tsx', 'utf8')).toMatch(/<HouseRow [^>]*noParent/);
    for (const l of ['uk', 'ru', 'en']) expect(Object.keys(JSON.parse(readFileSync(`src/i18n/${l}.json`, 'utf8')))).not.toContain('type.m');
  });
});
