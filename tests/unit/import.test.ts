import { describe, expect, it } from 'vitest';
import { ImportError, importDirectory, validateDirectory } from '@/data/db/import';
import { getMeta } from '@/data/db/schema';
import { countMonasteries, getFacets, getMonastery, listFavourites, listMonasteries, toggleFavourite } from '@/data/repo/monasteries';
import { decodeExport, manifestFile, ChecksumError } from '@/data/api/exportLoader';
import { fixtureDirectory, fixtureManifest, freshDb, importedDb, readFixture } from './helpers';

describe('schema', () => {
  it('detects the trigram FTS mode on sqlite-wasm and records it in meta', async () => {
    const { db, fts } = await freshDb();
    expect(fts).toBe('trigram');
    expect(await getMeta(db, 'fts')).toBe('trigram');
  });
});

describe('export decoding (contract §2)', () => {
  it('gz → sha256 check → Directory, equal to the json fixture', async () => {
    const man = fixtureManifest();
    const dir = await decodeExport(readFixture('directory_v1.json.gz'), manifestFile(man).sha256);
    expect(dir).toEqual(fixtureDirectory());
    expect(dir.monasteries.length).toBe(man.counts.monasteries);
  });
  it('refuses a wrong checksum', async () => {
    await expect(decodeExport(readFixture('directory_v1.json.gz'), 'ab'.repeat(32))).rejects.toBeInstanceOf(ChecksumError);
  });
});

describe('import (atomic, contract-validated)', () => {
  it('imports every table and the FTS index', async () => {
    const { db } = await importedDb();
    const d = fixtureDirectory();
    expect(await countMonasteries(db)).toBe(d.monasteries.length);
    expect((await db.query('SELECT COUNT(*) AS n FROM eparchy'))[0].n).toBe(d.eparchies.length);
    expect((await db.query('SELECT COUNT(*) AS n FROM channel'))[0].n).toBe(d.channels.length);
    expect((await db.query('SELECT COUNT(*) AS n FROM monastery_fts'))[0].n).toBe(d.monasteries.length);
    expect(await getMeta(db, 'export_version')).toBe(d.export_version);
    const f = await getFacets(db);
    expect(f.eparchies.length).toBeGreaterThan(0);
    expect(f.types.every((t) => t.v === 'm' || t.v === 'f')).toBe(true);
  });
  it('has_stream is derived from channels; status is always active (A-6)', async () => {
    const { db } = await importedDb();
    const d = fixtureDirectory();
    const withStream = d.channels.map((c) => c.monastery_code).find((c) => c != null && d.monasteries.some((m) => m.code === c));
    if (withStream != null) expect((await getMonastery(db, withStream))!.has_stream).toBe(1);
    const statuses = await db.query<{ status: string }>('SELECT DISTINCT status FROM monastery');
    expect(statuses).toEqual([{ status: 'active' }]);
  });
  it('a frozen status in the input is stored as active (never shown)', async () => {
    const { db, fts } = await freshDb();
    const d = fixtureDirectory();
    d.monasteries[0].status = 'frozen';
    await importDirectory(db, d, fts);
    expect((await getMonastery(db, d.monasteries[0].code))!.status).toBe('active');
  });
  it('refuses a higher contract_version before writing anything', async () => {
    const { db, fts } = await importedDb();
    const d = fixtureDirectory();
    d.contract_version = 2;
    d.export_version = 'v2';
    await expect(importDirectory(db, d, fts)).rejects.toMatchObject({ code: 'contract_version' });
    expect(await getMeta(db, 'export_version')).toBe(fixtureDirectory().export_version);
  });
  it('a missing REQUIRED field fails validation and the transaction leaves the old data intact', async () => {
    const { db, fts } = await importedDb();
    const bad = fixtureDirectory();
    delete (bad.monasteries[1] as any).name;
    expect(() => validateDirectory(bad)).toThrow(ImportError);
    await expect(importDirectory(db, bad, fts)).rejects.toBeInstanceOf(ImportError);
    expect(await countMonasteries(db)).toBe(fixtureDirectory().monasteries.length);
  });
  it('a failure mid-transaction rolls back (readers never see a half-state)', async () => {
    const { db, fts } = await importedDb();
    const d = fixtureDirectory();
    d.export_version = 'next';
    // a duplicate code violates the PRIMARY KEY on the last row → the whole transaction must roll back
    d.monasteries.push({ ...d.monasteries[0] });
    await expect(importDirectory(db, d, fts)).rejects.toBeTruthy();
    expect(await countMonasteries(db)).toBe(fixtureDirectory().monasteries.length);
    expect(await getMeta(db, 'export_version')).toBe(fixtureDirectory().export_version);
  });
  it('swap leaves no staging tables and recreates the indexes (import twice)', async () => {
    const { db, fts } = await importedDb();
    await importDirectory(db, { ...fixtureDirectory(), export_version: 'again' }, fts);
    const names = (await db.query<{ name: string }>("SELECT name FROM sqlite_master WHERE name LIKE '%_new'")).map((r) => r.name);
    expect(names).toEqual([]);
    const idx = (await db.query<{ name: string }>("SELECT name FROM sqlite_master WHERE type = 'index' AND tbl_name = 'monastery'")).map((r) => r.name);
    expect(idx).toEqual(expect.arrayContaining(['ix_monastery_eparchy', 'ix_monastery_geo']));
    expect(await getMeta(db, 'export_version')).toBe('again');
    expect(await countMonasteries(db)).toBe(fixtureDirectory().monasteries.length);
  });
  it('re-import keeps favourites', async () => {
    const { db, fts } = await importedDb();
    const code = fixtureDirectory().monasteries[0].code;
    expect(await toggleFavourite(db, code)).toBe(true);
    await importDirectory(db, fixtureDirectory(), fts);
    expect(await listFavourites(db)).toEqual([code]);
    expect(await toggleFavourite(db, code)).toBe(false);
    expect(await listFavourites(db)).toEqual([]);
  });
});

