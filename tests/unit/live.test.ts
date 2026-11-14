import { describe, expect, it } from 'vitest';
import { apiJson, apiFetch } from '@/data/api/client';
import { decodeExport, manifestFile } from '@/data/api/exportLoader';
import { importDirectory } from '@/data/db/import';
import { countMonasteries } from '@/data/repo/monasteries';
import { searchMonasteries } from '@/data/search/query';
import type { AppConfig, Manifest } from '@/data/api/types';
import { freshDb } from './helpers';

/** Integration against the LIVE site (contract §2–§3). Opt-in: INOK_LIVE=1 npm test — never in the default CI run. */
describe.skipIf(process.env.INOK_LIVE !== '1')('live API', () => {
  it('manifest → gz (sha256 ok) → atomic import → search finds the Lavra', async () => {
    const man = await apiJson<Manifest>('export/manifest.json');
    expect(man.contract_version).toBe(1);
    const f = manifestFile(man);
    const res = await apiFetch(`export/${f.name}`);
    const gz = new Uint8Array(await res.arrayBuffer());
    expect(gz.length).toBe(f.bytes);
    const dir = await decodeExport(gz, f.sha256);
    expect(dir.monasteries.length).toBe(man.counts.monasteries);
    const { db, fts } = await freshDb();
    const t0 = Date.now();
    const n = await importDirectory(db, dir, fts);
    const ms = Date.now() - t0;
    expect(n).toBe(man.counts.monasteries);
    expect(await countMonasteries(db)).toBe(n);
    const hits = await searchMonasteries(db, fts, 'печерска лавра');
    expect(hits.length).toBeGreaterThan(0);
    console.log(`live import: ${n} monasteries in ${ms} ms, gz ${f.bytes} b, export ${man.export_version}`);
  });
  it('config carries the style and privacy URLs', async () => {
    const c = await apiJson<AppConfig>('config');
    expect(c.map_style_url).toMatch(/^https:/);
    expect(c.privacy_url).toMatch(/^https:\/\/inok\.info/);
  });
  it('without the key the API answers 403', async () => {
    const r = await fetch('https://inok.info/api/app/v1/config');
    expect(r.status).toBe(403);
  });
});
