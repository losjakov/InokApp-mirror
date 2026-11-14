import type { Db } from './types';

export const SCHEMA_VERSION = 11; // 2: channel.sort; 3: R-10 card fields; 4: channel sort per language + place (R-13); 5: channel avatar (R-16);
// 6: canonical units (R-11); 7: the address in the search (A-23 #4: FTS column + norm_all; a re-import fills it);
// 8: the head's birth date (R-22) + the «Контакти» block (R-21, table `contacts`) + the eparchy page (R-15, PLAN 7)
// 9: the eparchy's own site (R-23, A-25 #4)
// 10: a house's square list thumbnail (R-25, A-29)
// 11: the card's SORT (R-31, A-44: the lavras first in every name-sorted list)

/** FTS mode decided at first run: trigram (typos + substrings), plain fts5 (whole-word prefix), or LIKE only. */
export type FtsMode = 'trigram' | 'fts5' | 'none';

/** The directory tables: rebuilt as `<name>_new` by the import and swapped in by RENAME (readers never see a gap). */
export const DIRECTORY_TABLES = ['oblast', 'eparchy', 'channel', 'dictionary', 'monastery', 'contacts'] as const;

export const directoryDdl = (suffix = ''): string => `
CREATE TABLE IF NOT EXISTS oblast${suffix}(id INTEGER PRIMARY KEY, name_uk TEXT, name_ru TEXT, name_en TEXT);
CREATE TABLE IF NOT EXISTS eparchy${suffix}(id INTEGER PRIMARY KEY, name_uk TEXT, name_ru TEXT, name_en TEXT, site_url TEXT,
  residents INTEGER, wiki_url TEXT, image_url TEXT, image_w INTEGER, image_h INTEGER, credit_json TEXT, about_uk TEXT, about_ru TEXT, about_en TEXT, own_site_url TEXT);
CREATE TABLE IF NOT EXISTS channel${suffix}(id INTEGER PRIMARY KEY, monastery_code INTEGER, title_uk TEXT, title_ru TEXT, title_en TEXT,
  youtube_channel_id TEXT, youtube_url TEXT, push_topic TEXT, sort_uk INTEGER, sort_ru INTEGER, sort_en INTEGER,
  eparchy_id INTEGER, oblast_id INTEGER, avatar_url TEXT, avatar_sha256 TEXT);
CREATE TABLE IF NOT EXISTS dictionary${suffix}(lang TEXT, key TEXT, value TEXT, PRIMARY KEY(lang, key));
CREATE TABLE IF NOT EXISTS contacts${suffix}(id INTEGER PRIMARY KEY, json TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS monastery${suffix}(
  code INTEGER PRIMARY KEY, site_url TEXT NOT NULL,
  name_uk TEXT NOT NULL, name_ru TEXT, name_en TEXT,
  short_uk TEXT, short_ru TEXT, short_en TEXT,
  official_uk TEXT, official_ru TEXT, official_en TEXT,
  type TEXT, object_type INTEGER, subordination INTEGER, status TEXT,
  eparchy_id INTEGER, oblast_id INTEGER,
  town_uk TEXT, town_ru TEXT, town_en TEXT,
  address_uk TEXT, address_ru TEXT, address_en TEXT,
  lat REAL, lon REAL,
  phones_json TEXT NOT NULL, email TEXT, website TEXT,
  head_uk TEXT, head_ru TEXT, head_en TEXT, head_born_uk TEXT, head_born_ru TEXT, head_born_en TEXT,
  head_role_uk TEXT, head_role_ru TEXT, head_role_en TEXT, head_document_uk TEXT, head_document_ru TEXT, head_document_en TEXT,
  founded_uk TEXT, founded_ru TEXT, founded_en TEXT, revival_uk TEXT, revival_ru TEXT, revival_en TEXT, links_json TEXT,
  parent_code INTEGER, parent_division_uk TEXT, parent_division_ru TEXT, parent_division_en TEXT, units_uk TEXT, units_ru TEXT, units_en TEXT,
  cover_url TEXT, cover_w INTEGER, cover_h INTEGER, cover_large_url TEXT, thumb_url TEXT, thumb_sha256 TEXT,
  has_gallery INTEGER NOT NULL DEFAULT 0, photo_count INTEGER NOT NULL DEFAULT 0, gallery_url TEXT,
  history_uk TEXT, history_ru TEXT, history_en TEXT, history_sources_json TEXT,
  has_stream INTEGER NOT NULL DEFAULT 0, sort INTEGER,
  norm_name TEXT NOT NULL, norm_town TEXT, norm_eparchy TEXT, norm_oblast TEXT, norm_head TEXT, norm_all TEXT NOT NULL,
  updated_at TEXT
);
`;

/** Indexes live on the final table name only (an index is dropped with its table; recreated after the RENAME). */
export const MONASTERY_INDEXES = `
CREATE INDEX IF NOT EXISTS ix_monastery_eparchy ON monastery(eparchy_id);
CREATE INDEX IF NOT EXISTS ix_monastery_oblast ON monastery(oblast_id);
CREATE INDEX IF NOT EXISTS ix_monastery_type ON monastery(type);
CREATE INDEX IF NOT EXISTS ix_monastery_geo ON monastery(lat, lon);
`;

