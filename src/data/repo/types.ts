import type { Lang } from '@/i18n';

/** One row of `monastery` as the screens use it (fields in all three languages; pick with `field()`). */
export interface MonasteryRow {
  code: number;
  site_url: string;
  name_uk: string; name_ru: string | null; name_en: string | null;
  short_uk: string | null; short_ru: string | null; short_en: string | null;
  official_uk: string | null; official_ru: string | null; official_en: string | null;
  type: string | null; object_type: number | null; subordination: number | null; status: string;
  eparchy_id: number | null; oblast_id: number | null;
  town_uk: string | null; town_ru: string | null; town_en: string | null;
  address_uk: string | null; address_ru: string | null; address_en: string | null;
  lat: number | null; lon: number | null;
  phones_json: string; email: string | null; website: string | null;
  head_uk: string | null; head_ru: string | null; head_en: string | null;
  head_born_uk?: string | null; head_born_ru?: string | null; head_born_en?: string | null;
  head_role_uk: string | null; head_role_ru: string | null; head_role_en: string | null;
  head_document_uk: string | null; head_document_ru: string | null; head_document_en: string | null;
  founded_uk: string | null; founded_ru: string | null; founded_en: string | null;
  revival_uk: string | null; revival_ru: string | null; revival_en: string | null;
  links_json: string | null;
  parent_code: number | null;
  /** R-31 (A-44): the card's SORT (null = an export before R-31 = the default) */
  sort?: number | null;
  parent_division_uk: string | null; parent_division_ru: string | null; parent_division_en: string | null;
  units_uk: string | null; units_ru: string | null; units_en: string | null;
  cover_url: string | null; cover_w: number | null; cover_h: number | null; cover_large_url: string | null;
  /** R-25 / A-29: the square picture /monasteries/ prints in its list; its sha256 = the cache version */
  thumb_url: string | null; thumb_sha256: string | null;
  has_gallery: number; photo_count: number; gallery_url: string | null;
  history_uk: string | null; history_ru: string | null; history_en: string | null; history_sources_json: string | null;
  has_stream: number;
  norm_name: string; norm_all: string;
  updated_at: string | null;
  /** the eparchy's and oblast's names (LEFT JOIN in the repo) — the list row's second line */
  eparchy_uk?: string | null; eparchy_ru?: string | null; eparchy_en?: string | null;
  oblast_uk?: string | null; oblast_ru?: string | null; oblast_en?: string | null;
  /** filled by the repo when the user's position is known */
  distance_km?: number;
}

type L3<K extends string> = `${K}_uk` | `${K}_ru` | `${K}_en`;
/** D22: what a LIST carries (list rows, the map, «Поруч», the eparchy's houses) — the card's long texts stay in the card's query */
export type MonasteryListRow = Omit<MonasteryRow, L3<'head_document' | 'founded' | 'revival' | 'parent_division' | 'units' | 'history'>
  | 'links_json' | 'history_sources_json' | 'norm_all'>;

/** PLAN item 6 (cloud_10): what a MAP needs of a house — the marker (place, icon), its label and the lavra split; nothing of the list's texts.
 *  316 houses: 1 082 173 b as list rows → the map points (measured on the live export, tests/unit/mapPoints.test.ts). */
export type MapPoint = Pick<MonasteryListRow, 'code' | 'lat' | 'lon' | 'object_type' | 'subordination' | 'type' | 'has_stream'
  | 'name_uk' | 'name_ru' | 'name_en' | 'town_uk' | 'town_ru' | 'town_en'> & { distance_km?: number };
export const MAP_POINT_COLS = ['code', 'lat', 'lon', 'object_type', 'subordination', 'type', 'has_stream', 'name_uk', 'name_ru', 'name_en', 'town_uk', 'town_ru', 'town_en'] as const;

/** «Київська» + the dictionary's «Єпархія» → «Київська єпархія» (ONE rule for the list row, the streams and the eparchy screens). */
export const placeName = (name: string, label: string | undefined, lang: Lang): string =>
  name ? (label ? `${name} ${label.toLocaleLowerCase(lang)}` : name) : '';

/** The list row's second line, in parts: «Київ · Київська область · Київська єпархія» (D5; owner 31.10: oblast before the
 *  eparchy, the eparchy set off in colour). The words «область» / «єпархія» come from the export's dictionary. */
