// bundle_export.mjs - A-144 (cloud_43): THE release-build step of BOTH platforms - the LIVE directory INTO the app.
// GET manifest.json + directory_v1.json.gz (the site with the public X-Inok-App key, contract §1; the site silent -> the GitHub mirror, the
// gz checked against THAT host's manifest), sha256 of the gz == its manifest, the gz is a directory of that export_version, and write both to
// public/bundled/ (Vite copies public/ into dist/ -> the APK and the iOS bundle). No file / a bad sha / not an export -> exit 1: the build is RED,
// never a stale or a fixture copy. Run before `npm run build`:  node scripts/bundle_export.mjs [outDir]
import { createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { gunzipSync } from 'node:zlib';
import { pathToFileURL } from 'node:url';

export const SITE = 'https://inok.info/api/app/v1/export/';
export const MIRROR = 'https://losjakov.github.io/inok-app-data/export/'; // = MIRROR_BASE of src/data/api/client.ts (unit `bundleExport` pins both)
export const APP_KEY = 'eb741a6e64315c8aff6281ad13c21378'; // public (contract §1) - = APP_KEY of src/data/api/client.ts
const FILE = 'directory_v1.json.gz';
/** the name INSIDE the app: Android's asset packer unpacks a `*.gz` asset and drops the suffix (emulator 44917561352: the APK held an 8.5 MB
 *  `directory_v1.json`) - the same gzip bytes under a name it leaves alone (src/data/source.ts BUNDLED_SUFFIX) */
export const BUNDLED_SUFFIX = '.bin';

/** One host: the pair, verified, or a thrown Error naming what failed (never a key in the message). */
export async function fetchPair(base, fetchFn = fetch) {
  const headers = { 'X-Inok-App': APP_KEY, 'User-Agent': 'InokApp-build (bundle_export)' };
  const r = await fetchFn(`${base}manifest.json`, { headers });
  if (!r.ok) throw new Error(`${base}manifest.json: HTTP ${r.status}`);
  const text = await r.text();
  let man;
  try { man = JSON.parse(text); } catch { throw new Error(`${base}manifest.json: not JSON`); }
  const f = (man.files ?? []).find((x) => x.name === FILE);
  if (!man.export_version || !f?.sha256) throw new Error(`${base}manifest.json: no ${FILE} / export_version`);
  const g = await fetchFn(`${base}${FILE}`, { headers });
  if (!g.ok) throw new Error(`${base}${FILE}: HTTP ${g.status}`);
  const gz = Buffer.from(await g.arrayBuffer());
  const sha = createHash('sha256').update(gz).digest('hex');
  if (sha !== String(f.sha256).toLowerCase()) throw new Error(`${base}${FILE}: sha256 ${sha} != manifest ${f.sha256}`);
  let dir;
  try { dir = JSON.parse(gunzipSync(gz).toString('utf8')); } catch { throw new Error(`${base}${FILE}: not a gzip of JSON`); }
  if (dir.export_version !== man.export_version || !Array.isArray(dir.monasteries) || dir.monasteries.length === 0)
    throw new Error(`${base}${FILE}: not the export ${man.export_version} (got ${dir.export_version}, ${dir.monasteries?.length ?? 0} houses)`);
  return { man, manText: text, gz, houses: dir.monasteries.length };
}

/** The site first, the mirror when the site fails; both failed -> throws with both reasons. */
export async function bundle(out = 'public/bundled', fetchFn = fetch, log = console.log) {
  const errors = [];
  for (const [name, base] of [['site', SITE], ['mirror', MIRROR]]) {
    try {
      const p = await fetchPair(base, fetchFn);
      await mkdir(out, { recursive: true });
      await writeFile(`${out}/manifest.json`, p.manText);
      await writeFile(`${out}/${FILE}${BUNDLED_SUFFIX}`, p.gz);
      log(`bundled export ${p.man.export_version} from the ${name}: ${p.houses} houses, ${p.gz.length} b, sha256 ${p.man.files.find((x) => x.name === FILE).sha256.slice(0, 12)}`);
      return { from: name, ...p };
    } catch (e) {
      errors.push(`${name}: ${e.message}`);
    }
  }
  throw new Error(`no live export to bundle - ${errors.join(' | ')}`);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  bundle(process.argv[2]).catch((e) => { console.error(`::error::${e.message}`); process.exit(1); });
}
