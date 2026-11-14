import { readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { MARKER_ICONS, markerIcon } from '@/data/map/markerIcon';
import { toFeatureCollection } from '@/data/map/geojson';
import { listMonasteries } from '@/data/repo/monasteries';
import { importedDb } from './helpers';

const files = readdirSync(fileURLToPath(new URL('../../src/assets/mapicons/', import.meta.url))).map((f) => f.replace(/\.svg$/, '')).sort();
const h = (object_type: number, subordination: number, type: 'm' | 'f', code = 1) => markerIcon({ code, object_type, subordination, type });

/** A-12: the site's skmGetIconsShapesSvg() rule over the 17 SVGs of inok.info. */
describe('markerIcon', () => {
  it('the 17 combinations map to the 17 site files, one to one', () => {
    const got = [
      h(1, 1, 'm'), h(1, 1, 'f'), h(1, 2, 'm'), h(1, 2, 'f'),
      h(2, 1, 'm'), h(2, 1, 'f'), h(2, 2, 'm'), h(2, 2, 'f'),
      h(4, 1, 'm'), h(4, 1, 'f'), h(4, 2, 'm'), h(4, 2, 'f'),
      h(17, 1, 'm'), h(17, 1, 'f'),
      h(5, 2, 'm', 242), h(5, 2, 'm', 111), h(5, 2, 'm', 98),
    ];
    expect(got).toEqual(['mon', 'mon_fem', 'mon_stavro', 'mon_stavro_fem', 'skit', 'skit_fem', 'skit_stavro', 'skit_stavro_fem',
      'podv', 'podv_fem', 'podv_stavro', 'podv_stavro_fem', 'col', 'col_fem', 'lavra_kpl', 'lavra_pch', 'lavra_svg']);
    expect(new Set(got).size).toBe(17);
    expect([...got].sort()).toEqual(files);
    expect([...MARKER_ICONS].sort()).toEqual(files);
  });
  it('no file for a stauropegial community → its plain icon; unknown type → a monastery', () => {
    expect(h(17, 2, 'f')).toBe('col_fem');
    expect(markerIcon({ code: 9, object_type: null, subordination: null, type: null })).toBe('mon');
  });
  it('every fixture house gets an existing icon in the map features', async () => {
    const { db, fts } = await importedDb();
    const fc = toFeatureCollection(await listMonasteries(db, fts, { lang: 'uk' }), 'uk');
    expect(fc.features.length).toBe(18);
    for (const f of fc.features) expect(files).toContain(f.properties.icon);
    expect(fc.features.find((f) => f.properties.code === 110)!.properties.icon).toBe('skit_stavro');
    expect(fc.features.find((f) => f.properties.code === 242)!.properties.icon).toBe('lavra_kpl');
  });
});
