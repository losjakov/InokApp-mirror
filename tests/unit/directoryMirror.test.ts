import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { fixtureDirectory, fixtureManifest, freshDb, importedDb } from './helpers';
import type { Directory, Manifest } from '@/data/api/types';
import { ApiError, MIRROR_BASE, SERVER_BUSY } from '@/data/api/client';
import { getMeta } from '@/data/db/schema';
import { ChecksumError } from '@/data/api/exportLoader';

// A-144 (cloud_43): the directory built into the app + the GitHub mirror when the site is silent; never an older export
const S = vi.hoisted(() => ({ src: null as unknown }));
vi.mock('@/data/source', async (orig) => ({ ...(await orig<object>()), dataSource: () => S.src }));
vi.mock('@/native/network', () => ({ online: async () => true }));

import { importBundled, newerExport, siteDown, syncDirectory } from '@/data/sync';

const at = (v: string): { man: Manifest; dir: Directory } => ({ man: { ...fixtureManifest(), export_version: v }, dir: { ...fixtureDirectory(), export_version: v } });
type Calls = string[];
function source(o: { site?: { man: Manifest; dir: Directory } | Error; siteDir?: Error; mirror?: { man: Manifest; dir: Directory } | Error; bundled?: { man: Manifest; dir: Directory } | null | Error }, calls: Calls) {
  const pick = <T>(x: T | Error | undefined, what: string): T => { calls.push(what); if (x === undefined) throw new TypeError('Failed to fetch'); if (x instanceof Error) throw x; return x; };
  return {
    manifest: async () => pick(o.site, 'site manifest').man,
    directory: async () => { if (o.siteDir) { calls.push('site gz'); throw o.siteDir; } return pick(o.site, 'site gz').dir; },
    mirrorManifest: async () => pick(o.mirror, 'mirror manifest').man,
    mirrorDirectory: async () => pick(o.mirror, 'mirror gz').dir,
    bundled: async () => pick(o.bundled === undefined ? null : o.bundled, 'bundled'),
  };
}
const count = async (db: Awaited<ReturnType<typeof freshDb>>['db']) => (await db.query<{ n: number }>('SELECT COUNT(*) AS n FROM monastery'))[0].n;
beforeEach(() => { S.src = null; });
afterEach(() => vi.unstubAllGlobals());

describe('A-144 (2): the first launch imports the bundled pair at once', () => {
  it('an empty DB + no network: the bundled export is imported (every house), its version stored', async () => {
    const { db, fts } = await freshDb();
    const calls: Calls = [];
    S.src = source({ bundled: at('2026-11-21T09:10:10Z') }, calls);
    expect(await importBundled(db, fts)).toBe(true);
    expect(await count(db)).toBe(fixtureDirectory().monasteries.length);
    expect(await getMeta(db, 'export_version')).toBe('2026-11-21T09:10:10Z');
    expect(calls).toEqual(['bundled']); // no network asked
  });
  it('never over a stored export (a DB with houses); a build without the pair / a bad sha = nothing, no throw', async () => {
    const { db, fts } = await importedDb();
    const calls: Calls = [];
    S.src = source({ bundled: at('2099-01-01T00:00:00Z') }, calls);
    expect(await importBundled(db, fts)).toBe(false);
    expect(calls).toEqual([]);
    const fresh = await freshDb();
    S.src = source({ bundled: null }, []);
    expect(await importBundled(fresh.db, fresh.fts)).toBe(false);
    S.src = source({ bundled: new ChecksumError('sha256 x != y') }, []);
    expect(await importBundled(fresh.db, fresh.fts)).toBe(false);
    expect(await count(fresh.db)).toBe(0);
  });
});

