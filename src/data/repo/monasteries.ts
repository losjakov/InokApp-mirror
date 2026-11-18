import type { Db } from '@/data/db/types';
import type { FtsMode } from '@/data/db/schema';
import { searchMonasteries } from '@/data/search/query';
import { distanceKm } from '@/data/search/geo';
import type { Lang } from '@/i18n';
import { field, MAP_POINT_COLS, type MapPoint, type Facets, type Filters, type MonasteryListRow, type MonasteryRow, type NamedRow, type Sort } from './types';

const COLS = `code, site_url, name_uk, name_ru, name_en, short_uk, short_ru, short_en, official_uk, official_ru, official_en,
  type, object_type, subordination, status, eparchy_id, oblast_id, town_uk, town_ru, town_en, address_uk, address_ru, address_en,
  lat, lon, phones_json, email, website, head_uk, head_ru, head_en, head_born_uk, head_born_ru, head_born_en, head_role_uk, head_role_ru, head_role_en,
  parent_code, cover_url, cover_w, cover_h, cover_large_url, thumb_url, thumb_sha256, has_gallery, photo_count, gallery_url, has_stream, sort, norm_name, updated_at`;
/** D22: the card's long texts — ONLY in the card's query. A list of 316 houses with them was ~6.7 MB of JSON per query, carried
 *  through the Capacitor bridge and serialised on the Android UI thread (the thread that draws the WebView): the first home after
 *  the import stayed blank for seconds on the emulator (run 41302782086: UI thread silent 2.3 s; probe run 41330103255: one 3 s frame). */
export const CARD_ONLY = ['head_document', 'founded', 'revival', 'parent_division', 'units', 'history'].flatMap((c) => ['uk', 'ru', 'en'].map((l) => `${c}_${l}`))
  .concat(['links_json', 'history_sources_json', 'norm_all']);
// the list row shows «town · oblast · eparchy» (REVIEW cloud_02 D5, owner 31.10): the names ride along, no second query per row
const NAMES = `e.name_uk AS eparchy_uk, e.name_ru AS eparchy_ru, e.name_en AS eparchy_en,
  o.name_uk AS oblast_uk, o.name_ru AS oblast_ru, o.name_en AS oblast_en`;
const prefixed = (cols: string[]) => cols.map((c) => `m.${c}`).join(', ');
const LIST_COLS = COLS.split(',').map((c) => c.trim());
const ROW = `${prefixed(LIST_COLS)}, ${NAMES}`;
const CARD_ROW = `${prefixed([...LIST_COLS, ...CARD_ONLY])}, ${NAMES}`;
const FROM = 'FROM monastery m LEFT JOIN eparchy e ON e.id = m.eparchy_id LEFT JOIN oblast o ON o.id = m.oblast_id';

function whereOf(f: Filters): { sql: string; params: (string | number)[] } {
  const w: string[] = [];
  const p: (string | number)[] = [];
  if (f.type) { w.push('m.type = ?'); p.push(f.type); }
  if (f.object_type != null) { w.push('m.object_type = ?'); p.push(f.object_type); }
  if (f.subordination != null) { w.push('m.subordination = ?'); p.push(f.subordination); }
  if (f.eparchy_id != null) { w.push('m.eparchy_id = ?'); p.push(f.eparchy_id); }
  if (f.oblast_id != null) { w.push('m.oblast_id = ?'); p.push(f.oblast_id); }
  if (f.has_stream) w.push('m.has_stream = 1');
  if (f.visited === 'yes') w.push('m.code IN (SELECT code FROM visited)');
  if (f.visited === 'no') w.push('m.code NOT IN (SELECT code FROM visited)');
  if (f.near) {
    // bounding box in SQL (uses ix_monastery_geo), exact haversine in JS below
    const dLat = f.near.radius_km / 111;
    const dLon = f.near.radius_km / (111 * Math.max(0.2, Math.cos((f.near.lat * Math.PI) / 180)));
    w.push('m.lat BETWEEN ? AND ? AND m.lon BETWEEN ? AND ?');
    p.push(f.near.lat - dLat, f.near.lat + dLat, f.near.lon - dLon, f.near.lon + dLon);
  }
  return { sql: w.length ? ' WHERE ' + w.join(' AND ') : '', params: p };
}

export interface ListQuery {
  q?: string;
  filters?: Filters;
  sort?: Sort;
  lang: Lang;
  /** user position for the distance sort / distance labels */
  at?: { lat: number; lon: number } | null;
}

