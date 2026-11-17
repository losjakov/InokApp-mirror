import type { Article } from '@/data/api/types';
import type { Lang } from '@/i18n';
import { dataSource } from '@/data/source';

/**
 * R-54 (A-130): «Читайте також» / «Дивіться також» of ONE opened item. The site's set is the same for everybody within a UTC hour (a seeded
 * shuffle of id + hour; `Cache-Control` to the end of the hour), so an answer is kept in memory until that hour ends and never asked again
 * before it; a refusal / no answer is not kept (the block is simply absent). Never stored on the device: offline there is no block (A-130).
 */
const HOUR = 3_600_000;
export const READ_ALSO_MAX: Record<Article['kind'], number> = { publication: 3, video: 3, news: 4 };
const kept = new Map<string, { until: number; items: Article[] }>();
/** Test seam. */
export const _clearReadAlso = (): void => kept.clear();

export async function readAlso(a: Pick<Article, 'id' | 'kind'>, lang: Lang, now = Date.now()): Promise<Article[]> {
  const k = `${a.id}|${lang}`;
  const c = kept.get(k);
  if (c && now < c.until) return c.items;
  const r = await dataSource().related(a.id, lang);
  // the contract's own promise, kept here too: the opened item's kind, never itself, at most 3 (news 4)
  const items = (r.items ?? []).filter((x) => x.id !== a.id && x.kind === a.kind).slice(0, READ_ALSO_MAX[a.kind]);
  kept.set(k, { until: (Math.floor(now / HOUR) + 1) * HOUR, items });
  return items;
}
