import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { isServerBusy } from '@/data/api/client';
import { dataSource } from '@/data/source';
import { syncDirectory, lastSyncFailure } from '@/data/sync';
import { countMonasteries } from '@/data/repo/monasteries';
import { fixtureManifest, importedDb } from './helpers';

/** The hoster's protection page as the cloud runs got it (05.11 / 06.11.2026; trimmed, no address). */
const PAGE = '<!DOCTYPE html>\n<html lang="uk">\n<head>\n\t<title>Захищена сторінка</title>\n</head><body><div id="container">…</div></body></html>';
const html = (status: number, type = 'text/html; charset=utf-8') => vi.stubGlobal('fetch', vi.fn(async () => new Response(PAGE, { status, headers: { 'content-type': type } })));

beforeEach(() => vi.stubEnv('VITE_DATA', 'live'));
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

/** D72: an HTML answer where the API's JSON was due = «the server is busy» on EVERY route of the client - an ApiError, never a crash. */
describe('server busy (HTML instead of JSON)', () => {
  const s = () => dataSource();
  const m = fixtureManifest();
  const routes: [string, () => Promise<unknown>][] = [
    ['manifest', () => s().manifest()],
    ['directory', () => s().directory(m)],
    ['config', () => s().config()],
    ['live-status', () => s().liveStatus()],
    ['articles', () => s().articles('uk')],
    ['article (R-35)', () => s().article(2868, 'ru')],
    ['comments', () => s().comments(2869, '00000000-0000-4000-8000-000000000000')],
    ['rating', () => s().rate(2869, { value: 5, install_id: 'x' })],
    ['vote', () => s().vote(2869, 1, { value: 'like', install_id: 'x' })],
    ['report', () => s().report(2869, 1, { install_id: 'x' })],
  ];
  for (const [status, type] of [[200, undefined], [403, undefined], [200, 'application/json']] as const) {
    it(`${status} ${type ?? 'text/html'}: every route throws «server busy»`, async () => {
      html(status, type);
      for (const [name, call] of routes) {
        const e = await call().then(() => null, (x: unknown) => x);
        expect(isServerBusy(e), `${name}: ${String(e)}`).toBe(true);
      }
    });
  }
  it('the directory check: the cache stays, the cause says server_busy (not a crash, not an import error)', async () => {
    const { db, fts } = await importedDb();
    const before = await countMonasteries(db);
    html(200);
    expect(await syncDirectory(db, fts)).toBe('error');
    expect(lastSyncFailure()).toEqual({ kind: 'server', code: 'HTTP-200 server_busy' });
    expect(await countMonasteries(db)).toBe(before);
  });
});
