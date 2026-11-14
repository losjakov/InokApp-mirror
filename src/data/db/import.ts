import type { Db, SqlValue } from './types';
import { CONTRACT_VERSION, type Directory, type Monastery } from '@/data/api/types';
import { normalize, stripHtml } from '@/data/search/normalize';
import { pickLang, type Lang } from '@/i18n';
import { DIRECTORY_TABLES, MONASTERY_INDEXES, directoryDdl, ftsDdl, setMeta, type FtsMode } from './schema';

export class ImportError extends Error {
  constructor(
    public code: 'contract_version' | 'required' | 'shape',
    message: string,
  ) {
    super(message);
  }
}

const REQUIRED: (keyof Monastery)[] = ['code', 'site_url', 'name', 'status', 'phones', 'updated_at'];

/** Throws ImportError before anything is written (contract §5: a higher version is refused; missing REQUIRED fails). */
export function validateDirectory(d: unknown): Directory {
  const x = d as Directory;
  if (!x || typeof x !== 'object') throw new ImportError('shape', 'export is not an object');
  if (typeof x.contract_version !== 'number') throw new ImportError('shape', 'contract_version missing');
  if (x.contract_version > CONTRACT_VERSION) throw new ImportError('contract_version', `contract ${x.contract_version} > ${CONTRACT_VERSION}`);
  for (const k of ['export_version', 'dictionary', 'oblasts', 'eparchies', 'channels', 'monasteries'] as const) {
    if (x[k] === undefined || x[k] === null) throw new ImportError('shape', `${k} missing`);
  }
  for (const m of x.monasteries) {
    for (const k of REQUIRED) {
      if (m[k] === undefined || m[k] === null) throw new ImportError('required', `monastery ${m?.code}: ${k} missing`);
    }
    if (!m.name.uk) throw new ImportError('required', `monastery ${m.code}: name.uk missing`);
    if (!Array.isArray(m.phones)) throw new ImportError('shape', `monastery ${m.code}: phones not an array`);
  }
  return x;
}

const L: Lang[] = ['uk', 'ru', 'en'];
const l3 = (o: Partial<Record<Lang, string | null>> | null | undefined): SqlValue[] => L.map((l) => o?.[l] ?? null);
const normAll = (o: Partial<Record<Lang, string | null>> | null | undefined): string =>
  Array.from(new Set(L.map((l) => normalize(o?.[l])).filter(Boolean))).join(' ');

const NEW = '_new';

/**
 * Replaces the whole directory inside ONE transaction, built in `<table>_new` staging tables and swapped in by
 * DROP + RENAME at the end (REF_app_architecture §2): on the device the plugin's bridge yields between rows, so
 * readers run inside the open transaction — they keep seeing the OLD tables until the swap; a failure rolls
 * everything back. Favourites, settings and cache are untouched. Returns the number of monasteries.
 */