/** Reads only from SQLite; search ranks via FTS, filters via SQL, sort via Intl.Collator (locale-aware). */
export async function listMonasteries(db: Db, fts: FtsMode, query: ListQuery): Promise<MonasteryListRow[]> {
  return listOf<MonasteryListRow>(db, fts, query, ROW);
}

/** PLAN 6 (cloud_11): the list's ORDER and COUNT — what search, filters, «near me» and both sorts need, nothing to show.
 *  316 houses: the list opened with 1 082 173 b of rows (live export 2026-11-02); the keys + the first page — see listWeight.test.ts. */
export type ListKey = Pick<MonasteryListRow, 'code' | 'name_uk' | 'name_ru' | 'name_en' | 'lat' | 'lon' | 'sort'> & { distance_km?: number };
const KEY = 'm.code, m.name_uk, m.name_ru, m.name_en, m.lat, m.lon, m.sort';

/** R-31 (A-44, InokSite 275): THE order of houses the site uses - the card's SORT ascending (the three lavras 10 / 20 / 30, the rest
 *  500; null = an export before R-31 = 500). Every name-sorted list compares it FIRST, then the name; a list in its own order
 *  (favourites, canonical units) is stably re-sorted by it alone - lavras first, the rest as before; distance and search keep theirs. */
const DEFAULT_SORT = 500;
export const bySiteSort = (a: { sort?: number | null }, b: { sort?: number | null }): number => (a.sort ?? DEFAULT_SORT) - (b.sort ?? DEFAULT_SORT);
/** the lavras first, everything else in the order it came (Array#sort is stable) */
export const lavrasFirst = <T extends { sort?: number | null }>(rows: T[]): T[] => [...rows].sort(bySiteSort);
export const listKeys = (db: Db, fts: FtsMode, query: ListQuery): Promise<ListKey[]> => listOf<ListKey>(db, fts, query, KEY);

/** ONE query for the list (rows or keys): search ranks via FTS, filters via SQL, sort via Intl.Collator (locale-aware). */
async function listOf<R extends ListKey>(db: Db, fts: FtsMode, query: ListQuery, cols: string): Promise<R[]> {
  const f = query.filters ?? {};
  const { sql, params } = whereOf(f);
  let rows: R[];
  let order: Map<number, number> | null = null;
  if (query.q && query.q.trim()) {
    const hits = await searchMonasteries(db, fts, query.q, 100);
    if (hits.length === 0) return [];
    order = new Map(hits.map((h, i) => [h.code, i]));
    const codes = hits.map((h) => h.code);
    rows = await db.query<R>(
      `SELECT ${cols} ${FROM}${sql ? sql + ' AND' : ' WHERE'} m.code IN (${codes.map(() => '?').join(',')})`,
      [...params, ...codes],
    );
  } else {
    rows = await db.query<R>(`SELECT ${cols} ${FROM}${sql}`, params);
  }
  const at = query.at ?? (f.near ? { lat: f.near.lat, lon: f.near.lon } : null);
  if (at) {
    for (const r of rows) if (r.lat != null && r.lon != null) r.distance_km = distanceKm(at.lat, at.lon, r.lat, r.lon);
    if (f.near) rows = rows.filter((r) => r.distance_km != null && r.distance_km <= f.near!.radius_km);
  }
  const sort: Sort = query.sort ?? 'name';
  if (order) {
    rows.sort((a, b) => order!.get(a.code)! - order!.get(b.code)!);
  } else if (sort === 'distance' && at) {
    rows.sort((a, b) => (a.distance_km ?? 1e9) - (b.distance_km ?? 1e9));
  } else {
    const col = new Intl.Collator(query.lang, { sensitivity: 'base', numeric: true });
    rows.sort((a, b) => bySiteSort(a, b) || col.compare(field(a, 'name', query.lang), field(b, 'name', query.lang)));
  }
  return rows;
}

/** D22 (cloud_09, measured: the first home pulled all 316 rows — 786 140 b through the bridge on the UI thread — for 3 nearby):
 *  the houses within `radiusKm` of `at`, nearest first, bounded in SQL (the same `near` filter as the list), at most `n`. */
