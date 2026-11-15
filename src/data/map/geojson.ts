import type { FeatureCollection, Point, Polygon } from 'geojson';
import type { StyleSpecification } from 'maplibre-gl';
import { field, type MapPoint } from '@/data/repo/types';
import { distanceKm } from '@/data/search/geo';
import { markerIcon } from './markerIcon';
import type { Lang } from '@/i18n';

/** Pure helpers for the map screen (unit-tested in tests/unit/map.test.ts; no MapLibre runtime here). */

export interface MarkerProps { code: number; name: string; town: string; has_stream: number; icon: string }

/** One GeoJSON point per monastery with coordinates; the properties are what the marker card shows without a DB read. */
export function toFeatureCollection(rows: MapPoint[], lang: Lang): FeatureCollection<Point, MarkerProps> {
  return {
    type: 'FeatureCollection',
    features: rows
      .filter((r) => r.lat != null && r.lon != null)
      .map((r) => ({
        type: 'Feature',
        id: r.code,
        geometry: { type: 'Point', coordinates: [r.lon!, r.lat!] },
        properties: { code: r.code, name: field(r, 'name', lang), town: field(r, 'town', lang), has_stream: r.has_stream, icon: markerIcon(r) },
      })),
  };
}

/** The site's lavra type (`object_type` 5 = «лавра», contract §2): /map/ keeps them in an array of their own, zIndex 10000. */
export const LAVRA_TYPE = 5;
/**
 * A-21(б) / A-23 #9: the three lavras are never clustered and lie above every marker and cluster (as the site's /map/,
 * layouts/map/footer.php: objectid 5 → zIndex 10000, own array). One split for every map of the app (main, «near me», eparchy).
 */
export function splitLavras(rows: MapPoint[], lang: Lang): { houses: FeatureCollection<Point, MarkerProps>; lavras: FeatureCollection<Point, MarkerProps> } {
  return {
    houses: toFeatureCollection(rows.filter((r) => r.object_type !== LAVRA_TYPE), lang),
    lavras: toFeatureCollection(rows.filter((r) => r.object_type === LAVRA_TYPE), lang),
  };
}

/** `/map?at=<lat>,<lon>` (the mini-map of «Контакти» → the main map): [lon, lat] of the place, or null for anything else */
export function parseAt(v: string | null): [number, number] | null {
  const m = v?.match(/^(-?\d{1,3}(?:\.\d+)?),(-?\d{1,3}(?:\.\d+)?)$/);
  if (!m) return null;
  const lat = Number(m[1]), lon = Number(m[2]);
  return Math.abs(lat) <= 90 && Math.abs(lon) <= 180 ? [lon, lat] : null;
}

/** Monasteries within `radiusKm` of `at`, nearest first, each with `distance_km` set (shares distanceKm with the list). */
export function nearby<T extends MapPoint>(rows: T[], at: { lat: number; lon: number }, radiusKm: number): T[] {
  return rows
    .filter((r) => r.lat != null && r.lon != null)
    .map((r) => ({ ...r, distance_km: distanceKm(at.lat, at.lon, r.lat!, r.lon!) }))
    .filter((r) => r.distance_km! <= radiusKm)
    .sort((a, b) => a.distance_km! - b.distance_km!);
}

/** A circle of `radiusKm` around `at` as a 64-point polygon (the «near me» radius drawn on the map). */
export function radiusPolygon(at: { lat: number; lon: number }, radiusKm: number, steps = 64): FeatureCollection<Polygon> {
  const dLat = radiusKm / 111.32;
  const dLon = radiusKm / (111.32 * Math.max(0.05, Math.cos((at.lat * Math.PI) / 180)));
  const ring: [number, number][] = [];
  for (let i = 0; i <= steps; i++) {
    const a = (i / steps) * 2 * Math.PI;
    ring.push([at.lon + dLon * Math.cos(a), at.lat + dLat * Math.sin(a)]);
  }
  return { type: 'FeatureCollection', features: [{ type: 'Feature', properties: {}, geometry: { type: 'Polygon', coordinates: [ring] } }] };
}

/** Bounds that contain the circle (for fitBounds after «near me»). */
export function radiusBounds(at: { lat: number; lon: number }, radiusKm: number): [[number, number], [number, number]] {
  const ring = radiusPolygon(at, radiusKm, 8).features[0].geometry.coordinates[0];
  const lons = ring.map((c) => c[0]);
  const lats = ring.map((c) => c[1]);
  return [[Math.min(...lons), Math.min(...lats)], [Math.max(...lons), Math.max(...lats)]];
}

/** Ukraine as the initial view (spec §4: the whole directory at a glance). */
export const UKRAINE_BOUNDS: [[number, number], [number, number]] = [[22.1, 44.3], [40.3, 52.4]];
export const RADII_KM = [10, 25, 50, 100] as const;

/** A-117 (1): the font name of the cluster count - its glyphs are BUNDLED (`src/assets/glyphs/count-0-255.pbf`, scripts/make_count_glyphs.py) */
export const COUNT_FONT = 'Inok Count';
export const GLYPHS_URL = 'https://tiles.openfreemap.org/fonts/{fontstack}/{range}.pbf';
/**
 * A-117 (1), cloud_36: THE local style - every map STARTS on it (the houses from the DB drawn at once, no network asked) and stays on it
 * while the network style cannot be fetched (offline, a weak signal, the provider down). A flat background; the only text our layers
 * print is the cluster count, whose glyphs never leave the app (inokMap `transformRequest`).
 */
export const LOCAL_STYLE: StyleSpecification = {
  version: 8,
  glyphs: GLYPHS_URL,
  sources: {},
  layers: [{ id: 'background', type: 'background', paint: { 'background-color': '#e9e5dc' } }],
};
