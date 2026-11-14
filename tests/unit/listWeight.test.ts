import { describe, expect, it } from 'vitest';
import { CARD_ONLY, getMonastery, listMonasteries, nearbyMonasteries } from '@/data/repo/monasteries';
import { nearby } from '@/data/map/geojson';
import type { SqlValue } from '@/data/db/types';
import { importedDb } from './helpers';

/** D22 mechanism: every list query crossed the Capacitor bridge with the cards' long texts — ~21 KB a row, ~6.7 MB for the
 *  316 houses, serialised on the Android UI thread that also draws the WebView (the blank first home on the emulator). */
describe('a list carries list fields only (D22)', () => {
  it('no card-only column in a list row, and a row stays small', async () => {
    const { db, fts } = await importedDb();
    const rows = await listMonasteries(db, fts, { lang: 'uk' });
    expect(rows.length).toBeGreaterThan(10);
    for (const k of CARD_ONLY) expect(Object.keys(rows[0]), k).not.toContain(k);
    const perRow = JSON.stringify(rows).length / rows.length;
    expect(perRow).toBeLessThan(4000);
  });
  it('the card still reads its long texts', async () => {
    const { db } = await importedDb();
    const card = await getMonastery(db, 37);
    expect(card?.history_uk?.length ?? 0).toBeGreaterThan(500);
    expect(card?.links_json).toBeTruthy();
  });
});

/** D22 rest (cloud_09, measured on the emulator: the first home pulled all 316 rows = 786 140 b to show 3 nearby houses). */
describe('the home «Поруч» reads only the houses around the person', () => {
  it('the same nearest houses as the whole list gave, for a fraction of the bytes', async () => {
    const { db, fts } = await importedDb();
    let bytes = 0;
    const counting = { ...db, query: async <T extends object>(sql: string, p?: SqlValue[]) => { const r = await db.query<T>(sql, p); bytes += JSON.stringify(r).length; return r; } };
    const kyiv = { lat: 50.4501, lon: 30.5234 };
    const all = await listMonasteries(counting, fts, { lang: 'uk' });
    const full = bytes; bytes = 0;
    const near = await nearbyMonasteries(counting, kyiv, 200, 3);
    expect(near.map((r) => r.code)).toEqual(nearby(all, kyiv, 200).slice(0, 3).map((r) => r.code));
    expect(near.length).toBeGreaterThan(0);
    expect(bytes, `${bytes} of ${full}`).toBeLessThan(full / 2);
  });
});

/** PLAN 6 (cloud_11): the «Монастирі» list opens with its ORDER (keys) and the FIRST PAGE of lean rows (one language), not 316 full rows. */
import { readFileSync } from 'node:fs';
import { listByCodes, listKeys } from '@/data/repo/monasteries';
import { field, headLine, rowParts } from '@/data/repo/types';
import { LANGS } from '@/i18n';
import type { Directory } from '@/data/api/types';

const opening = async (dir?: Directory) => {
  const { db, fts } = await importedDb(dir);
  const full = await listMonasteries(db, fts, { lang: 'uk' });
  const keys = await listKeys(db, fts, { lang: 'uk' });
  const page = await listByCodes(db, keys.slice(0, 30).map((k) => k.code), 'uk');
  return { full: JSON.stringify(full).length, keys: JSON.stringify(keys).length, page: JSON.stringify(page).length, n: full.length };
};
describe('the list opens light (PLAN 6)', () => {
  it('a lean row shows exactly what the full row shows, in every language (the row component reads the same fields)', async () => {
    const { db, fts } = await importedDb();
    const dict = { facet_oblast: 'область', facet_eparchy: 'єпархія', label_head_born: 'р. н.' };
    for (const lang of LANGS) {
      const full = await listMonasteries(db, fts, { lang });
      const lean = await listByCodes(db, full.map((r) => r.code), lang);
      expect(lean.map((r) => r.code)).toEqual(full.map((r) => r.code));
      for (const [i, r] of full.entries()) {
        for (const k of ['name', 'town', 'address', 'head', 'head_role', 'head_born', 'eparchy', 'oblast']) expect(field(lean[i], k, lang), `${r.code} ${k} ${lang}`).toBe(field(r, k, lang));
        expect(rowParts(lean[i], lang, dict)).toEqual(rowParts(r, lang, dict));
        expect(headLine(lean[i], lang, dict)).toEqual(headLine(r, lang, dict));
        expect([lean[i].type, lean[i].thumb_url, lean[i].thumb_sha256, lean[i].lat]).toEqual([r.type, r.thumb_url, r.thumb_sha256, r.lat]);
      }
      expect(Object.keys(lean[0]).filter((k) => /_(uk|ru|en)$/.test(k) && !k.endsWith(`_${lang}`)), 'other languages').toEqual([]);
    }
  });
  it('the keys keep the list\'s order and count under filters, both sorts and «near me»', async () => {
    const { db, fts } = await importedDb();
    const at = { lat: 50.4501, lon: 30.5234 };
    for (const q of [{ lang: 'ru' as const }, { lang: 'en' as const, filters: { eparchy_id: 1 } }, { lang: 'uk' as const, sort: 'distance' as const, at },
      { lang: 'uk' as const, filters: { near: { ...at, radius_km: 300 } } }, { lang: 'uk' as const, filters: { type: 'f' as const, has_stream: true } }]) {
      const full = await listMonasteries(db, fts, q); const keys = await listKeys(db, fts, q);
      expect(keys.map((k) => [k.code, k.distance_km])).toEqual(full.map((r) => [r.code, r.distance_km]));
    }
  });
  it('fixture: the keys + the first page weigh a fraction of the full rows', async () => {
    const m = await opening();
    expect((m.keys + m.page) / m.full, JSON.stringify(m)).toBeLessThan(0.35);
  });
  // the measurement on the LIVE export (316 houses; not in git: real phones): INOK_LIVE_EXPORT=<directory_v1.json> npx vitest --run listWeight
  it.skipIf(!process.env.INOK_LIVE_EXPORT)('live export: bytes on opening the list, before → after', async () => {
    const m = await opening(JSON.parse(readFileSync(process.env.INOK_LIVE_EXPORT!, 'utf8')));
    console.info(`PLAN6 live ${m.n} houses: full rows ${m.full} b -> keys ${m.keys} b + first page ${m.page} b = ${m.keys + m.page} b`);
    expect(m.keys + m.page).toBeLessThan(m.full / 5);
  });
});
