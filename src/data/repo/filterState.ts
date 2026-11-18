import type { Db } from '@/data/db/types';
import type { FtsMode } from '@/data/db/schema';
import type { Lang } from '@/i18n';
import { listMonasteries, type ListQuery } from './monasteries';
import type { Filters, Sort } from './types';

/** The monasteries list's filter state: the facets + near-me + sort. ONE source for the list, the sheet's draft, the chips (A-15). */
export interface FilterState { filters: Filters; sort: Sort; radiusKm: number; nearMe: boolean }
export const EMPTY_FILTERS: FilterState = { filters: {}, sort: 'name', radiusKm: 25, nearMe: false };

export interface ListContext { q: string; lang: Lang; pos: { lat: number; lon: number } | null }

/** The ONE translation of a filter state into the list query (the list, and the sheet's live count — D19). */
export const listQueryOf = (s: FilterState, c: ListContext): ListQuery => ({
  q: c.q,
  filters: { ...s.filters, near: s.nearMe && c.pos ? { ...c.pos, radius_km: s.radiusKm } : null },
  sort: s.sort,
  lang: c.lang,
  at: c.pos,
});

/** How many houses the list shows for this state — what «Показати N обителей» promises before apply (D19). */
export const countFor = async (db: Db, fts: FtsMode, s: FilterState, c: ListContext): Promise<number> =>
  (await listMonasteries(db, fts, listQueryOf(s, c))).length;

/** A-21(в): the filter keys a user can clear one by one (the sheet's «×» and the chips above the list); «Скинути» clears all. */
export type FilterKey = 'type' | 'object_type' | 'subordination' | 'eparchy_id' | 'oblast_id' | 'has_stream' | 'near' | 'visited';
/** ONE reset of ONE filter: the others stay; their facet counts are recounted by the caller from the new state (A-13). */
export function clearOne(s: FilterState, k: FilterKey): FilterState {
  if (k === 'near') return { ...s, nearMe: false, sort: s.sort === 'distance' ? 'name' : s.sort };
  return { ...s, filters: { ...s.filters, [k]: k === 'has_stream' ? false : null } };
}