describe('A-144 (3): the site silent -> the GitHub mirror (its own manifest), never older', () => {
  const stored = '2026-11-20T09:00:00Z';
  const cases: [string, Error][] = [['503', new ApiError(503, 'http_503')], ['timeout', Object.assign(new Error('t'), { name: 'TimeoutError' })],
    ['an HTML page', new ApiError(200, SERVER_BUSY)], ['429 after the retries', new ApiError(429, 'http_429')], ['no network', new TypeError('Failed to fetch')]];
  for (const [why, err] of cases)
    it(`site ${why} -> the mirror's newer export is imported`, async () => {
      const { db, fts } = await importedDb({ ...fixtureDirectory(), export_version: stored });
      const calls: Calls = [];
      S.src = source({ site: err, mirror: at('2026-11-21T09:10:10Z') }, calls);
      expect(await syncDirectory(db, fts)).toBe('updated');
      expect(calls).toEqual(['site manifest', 'mirror manifest', 'mirror gz']);
      expect(await getMeta(db, 'export_version')).toBe('2026-11-21T09:10:10Z');
    });
  it('the mirror OLDER than the stored one -> ignored (up to date, nothing imported)', async () => {
    const { db, fts } = await importedDb({ ...fixtureDirectory(), export_version: stored });
    const calls: Calls = [];
    S.src = source({ site: new ApiError(503, 'http_503'), mirror: at('2026-11-19T09:00:00Z') }, calls);
    expect(await syncDirectory(db, fts)).toBe('up_to_date');
    expect(calls).not.toContain('mirror gz');
    expect(await getMeta(db, 'export_version')).toBe(stored);
  });
  it('the site OLDER than the stored one -> ignored too', async () => {
    const { db, fts } = await importedDb({ ...fixtureDirectory(), export_version: stored });
    S.src = source({ site: at('2026-11-19T09:00:00Z') }, []);
    expect(await syncDirectory(db, fts)).toBe('up_to_date');
  });
  it('the mirror\'s gz with a bad sha -> rejected, nothing imported (the stored export stays)', async () => {
    const { db, fts } = await importedDb({ ...fixtureDirectory(), export_version: stored });
    S.src = source({ site: new ApiError(502, 'http_502'), mirror: at('2026-11-21T09:10:10Z') }, []);
    (S.src as { mirrorDirectory: () => Promise<Directory> }).mirrorDirectory = async () => { throw new ChecksumError('sha256 a != b'); };
    expect(await syncDirectory(db, fts)).toBe('error');
    expect(await getMeta(db, 'export_version')).toBe(stored);
  });
  it('the site\'s manifest answered but its gz failed (5xx) -> the mirror\'s pair', async () => {
    const { db, fts } = await importedDb({ ...fixtureDirectory(), export_version: stored });
    const calls: Calls = [];
    S.src = source({ site: at('2026-11-21T09:10:10Z'), siteDir: new ApiError(500, 'http_500'), mirror: at('2026-11-21T09:10:10Z') }, calls);
    expect(await syncDirectory(db, fts)).toBe('updated');
    expect(calls).toEqual(['site manifest', 'site gz', 'mirror manifest', 'mirror gz']);
  });
  it('a site answer that is NOT a failure of the site (403, 404) does not go to the mirror', async () => {
    const { db, fts } = await importedDb({ ...fixtureDirectory(), export_version: stored });
    const calls: Calls = [];
    S.src = source({ site: new ApiError(403, 'forbidden'), mirror: at('2026-11-21T09:10:10Z') }, calls);
    expect(await syncDirectory(db, fts)).toBe('error');
    expect(calls).toEqual(['site manifest']);
  });
  it('newerExport / siteDown / ONE mirror constant beside API_BASE', () => {
    expect(newerExport('2026-11-21T09:10:10Z', null)).toBe(true);
    expect(newerExport('2026-11-21T09:10:10Z', '2026-11-21T09:10:10Z')).toBe(false);
    expect(newerExport('2026-11-21T09:10:11Z', '2026-11-21T09:10:10Z')).toBe(true);
    expect(siteDown(new ApiError(404, 'not_found'))).toBe(false);
    expect(MIRROR_BASE).toBe('https://losjakov.github.io/inok-app-data/export/');
    const src = readFileSync('src/data/source.ts', 'utf8');
    expect(src.match(/losjakov\.github\.io/g) ?? []).toHaveLength(0); // the address lives in client.ts only
  });
});