export function rowParts(row: PlaceNames, lang: Lang, dict: Record<string, string>): { town: string; oblast: string; eparchy: string } {
  const withLabel = (name: string, label: string | undefined) => placeName(name, label, lang);
  return {
    town: field(row, 'town', lang),
    // oblast code 1 = Crimea (contract §2) — not an oblast: the bare name, as the site prints «Крим»
    oblast: row.oblast_id === 1 ? field(row, 'oblast', lang) : withLabel(field(row, 'oblast', lang), dict.facet_oblast),
    eparchy: withLabel(field(row, 'eparchy', lang), dict.facet_eparchy),
  };
}
/**
 * The head's line of the list row, as /monasteries/ prints it: «Намісник (ігумен) - митрополит Павел (Лебідь), Вишгородський і
 * Чорнобильський» — the post (capitalised), the person (the site sets it in bold: title, name, surname in brackets), the rest
 * after the first comma that follows the person (the see), then (R-22) «19.04.1961 р. н.» — the date as the export carries it +
 * dictionary label_head_born; no date = no tail. null = no head published.
 */
export function headLine(row: object, lang: Lang, dict: Record<string, string> = {}): { role: string; person: string; rest: string; born: string } | null {
  const head = field(row, 'head', lang);
  if (!head) return null;
  const role = field(row, 'head_role', lang);
  const close = head.indexOf(')');
  const cut = head.indexOf(', ', close >= 0 ? close : 0);
  return {
    role: role ? role.charAt(0).toLocaleUpperCase(lang) + role.slice(1) : '',
    person: cut >= 0 ? head.slice(0, cut) : head,
    rest: cut >= 0 ? head.slice(cut + 2) : '',
    born: headBorn(row, lang, dict),
  };
}

/** R-22: «19.04.1961 р. н.» as /monasteries/ prints it; R-40: the CARD prints «19.04.1961 року народження» (`label_head_born_card`;
 *  an older export without the key -> the list's word). '' without a date (ONE source for the list and the card). */
export function headBorn(row: object, lang: Lang, dict: Record<string, string>, where: 'list' | 'card' = 'list'): string {
  const d = field(row, 'head_born', lang);
  const label = where === 'card' ? dict.label_head_born_card || dict.label_head_born : dict.label_head_born;
  return d ? [d, label].filter(Boolean).join(' ') : '';
}

export function rowSubtitle(row: PlaceNames, lang: Lang, dict: Record<string, string>): string {
  const p = rowParts(row, lang, dict);
  return [p.town, p.oblast, p.eparchy].filter(Boolean).join(' · ');
}

export interface NamedRow { id: number; name_uk: string; name_ru: string | null; name_en: string | null; site_url?: string | null }
export interface ChannelRow extends PlaceNames {
  id: number; monastery_code: number | null;
  title_uk: string; title_ru: string | null; title_en: string | null;
  youtube_channel_id: string; youtube_url: string; push_topic: string;
  sort_uk: number | null; sort_ru: number | null; sort_en: number | null; eparchy_id: number | null;
  avatar_url?: string | null; avatar_sha256?: string | null;
}

/** Names a row may carry from LEFT JOINs (the list row and the streams row print «town · oblast · eparchy»). */
export interface PlaceNames {
  town_uk?: string | null; town_ru?: string | null; town_en?: string | null;
  oblast_id?: number | null;
  eparchy_uk?: string | null; eparchy_ru?: string | null; eparchy_en?: string | null;
  oblast_uk?: string | null; oblast_ru?: string | null; oblast_en?: string | null;
}

/** Picks `<prefix>_<lang>` with the uk → ru → en fallback. */
export function field(row: object, prefix: string, lang: Lang): string {
  const r = row as Record<string, unknown>;
  for (const l of [lang, 'uk', 'ru', 'en']) {
    const v = r[`${prefix}_${l}`];
    if (typeof v === 'string' && v !== '') return v;
  }
  return '';
}

export interface Filters {
  type?: 'm' | 'f' | null;
  object_type?: number | null;
  subordination?: number | null;
  eparchy_id?: number | null;
  oblast_id?: number | null;
  has_stream?: boolean;
  near?: { lat: number; lon: number; radius_km: number } | null;
  /** A-133 «Я тут був»: 'yes' = the marked houses, 'no' = not marked yet; null / absent = all */
  visited?: 'yes' | 'no' | null;
}
export type Sort = 'name' | 'distance';
/** A facet value and the number of houses it would show under the other active filters (A-13). */
export interface FacetValue<V> { v: V; n: number }
export interface Facets {
  types: FacetValue<string>[];
  object_types: FacetValue<number>[];
  subordinations: FacetValue<number>[];
  eparchies: (NamedRow & { n: number })[];
  oblasts: (NamedRow & { n: number })[];
  /** houses with a stream under the other filters */
  streams: number;
  /** A-133: the houses marked «Я тут був» / not marked, under every OTHER active filter (the sheet's three states count them) */
  visited: { yes: number; no: number };
}

/** The site's own rule (contract §2, R-10): the last opening is labelled «Останнє відкриття (відродження)» when the house has
 *  a «Заснований» line, else plainly «Відкриття». */
export const revivalLabel = (row: MonasteryRow, lang: Lang, dict: Record<string, string>): string =>
  (field(row, 'founded', lang) ? dict.label_revival : dict.label_opening) ?? '';