export async function importDirectory(db: Db, dir: Directory, fts: FtsMode): Promise<number> {
  const d = validateDirectory(dir);
  const eparchyName = new Map(d.eparchies.map((e) => [e.id, e.name]));
  const oblastName = new Map(d.oblasts.map((o) => [o.id, o.name]));
  const streamCodes = new Set(d.channels.map((c) => c.monastery_code).filter((c): c is number => c != null));
  const tables: string[] = [...DIRECTORY_TABLES, ...(fts !== 'none' ? ['monastery_fts'] : [])];
  await db.transaction(async () => {
    for (const t of tables) await db.exec(`DROP TABLE IF EXISTS ${t}${NEW};`);
    await db.exec(directoryDdl(NEW));
    if (fts !== 'none') await db.exec(ftsDdl(fts, NEW));
    for (const o of d.oblasts) await db.run(`INSERT INTO oblast${NEW} VALUES (?,?,?,?)`, [o.id, ...l3(o.name)]);
    for (const e of d.eparchies)
      await db.run(`INSERT INTO eparchy${NEW} VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`, [e.id, ...l3(e.name), e.site_url ?? null, // R-15: the eparchy page
        e.residents ?? null, e.wiki_url ?? null, e.image?.url ?? null, e.image?.w ?? null, e.image?.h ?? null,
        e.image?.credit_url ? JSON.stringify(e.image.credit_url) : null, ...l3(e.about), e.own_site?.url ?? null]); // R-23
    // the /live/ order per language (R-13; null = the page does not show the channel) and the channel's own place line
    for (const c of d.channels)
      await db.run(`INSERT INTO channel${NEW} VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`, [
        c.id, c.monastery_code ?? null, ...l3(c.title), c.youtube_channel_id, c.youtube_url, c.push_topic,
        ...L.map((l) => c.sort_lang?.[l] ?? null), c.eparchy_id ?? null, c.oblast_id ?? null, c.avatar?.url ?? null, c.avatar?.sha256 ?? null,
      ]);
    for (const [lang, kv] of Object.entries(d.dictionary ?? {}))
      for (const [k, v] of Object.entries(kv)) await db.run(`INSERT INTO dictionary${NEW} VALUES (?,?,?)`, [lang, k, v]);
    for (const m of d.monasteries) {
      const ep = m.eparchy_id != null ? eparchyName.get(m.eparchy_id) : null;
      const ob = m.oblast_id != null ? oblastName.get(m.oblast_id) : null;
      const nName = normAll(m.name) + ' ' + normAll(m.short_name) + ' ' + normAll(m.official_name);
      const nTown = normAll(m.town);
      const nEp = normAll(ep);
      const nOb = normAll(ob);
      const nHead = normAll(m.head);
      const nAddr = normAll(m.address); // A-23 #4: the list searches the address it shows
      const nAll = [nName, nTown, nEp, nOb, nHead, nAddr].join(' ').replace(/\s+/g, ' ').trim();
      await db.run(
        `INSERT INTO monastery${NEW}(code, site_url, name_uk, name_ru, name_en, short_uk, short_ru, short_en,
          official_uk, official_ru, official_en, type, object_type, subordination, status, eparchy_id, oblast_id,
          town_uk, town_ru, town_en, address_uk, address_ru, address_en, lat, lon, phones_json, email, website,
          head_uk, head_ru, head_en, head_born_uk, head_born_ru, head_born_en, head_role_uk, head_role_ru, head_role_en, head_document_uk, head_document_ru, head_document_en,
          founded_uk, founded_ru, founded_en, revival_uk, revival_ru, revival_en, links_json,
          parent_code, parent_division_uk, parent_division_ru, parent_division_en, units_uk, units_ru, units_en,
          cover_url, cover_w, cover_h, cover_large_url, thumb_url, thumb_sha256, has_gallery, photo_count, gallery_url,
          history_uk, history_ru, history_en, history_sources_json, has_stream, sort,
          norm_name, norm_town, norm_eparchy, norm_oblast, norm_head, norm_all, updated_at)
         VALUES (${Array(76).fill('?').join(',')})`,
        [
          m.code, m.site_url, ...l3(m.name), ...l3(m.short_name), ...l3(m.official_name),
          m.type ?? null, m.object_type ?? null, m.subordination ?? null, 'active', // A-6: any status is shown as active
          m.eparchy_id ?? null, m.oblast_id ?? null, ...l3(m.town), ...l3(m.address),
          m.lat ?? null, m.lon ?? null, JSON.stringify(m.phones ?? []), m.email ?? null, m.website ?? null,
          ...l3(m.head), ...l3(m.head_born), ...l3(m.head_role), ...l3(m.head_document), ...l3(m.founded), ...l3(m.revival), JSON.stringify(m.links ?? []), // R-10
          m.parent_code ?? null, ...l3(m.parent_division), ...L.map((l) => JSON.stringify(m.units?.[l] ?? [])), // R-11
          m.cover?.url ?? null, m.cover?.w ?? null, m.cover?.h ?? null, m.cover_large?.url ?? null,
          m.thumb?.url ?? null, m.thumb?.sha256 ?? null, // R-25
          m.has_gallery ? 1 : 0, m.photo_count ?? 0, m.gallery_url ?? null,
          ...l3(m.history), JSON.stringify(m.history_sources ?? []), streamCodes.has(m.code) ? 1 : 0, m.sort ?? null, // R-31
          nName.trim(), nTown, nEp, nOb, nHead, nAll, m.updated_at,
        ],
      );
      if (fts !== 'none')
        await db.run(`INSERT INTO monastery_fts${NEW}(code, name, town, eparchy, oblast, head, address) VALUES (?,?,?,?,?,?,?)`, [
          m.code, nName.trim(), nTown, nEp, nOb, nHead, nAddr,
        ]);
    }
    // R-21: the «Контакти» block, swapped with the directory (one row; absent in an older export = no row, the page says so)
    if (d.contacts) await db.run(`INSERT INTO contacts${NEW} VALUES (1, ?)`, [JSON.stringify(d.contacts)]);
    // the swap — ONE statement per call: the plugin's execute runs only the first statement of a one-line string
    for (const t of tables) {
      await db.exec(`DROP TABLE IF EXISTS ${t};`);
      await db.exec(`ALTER TABLE ${t}${NEW} RENAME TO ${t};`);
    }
    for (const stmt of MONASTERY_INDEXES.split('\n').filter((l) => l.trim())) await db.exec(stmt);
    await setMeta(db, 'export_version', d.export_version);
    await setMeta(db, 'contract_version', String(d.contract_version));
    await setMeta(db, 'imported_at', new Date().toISOString());
  });
  return d.monasteries.length;
}

/** Plain text of a history for previews (not indexed: spec §3 — no search inside histories). */
export const historyPreview = (h: Partial<Record<Lang, string | null>> | null, lang: Lang): string =>
  stripHtml(pickLang(h, lang)).replace(/\s+/g, ' ').trim();