export async function nearbyMonasteries(db: Db, at: { lat: number; lon: number }, radiusKm: number, n: number): Promise<MonasteryListRow[]> {
  const { sql, params } = whereOf({ near: { lat: at.lat, lon: at.lon, radius_km: radiusKm } });
  const k = Math.cos((at.lat * Math.PI) / 180) ** 2; // the equirectangular order in SQL; the exact haversine below (a few spare rows)
  const rows = await db.query<MonasteryListRow>(
    `SELECT ${ROW} ${FROM}${sql} ORDER BY (m.lat - ?) * (m.lat - ?) + (m.lon - ?) * (m.lon - ?) * ? LIMIT ?`,
    [...params, at.lat, at.lat, at.lon, at.lon, k, n + 4]);
  for (const r of rows) r.distance_km = distanceKm(at.lat, at.lon, r.lat!, r.lon!);
  return rows.filter((r) => r.distance_km! <= radiusKm).sort((a, b) => a.distance_km! - b.distance_km!).slice(0, n);
}

/** PLAN item 6: the map's markers — the point columns only (MapPoint), with the list's filters (an eparchy's map) */
export async function listMapPoints(db: Db, filters: Filters = {}): Promise<MapPoint[]> {
  const { sql, params } = whereOf(filters);
  return db.query<MapPoint>(`SELECT ${prefixed([...MAP_POINT_COLS])} FROM monastery m${sql}`, params);
}

/** PLAN 6: what THE list row shows (MonasteryRow without a search), in ONE language: each text = the first filled of [lang, uk, ru, en]
 *  (the rule of `field`), under the `<name>_<lang>` key `field` reads first. A search's rows stay full (its «found in …» reads every language). */
export type LeanRow = Pick<MonasteryListRow, 'code' | 'type' | 'object_type' | 'subordination' | 'eparchy_id' | 'oblast_id' | 'lat' | 'lon' | 'has_stream'
  | 'thumb_url' | 'thumb_sha256'> & Partial<MonasteryListRow>;
const LEAN_TEXT: [string, string][] = ['name', 'town', 'address', 'head', 'head_role', 'head_born'].map((c): [string, string] => [`m.${c}`, c])
  .concat([['e.name', 'eparchy'], ['o.name', 'oblast']]);
const lean = (lang: Lang) => ['m.code, m.type, m.object_type, m.subordination, m.eparchy_id, m.oblast_id, m.lat, m.lon, m.has_stream, m.thumb_url, m.thumb_sha256',
  ...LEAN_TEXT.map(([src, as]) => `COALESCE(${[...new Set([lang, 'uk', 'ru', 'en'])].map((l) => `NULLIF(${src}_${l}, '')`).join(', ')}) AS ${as}_${lang}`)].join(', ');

/** List rows of the given houses, in the given order (the map's «near me» list: only the houses inside the ring cross the bridge);
 *  with `lang`: the lean rows of THE list (a page of the «Монастирі» list, PLAN 6) */
export async function listByCodes(db: Db, codes: number[]): Promise<MonasteryListRow[]>;
export async function listByCodes(db: Db, codes: number[], lang: Lang): Promise<LeanRow[]>;
export async function listByCodes(db: Db, codes: number[], lang?: Lang): Promise<LeanRow[]> {
  if (!codes.length) return [];
  const rows = await db.query<LeanRow>(`SELECT ${lang ? lean(lang) : ROW} ${FROM} WHERE m.code IN (${codes.map(() => '?').join(',')})`, codes);
  const by = new Map(rows.map((r) => [r.code, r]));
  return codes.flatMap((c) => (by.has(c) ? [by.get(c)!] : []));
}

/** the card: the whole row, long texts included */
export async function getMonastery(db: Db, code: number): Promise<MonasteryRow | null> {
  const r = await db.query<MonasteryRow>(`SELECT ${CARD_ROW} ${FROM} WHERE m.code = ?`, [code]);
  return r[0] ?? null;
}

export async function getMonasteries(db: Db, codes: number[]): Promise<MonasteryListRow[]> {
  if (codes.length === 0) return [];
  return db.query<MonasteryListRow>(`SELECT ${ROW} ${FROM} WHERE m.code IN (${codes.map(() => '?').join(',')})`, codes);
}

/** A-10 «Канонічні підрозділи»: the parent's unit cards in the order of the app language (R-11 `units[lang]`, the site's
 *  order: the object type's priority, then the name); codes not in the DB (never, with a whole export) are skipped. */
export async function getUnits(db: Db, row: MonasteryRow, lang: Lang): Promise<MonasteryListRow[]> {
  const codes: number[] = JSON.parse(field(row, 'units', lang) || '[]');
  return getMonasteriesInOrder(db, codes);
}

/** Houses by code in the given order (favourites: newest first; units: the site's order) with the lavras moved to the top (A-44). */
export async function getMonasteriesInOrder(db: Db, codes: number[]): Promise<MonasteryListRow[]> {
  const byCode = new Map((await getMonasteries(db, codes)).map((r) => [r.code, r]));
  return lavrasFirst(codes.map((c) => byCode.get(c)).filter((r): r is MonasteryListRow => !!r));
}