const DDL = `
CREATE TABLE IF NOT EXISTS meta(key TEXT PRIMARY KEY, value TEXT);
${directoryDdl()}
${MONASTERY_INDEXES}
CREATE TABLE IF NOT EXISTS favourite(code INTEGER PRIMARY KEY, added_at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS settings(key TEXT PRIMARY KEY, value TEXT);
CREATE TABLE IF NOT EXISTS cache(key TEXT PRIMARY KEY, json TEXT NOT NULL, fetched_at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS article(id INTEGER NOT NULL, lang TEXT NOT NULL, kind TEXT, published_at TEXT, json TEXT NOT NULL,
  fetched_at INTEGER NOT NULL, PRIMARY KEY(id, lang));
CREATE INDEX IF NOT EXISTS ix_article_date ON article(lang, published_at);
CREATE TABLE IF NOT EXISTS article_rating(id INTEGER PRIMARY KEY, value INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS comment_hidden(id INTEGER PRIMARY KEY, hidden_at INTEGER NOT NULL);
`;

const FTS_COLUMNS = 'code UNINDEXED, name, town, eparchy, oblast, head, address';

export const ftsDdl = (mode: FtsMode, suffix = ''): string =>
  `CREATE VIRTUAL TABLE IF NOT EXISTS monastery_fts${suffix} USING fts5(${FTS_COLUMNS}, tokenize='${mode === 'trigram' ? 'trigram' : 'unicode61'}');`;

async function detectFts(db: Db): Promise<FtsMode> {
  for (const mode of ['trigram', 'fts5'] as const) {
    try {
      await db.exec(ftsDdl(mode));
      return mode;
    } catch {
      /* try the next mode */
    }
  }
  return 'none';
}

export async function getMeta(db: Db, key: string): Promise<string | null> {
  const r = await db.query<{ value: string }>('SELECT value FROM meta WHERE key = ?', [key]);
  return r[0]?.value ?? null;
}

export async function setMeta(db: Db, key: string, value: string): Promise<void> {
  await db.run('INSERT OR REPLACE INTO meta(key, value) VALUES (?, ?)', [key, value]);
}

/** The R-10 card fields (contract §2, 31.10): three languages each + the links as JSON. */
export const R10_COLUMNS = ['head_role_uk', 'head_role_ru', 'head_role_en', 'head_document_uk', 'head_document_ru', 'head_document_en',
  'founded_uk', 'founded_ru', 'founded_en', 'revival_uk', 'revival_ru', 'revival_en', 'links_json'];

/** The R-11 canonical-unit fields: the child's word in brackets per language, the parent's unit codes per language (JSON). */
export const R11_COLUMNS = ['parent_division_uk', 'parent_division_ru', 'parent_division_en', 'units_uk', 'units_ru', 'units_en'];

/** Columns each schema step adds to a table created by an older app: `[version, table, column, type]`. */
const ADDED: [number, string, string, string][] = [
  ...R10_COLUMNS.map((c): [number, string, string, string] => [3, 'monastery', c, 'TEXT']),
  ...['sort_uk', 'sort_ru', 'sort_en', 'eparchy_id', 'oblast_id'].map((c): [number, string, string, string] => [4, 'channel', c, 'INTEGER']),
  [5, 'channel', 'avatar_url', 'TEXT'],
  [5, 'channel', 'avatar_sha256', 'TEXT'],
  [6, 'monastery', 'parent_code', 'INTEGER'],
  ...R11_COLUMNS.map((c): [number, string, string, string] => [6, 'monastery', c, 'TEXT']),
  ...['head_born_uk', 'head_born_ru', 'head_born_en'].map((c): [number, string, string, string] => [8, 'monastery', c, 'TEXT']),
  ...['residents', 'image_w', 'image_h'].map((c): [number, string, string, string] => [8, 'eparchy', c, 'INTEGER']),
  ...['wiki_url', 'image_url', 'credit_json', 'about_uk', 'about_ru', 'about_en'].map((c): [number, string, string, string] => [8, 'eparchy', c, 'TEXT']),
  [9, 'eparchy', 'own_site_url', 'TEXT'],
  [10, 'monastery', 'thumb_url', 'TEXT'],
  [10, 'monastery', 'thumb_sha256', 'TEXT'],
  [11, 'monastery', 'sort', 'INTEGER'],
];

/** Schema upgrades for a database created by an older app: the missing columns are added (the app reads the tables before
 *  the next import) and the stored export_version is forgotten, so the next sync re-imports even an unchanged export and the
 *  new columns get their values. Idempotent. */
async function migrate(db: Db): Promise<void> {
  const have = Number((await getMeta(db, 'schema_version')) ?? '1');
  if (have === SCHEMA_VERSION) return;
  for (const t of new Set(ADDED.filter(([v]) => v > have).map(([, t]) => t))) {
    const cols = new Set((await db.query<{ name: string }>(`PRAGMA table_info(${t})`)).map((c) => c.name));
    for (const [v, tt, c, type] of ADDED) if (v > have && tt === t && !cols.has(c)) await db.exec(`ALTER TABLE ${t} ADD COLUMN ${c} ${type}`);
  }
  await db.run("DELETE FROM meta WHERE key = 'export_version'");
  await setMeta(db, 'schema_version', String(SCHEMA_VERSION));
}

/** Creates the schema if absent and records the FTS mode once (`meta.fts`). Idempotent. */
export async function ensureSchema(db: Db): Promise<FtsMode> {
  await db.exec(DDL);
  let mode = (await getMeta(db, 'fts')) as FtsMode | null;
  if (!mode) {
    mode = await detectFts(db);
    await setMeta(db, 'fts', mode);
    await setMeta(db, 'schema_version', String(SCHEMA_VERSION));
  } else if (mode !== 'none') {
    await db.exec(ftsDdl(mode)); // idempotent; in-memory DBs start empty every time
  }
  await migrate(db);
  return mode;
}
