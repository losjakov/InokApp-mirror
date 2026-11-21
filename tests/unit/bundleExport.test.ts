import { describe, expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import { gzipSync } from 'node:zlib';
import { mkdtempSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
// @ts-expect-error - a plain .mjs build script (no types)
import { APP_KEY as KEY_IN_SCRIPT, BUNDLED_SUFFIX as SUFFIX_IN_SCRIPT, MIRROR, SITE, bundle } from '../../scripts/bundle_export.mjs';
import { API_BASE, APP_KEY, MIRROR_BASE } from '@/data/api/client';
import { BUNDLED_SUFFIX } from '@/data/source';

// A-144 (1): THE release-build step - the LIVE pair, sha-checked, into public/bundled/; nothing good -> the build is red
const dir = { export_version: '2026-11-21T09:10:10Z', contract_version: 1, monasteries: [{ code: 1 }] };
const gz = gzipSync(Buffer.from(JSON.stringify(dir)));
const sha = createHash('sha256').update(gz).digest('hex');
const man = (s = sha, v = dir.export_version) => JSON.stringify({ export_version: v, files: [{ name: 'directory_v1.json.gz', sha256: s }] });
type Host = { man?: string; gz?: Buffer; status?: number };
const fetcher = (site: Host, mirror: Host, seen: { url: string; key?: string }[] = []) => async (url: string, o: { headers: Record<string, string> }) => {
  seen.push({ url, key: o.headers['X-Inok-App'] });
  const h = url.startsWith(SITE) ? site : mirror;
  if (h.status) return new Response('x', { status: h.status });
  return url.endsWith('manifest.json') ? new Response(h.man ?? '', { status: h.man ? 200 : 404 }) : new Response(h.gz ? new Uint8Array(h.gz) : null, { status: h.gz ? 200 : 404 });
};
const out = () => join(mkdtempSync(join(tmpdir(), 'bundle-')), 'bundled');

describe('bundle_export.mjs', () => {
  it('the site\'s pair (with the public key) -> public/bundled/, byte for byte', async () => {
    const o = out(); const seen: { url: string; key?: string }[] = [];
    const r = await bundle(o, fetcher({ man: man(), gz }, {}, seen), () => undefined);
    expect(r.from).toBe('site');
    expect(readFileSync(join(o, `directory_v1.json.gz${BUNDLED_SUFFIX}`)).equals(gz)).toBe(true); // never «.gz» last: Android unpacks those
    expect(BUNDLED_SUFFIX).toBe('.bin');
    expect(JSON.parse(readFileSync(join(o, 'manifest.json'), 'utf8')).export_version).toBe(dir.export_version);
    expect(seen.every((x) => x.key === APP_KEY)).toBe(true);
  });
  it('the site silent (503) -> the mirror\'s pair', async () => {
    const r = await bundle(out(), fetcher({ status: 503 }, { man: man(), gz }), () => undefined);
    expect(r.from).toBe('mirror');
  });
  it('a bad sha / a missing file / not the export of the manifest -> throws (exit 1), nothing written', async () => {
    for (const [site, mirror] of [[{ man: man('0'.repeat(64)), gz }, { man: man('0'.repeat(64)), gz }], [{ man: man() }, { status: 404 }],
      [{ man: man(sha, '2026-11-22T00:00:00Z'), gz }, { status: 500 }]] as [Host, Host][]) {
      const o = out();
      await expect(bundle(o, fetcher(site, mirror), () => undefined)).rejects.toThrow(/no live export to bundle/);
      expect(existsSync(join(o, 'manifest.json'))).toBe(false);
    }
  });
  it('ONE address each: the script\'s hosts and key are the app\'s', () => {
    expect(SITE).toBe(`${API_BASE}export/`);
    expect(MIRROR).toBe(MIRROR_BASE);
    expect(KEY_IN_SCRIPT).toBe(APP_KEY);
    expect(SUFFIX_IN_SCRIPT).toBe(BUNDLED_SUFFIX);
  });
});