// R-10 (31.10.2026): the five card fields ride through the import; the opening label follows the site's rule
import { getMonastery as getM } from '@/data/repo/monasteries';
import { revivalLabel } from '@/data/repo/types';
describe('R-10 card fields', () => {
  it('imports head_role / head_document / founded / revival / links and picks the opening label', async () => {
    const { db } = await importedDb();
    const r37 = (await getM(db, 37))!;
    expect(r37.founded_uk).toBe('11 століття');
    expect(r37.head_role_en).toBe('Father Superior');
    expect(r37.head_document_uk).toMatch(/№ 38/);
    expect(JSON.parse(r37.links_json!)).toHaveLength(2);
    const dict = { label_revival: 'Останнє відкриття (відродження)', label_opening: 'Відкриття' };
    expect(revivalLabel(r37, 'uk', dict)).toBe('Останнє відкриття (відродження)');
    const r159 = (await getM(db, 159))!;
    expect(r159.founded_uk).toBeNull();
    expect(revivalLabel(r159, 'uk', dict)).toBe('Відкриття');
    expect(JSON.parse(r159.links_json!)).toHaveLength(3);
    expect((await getM(db, 275))!.links_json).toBe('[]'); // none in the export → empty, never undefined
  });
});

// an app update with a newer schema: the old DB gains the new columns and forgets export_version, so the next sync re-imports
import { ensureSchema, SCHEMA_VERSION } from '@/data/db/schema';
describe('schema upgrade', () => {
  it('a v3 database gets the v4 channel columns and re-imports on the next sync', async () => {
    const { db } = await importedDb();
    await db.exec('CREATE TABLE channel_old AS SELECT id, title_uk FROM channel');
    await db.exec('DROP TABLE channel');
    await db.exec('ALTER TABLE channel_old RENAME TO channel');
    await db.run("UPDATE meta SET value = '3' WHERE key = 'schema_version'");
    await ensureSchema(db);
    const cols = (await db.query<{ name: string }>('PRAGMA table_info(channel)')).map((c) => c.name);
    expect(cols).toEqual(expect.arrayContaining(['sort_uk', 'sort_ru', 'sort_en', 'eparchy_id', 'oblast_id']));
    expect(await getMeta(db, 'export_version')).toBeNull();
    expect(await getMeta(db, 'schema_version')).toBe(String(SCHEMA_VERSION));
  });
});

// A-10 / R-11: canonical units ride through the import; the parent lists its units in the order of the app language
import { getUnits } from '@/data/repo/monasteries';
describe('canonical units (R-11)', () => {
  it('parent 98 → its units in units[lang] order (only those present); child 110 → parent 98 with the word in brackets', async () => {
    const { db } = await importedDb();
    const p98 = (await getM(db, 98))!;
    const inDb = new Set(fixtureDirectory().monasteries.map((m) => m.code));
    for (const lang of ['uk', 'ru', 'en'] as const) {
      const want = fixtureDirectory().monasteries.find((m) => m.code === 98)!.units![lang]!.filter((c) => inDb.has(c));
      expect((await getUnits(db, p98, lang)).map((r) => r.code)).toEqual(want);
    }
    expect((await getUnits(db, p98, 'uk')).map((r) => r.code)).toEqual([108, 105, 110]);
    expect((await getUnits(db, p98, 'en')).map((r) => r.code)).toEqual([108, 105, 110]);
    expect((await getUnits(db, p98, 'ru')).map((r) => r.code)).toEqual([108, 105, 110]);
    const c110 = (await getM(db, 110))!;
    expect(c110.parent_code).toBe(98);
    expect([c110.parent_division_uk, c110.parent_division_en]).toEqual(['скит', 'skete']);
    expect(await getUnits(db, c110, 'uk')).toEqual([]);
    const c109 = (await getM(db, 109))!;
    expect(c109.parent_code).toBe(101);
    expect((await getUnits(db, (await getM(db, 101))!, 'uk')).map((r) => r.code)).toEqual([109]);
  });
});

describe('R-25 / A-29: the square list thumbnail', () => {
  it('every house row carries the export\'s thumb (url + sha256 as its cache version); null stays null; the card picture is unchanged', async () => {
    const { db, fts } = await importedDb();
    const d = fixtureDirectory();
    const rows = await listMonasteries(db, fts, { lang: 'uk', filters: {} });
    for (const m of d.monasteries) {
      const r = rows.find((x) => x.code === m.code)!;
      expect(r.thumb_url).toBe(m.thumb?.url ?? null);
      expect(r.thumb_sha256).toBe(m.thumb?.sha256 ?? null);
      expect(r.cover_large_url).toBe(m.cover_large?.url ?? null); // the card keeps cover_large ?? cover
    }
    expect(rows.filter((r) => r.thumb_url).every((r) => /\/images\/monasteries\/small\//.test(r.thumb_url!))).toBe(true);
  });
});