export async function countMonasteries(db: Db): Promise<number> {
  return (await db.query<{ n: number }>('SELECT COUNT(*) AS n FROM monastery'))[0]?.n ?? 0;
}

/**
 * Facet VALUES with counts from the data (contract §2: never a hard-coded list), DEPENDENT as the site's /monasteries/ selects
 * (A-13): each facet is counted under every OTHER active filter (its own selection ignored, so the user can switch it), values
 * with no house are left out — an impossible combination cannot be picked. `streams` = houses with a stream under all filters
 * but «has stream» itself.
 */
export async function getFacets(db: Db, filters: Filters = {}): Promise<Facets> {
  const counted = async <T extends object>(key: keyof Filters, select: string, groupBy: string, join = '', order = '1') => {
    const { sql, params } = whereOf({ ...filters, [key]: null });
    const w = `${sql ? sql + ' AND' : ' WHERE'} ${groupBy} IS NOT NULL`;
    return db.query<T>(`SELECT ${select}, COUNT(*) AS n FROM monastery m ${join}${w} GROUP BY ${groupBy} ORDER BY ${order}`, params);
  };
  const vals = <V,>(key: keyof Filters, col: string) => counted<{ v: V; n: number }>(key, `m.${col} AS v`, `m.${col}`);
  const streams = await (async () => {
    const { sql, params } = whereOf({ ...filters, has_stream: false });
    return (await db.query<{ n: number }>(`SELECT COUNT(*) AS n FROM monastery m${sql ? sql + ' AND' : ' WHERE'} m.has_stream = 1`, params))[0]?.n ?? 0;
  })();
  const vis = await (async () => {
    const { sql, params } = whereOf({ ...filters, visited: null });
    const r = (await db.query<{ yes: number; n: number }>(`SELECT SUM(CASE WHEN m.code IN (SELECT code FROM visited) THEN 1 ELSE 0 END) AS yes, COUNT(*) AS n FROM monastery m${sql}`, params))[0];
    return { yes: r?.yes ?? 0, no: (r?.n ?? 0) - (r?.yes ?? 0) };
  })();
  return {
    visited: vis,
    types: await vals<string>('type', 'type'),
    object_types: await vals<number>('object_type', 'object_type'),
    subordinations: await vals<number>('subordination', 'subordination'),
    eparchies: await counted<NamedRow & { n: number }>('eparchy_id', 'e.id, e.name_uk, e.name_ru, e.name_en, e.site_url', 'e.id', 'JOIN eparchy e ON e.id = m.eparchy_id'),
    oblasts: await counted<NamedRow & { n: number }>('oblast_id', 'o.id, o.name_uk, o.name_ru, o.name_en', 'o.id', 'JOIN oblast o ON o.id = m.oblast_id'),
    streams,
  };
}

export async function getNamed(db: Db, table: 'eparchy' | 'oblast', id: number | null | undefined): Promise<NamedRow | null> {
  if (id == null) return null;
  const cols = table === 'eparchy' ? 'id, name_uk, name_ru, name_en, site_url' : 'id, name_uk, name_ru, name_en';
  return (await db.query<NamedRow>(`SELECT ${cols} FROM ${table} WHERE id = ?`, [id]))[0] ?? null;
}

export async function getDictionary(db: Db, lang: Lang): Promise<Record<string, string>> {
  const rows = await db.query<{ key: string; value: string }>('SELECT key, value FROM dictionary WHERE lang = ?', [lang]);
  if (rows.length === 0 && lang !== 'uk') return getDictionary(db, 'uk');
  return Object.fromEntries(rows.map((r) => [r.key, r.value]));
}

// favourites (local only, spec §3)
export const listFavourites = async (db: Db): Promise<number[]> =>
  (await db.query<{ code: number }>('SELECT code FROM favourite ORDER BY added_at DESC')).map((r) => r.code);
export const isFavourite = async (db: Db, code: number): Promise<boolean> =>
  (await db.query('SELECT 1 AS x FROM favourite WHERE code = ?', [code])).length > 0;
export async function toggleFavourite(db: Db, code: number): Promise<boolean> {
  if (await isFavourite(db, code)) {
    await db.run('DELETE FROM favourite WHERE code = ?', [code]);
    return false;
  }
  await db.run('INSERT INTO favourite(code, added_at) VALUES (?, ?)', [code, Date.now()]);
  return true;
}
