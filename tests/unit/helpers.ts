import { vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { openWasmDb } from '@/data/db/wasmDb';
import { ensureSchema, type FtsMode } from '@/data/db/schema';
import { importDirectory } from '@/data/db/import';
import type { Db } from '@/data/db/types';
import type { Directory, Manifest } from '@/data/api/types';

const fx = (name: string) => fileURLToPath(new URL(`../../fixtures/${name}`, import.meta.url));
export const readFixture = (name: string): Uint8Array => new Uint8Array(readFileSync(fx(name)));
export const fixtureDirectory = (): Directory => JSON.parse(readFileSync(fx('directory_v1.json'), 'utf8'));
export const fixtureManifest = (): Manifest => JSON.parse(readFileSync(fx('manifest.json'), 'utf8'));

export async function freshDb(): Promise<{ db: Db; fts: FtsMode }> {
  const db = await openWasmDb();
  const fts = await ensureSchema(db);
  return { db, fts };
}

export async function importedDb(dir: Directory = fixtureDirectory()): Promise<{ db: Db; fts: FtsMode }> {
  const { db, fts } = await freshDb();
  await importDirectory(db, dir, fts);
  return { db, fts };
}

/** The browser's fixtures server for node (src/data/source.ts fixtures read `/fixtures/<name>` through fetch): answers from disk, the
 *  query ignored; a missing file = 404. Undo with `vi.unstubAllGlobals()`. ONE copy for every test (A-15). */
export const serveFixtures = () => vi.stubGlobal('fetch', async (u: string | URL | Request) => {
  const name = String(u).replace(/^.*\/fixtures\//, '').replace(/\?.*$/, '');
  try { return new Response(readFileSync(fx(name)), { status: 200, headers: { 'content-type': 'application/json' } }); }
  catch { return new Response('{"error":"not_found"}', { status: 404 }); }
});
