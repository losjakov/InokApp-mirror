import type { Db } from '@/data/db/types';
import { normalize } from '@/data/search/normalize';
import type { Lang } from '@/i18n';
import { field, placeName } from './types';

/** One eparchy as the «Єпархії УПЦ» screens use it (A-14, R-15): `monasteries` counted in the DB (= the site's number, measured 53/53). */
export interface EparchyRow {
  id: number; name_uk: string; name_ru: string | null; name_en: string | null; site_url: string | null;
  residents: number | null; wiki_url: string | null; own_site_url: string | null; image_url: string | null; image_w: number | null; image_h: number | null;
  credit_json: string | null; about_uk: string | null; about_ru: string | null; about_en: string | null;
  monasteries: number;
}

const SELECT = `SELECT e.*, (SELECT COUNT(*) FROM monastery m WHERE m.eparchy_id = e.id) AS monasteries FROM eparchy e`;

/** The list: every eparchy with a house, the query matched in any language (the same folding as the house search), by name. */
export async function listEparchies(db: Db, lang: Lang, q = ''): Promise<EparchyRow[]> {
  const rows = (await db.query<EparchyRow>(SELECT)).filter((e) => e.monasteries > 0);
  const nq = normalize(q).trim();
  const hit = nq ? rows.filter((e) => [e.name_uk, e.name_ru, e.name_en].some((n) => normalize(n).includes(nq))) : rows;
  const coll = new Intl.Collator(lang);
  return hit.sort((a, b) => coll.compare(field(a, 'name', lang), field(b, 'name', lang)));
}

export async function getEparchy(db: Db, id: number): Promise<EparchyRow | null> {
  return (await db.query<EparchyRow>(`${SELECT} WHERE e.id = ?`, [id]))[0] ?? null;
}

/** «Київська єпархія» in the interface language (the dictionary's word, the list row's rule). */
export const eparchyTitle = (e: EparchyRow, lang: Lang, dict: Record<string, string>): string =>
  placeName(field(e, 'name', lang), dict.facet_eparchy, lang);
