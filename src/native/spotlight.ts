import { registerPlugin } from '@capacitor/core';
import { isIos, isNative } from './platform';
import { field, rowParts, type ChannelRow, type MonasteryRow } from '@/data/repo/types';
import { LANGS, type Lang } from '@/i18n';
import type { Snap } from '@/data/repo/reading';

/**
 * T10 (A-153 (3), iOS only; cloud_43): the iPhone's own search (Spotlight) finds the app's houses (all, with name / town / eparchy in the three
 * languages as keywords), the ★ saved articles and the stream channels - indexed ON the phone (Core Spotlight; nothing leaves it). Each item's
 * identifier IS the site address the app's ONE router opens (a card, an article, «Трансляції»); a kind is re-indexed whole (its domain
 * deleted first), so a removed item leaves the index. The houses list also feeds Siri's «Знайти обитель» (the App Group, T11).
 */
export interface SpotItem { id: string; title: string; desc: string; keywords: string[] }
export type SpotDomain = 'houses' | 'saved' | 'channels';

const uniq = (a: (string | null | undefined)[]) => [...new Set(a.filter((x): x is string => !!x && !!x.trim()))];

export function houseItems(rows: MonasteryRow[], lang: Lang, dicts: Record<Lang, Record<string, string>>): SpotItem[] {
  return rows.map((r) => {
    const p = rowParts(r, lang, dicts[lang]);
    return {
      id: `https://inok.info/monasteries/${r.code}/`,
      title: field(r, 'name', lang),
      desc: [p.town, p.eparchy].filter(Boolean).join(' · '),
      keywords: uniq(LANGS.flatMap((l) => { const q = rowParts(r, l, dicts[l]); return [field(r, 'name', l), field(r, 'short', l), q.town, q.eparchy]; })),
    };
  });
}
export const savedItems = (list: Snap[]): SpotItem[] =>
  list.map((a) => ({ id: a.site_url, title: a.title, desc: a.subtitle ?? '', keywords: uniq([a.title, a.subtitle]) }));
export const channelItems = (chs: ChannelRow[], lang: Lang): SpotItem[] =>
  chs.map((c) => ({ id: `https://inok.info/live/?channel=${c.id}`, title: field(c, 'title', lang), desc: '', keywords: uniq(LANGS.map((l) => field(c, 'title', l))) }));

const Native = registerPlugin<{ index(o: { domain: SpotDomain; items: SpotItem[] }): Promise<{ n: number }> }>('InokWidgets');

/** iOS only; never throws (an index is never worth a broken screen). */
export async function spotlight(domain: SpotDomain, items: SpotItem[]): Promise<void> {
  if (!isNative() || !isIos()) return;
  try { await Native.index({ domain, items }); } catch (e) { console.warn('InokSpotlight:', e instanceof Error ? e.message : String(e)); }
}
