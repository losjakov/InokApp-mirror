import { describe, expect, it } from 'vitest';
import { listByCodes, listMapPoints, listMonasteries } from '@/data/repo/monasteries';
import { nearby, splitLavras } from '@/data/map/geojson';
import { importedDb } from './helpers';

/** PLAN item 6 (cloud_10): the map reads POINTS, not list rows. Live export 2026-11-02 (316 houses): 1 082 173 b → see REPORT §1. */
describe('the map\'s light query', () => {
  it('points carry what a marker needs and weigh a fraction of the list rows', async () => {
    const { db, fts } = await importedDb();
    const rows = await listMonasteries(db, fts, { lang: 'uk' });
    const pts = await listMapPoints(db);
    expect(pts.map((p) => p.code).sort()).toEqual(rows.map((r) => r.code).sort());
    const feats = (x: Parameters<typeof splitLavras>[0]) => { const s = splitLavras(x, 'uk'); return [s.houses, s.lavras].map((c) => [...c.features].sort((a, b) => Number(a.id) - Number(b.id))); };
    expect(feats(pts)).toEqual(feats(rows)); // the same markers, icons and labels
    expect(JSON.stringify(pts).length / JSON.stringify(rows).length).toBeLessThan(0.25);
    expect(Object.keys(pts[0])).not.toContain('address_uk');
  });
  it('an eparchy\'s map = the same filter as its list', async () => {
    const { db, fts } = await importedDb();
    const ids = (await listMonasteries(db, fts, { lang: 'uk', filters: { eparchy_id: 1 } })).map((r) => r.code).sort();
    expect((await listMapPoints(db, { eparchy_id: 1 })).map((p) => p.code).sort()).toEqual(ids);
  });
  it('«near me»: the ring on the points, then list rows of exactly those houses in that order', async () => {
    const { db } = await importedDb();
    const near = nearby(await listMapPoints(db), { lat: 50.4501, lon: 30.5234 }, 200);
    const rows = await listByCodes(db, near.map((p) => p.code));
    expect(rows.map((r) => r.code)).toEqual(near.map((p) => p.code));
    expect(rows[0].address_uk).toBeTruthy();
    expect(await listByCodes(db, [])).toEqual([]);
  });
});
