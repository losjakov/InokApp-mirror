import { describe, expect, it } from 'vitest';
import { getMonastery, listMonasteries } from '@/data/repo/monasteries';
import { rowSubtitle } from '@/data/repo/types';
import { importedDb } from './helpers';

/** REVIEW cloud_02 D5: the list row's second line is «town · eparchy» as the site's list prints it. */
describe('list row subtitle', () => {
  it('the repo carries the eparchy name with every row (list and single)', async () => {
    const { db, fts } = await importedDb();
    const rows = await listMonasteries(db, fts, { lang: 'uk' });
    const r37 = rows.find((r) => r.code === 37)!;
    expect(r37.eparchy_uk).toBe('Київська');
    expect(r37.oblast_uk).toBeTruthy();
    expect((await getMonastery(db, 37))!.eparchy_en).toBe('Kyiv');
    expect(rows.every((r) => r.eparchy_id == null || r.eparchy_uk)).toBe(true);
  });
  it('formats «town · oblast · eparchy» from the dictionary labels, per language (owner 31.10: oblast before eparchy)', async () => {
    const { db, fts } = await importedDb();
    const r = (await listMonasteries(db, fts, { lang: 'uk' })).find((x) => x.code === 37)!;
    expect(rowSubtitle(r, 'uk', { facet_eparchy: 'Єпархія', facet_oblast: 'Область' })).toBe(`Київ · ${r.oblast_uk} область · Київська єпархія`);
    expect(rowSubtitle(r, 'ru', { facet_eparchy: 'Епархия', facet_oblast: 'Область' })).toBe(`Киев · ${r.oblast_ru} область · Киевская епархия`);
    expect(rowSubtitle(r, 'en', { facet_eparchy: 'Diocese', facet_oblast: 'Region' })).toBe(`Kyiv · ${r.oblast_en} region · Kyiv diocese`);
    expect(rowSubtitle({ ...r, oblast_id: 1, oblast_uk: 'Крим' }, 'uk', { facet_eparchy: 'Єпархія', facet_oblast: 'Область' })).toBe('Київ · Крим · Київська єпархія');
    expect(rowSubtitle({ ...r, eparchy_uk: null, eparchy_ru: null, eparchy_en: null, oblast_uk: null, oblast_ru: null, oblast_en: null }, 'uk', {})).toBe('Київ');
  });
});
