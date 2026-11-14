import { describe, expect, it } from 'vitest';
import { nearby, radiusBounds, radiusPolygon, toFeatureCollection } from '@/data/map/geojson';
import type { MonasteryRow } from '@/data/repo/types';

const row = (code: number, lat: number | null, lon: number | null, name = `M${code}`): MonasteryRow =>
  ({ code, lat, lon, name_uk: name, town_uk: `T${code}`, has_stream: code % 2 } as unknown as MonasteryRow);
const KYIV = { lat: 50.4501, lon: 30.5234 };

describe('map helpers', () => {
  it('toFeatureCollection: one point per monastery with coordinates, lon/lat order, card props', () => {
    const fc = toFeatureCollection([row(1, 50.32, 30.53), row(2, null, null), row(3, 48.0, 37.0)], 'uk');
    expect(fc.features.map((f) => f.id)).toEqual([1, 3]);
    expect(fc.features[0].geometry.coordinates).toEqual([30.53, 50.32]);
    expect(fc.features[0].properties).toEqual({ code: 1, name: 'M1', town: 'T1', has_stream: 1, icon: 'mon' });
  });
  it('nearby: filters by radius and sorts nearest first (haversine shared with the list)', () => {
    const rows = [row(1, 50.32, 30.535), row(2, 49.84, 24.03), row(3, 50.46, 30.53), row(4, null, null)];
    const n = nearby(rows, KYIV, 25);
    expect(n.map((r) => r.code)).toEqual([3, 1]);
    expect(n[0].distance_km!).toBeLessThan(2);
    expect(n[1].distance_km!).toBeGreaterThan(14);
    expect(n[1].distance_km!).toBeLessThan(15);
    expect(nearby(rows, KYIV, 1000).map((r) => r.code)).toEqual([3, 1, 2]);
    expect(nearby(rows, KYIV, 1)).toEqual([]);
  });
  it('radiusPolygon/radiusBounds: a closed ring ≈ radius km around the centre', () => {
    const ring = radiusPolygon(KYIV, 10).features[0].geometry.coordinates[0];
    expect(ring.length).toBe(65);
    expect(ring[0]).toEqual(ring[64]);
    const [[w, s], [e, n]] = radiusBounds(KYIV, 10);
    expect((n - s) * 111.32).toBeCloseTo(20, 0);
    expect(w).toBeLessThan(KYIV.lon);
    expect(e).toBeGreaterThan(KYIV.lon);
  });
});

import { splitLavras } from '@/data/map/geojson';
import { importedDb } from './helpers';
import { listMonasteries } from '@/data/repo/monasteries';
describe('the three lavras are never clustered (A-21(б), as the site /map/: objectid 5 in an array of its own)', () => {
  it('the lavras leave the clustered set; every other house stays in it; nothing is lost', async () => {
    const { db, fts } = await importedDb();
    const rows = await listMonasteries(db, fts, { lang: 'uk' });
    const { houses, lavras } = splitLavras(rows, 'uk');
    expect(lavras.features.map((f) => f.properties.code).sort((a, b) => a - b)).toEqual([98, 111, 242]);
    expect(lavras.features.map((f) => f.properties.icon).sort()).toEqual(['lavra_kpl', 'lavra_pch', 'lavra_svg']);
    expect(houses.features.some((f) => [98, 111, 242].includes(f.properties.code))).toBe(false);
    expect(houses.features.length + lavras.features.length).toBe(rows.filter((r) => r.lat != null && r.lon != null).length);
  });
});

import { parseAt } from '@/data/map/geojson';
describe('parseAt (PLAN 5: /map?at=<lat>,<lon>)', () => {
  it('gives [lon, lat] of a well-formed place and null for anything else', () => {
    expect(parseAt('50.434353,30.561425')).toEqual([30.561425, 50.434353]);
    expect(parseAt('-33.9,151.2')).toEqual([151.2, -33.9]);
    for (const bad of [null, '', '50.4', '50.4,30.5,1', 'a,b', '95,30', '50,190', '50.4, 30.5']) expect(parseAt(bad)).toBeNull();
  });
});
