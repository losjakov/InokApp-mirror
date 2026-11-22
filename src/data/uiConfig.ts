import type { Db } from '@/data/db/types';
import { cacheGet, cacheSet } from '@/data/repo/cache';
import { dataSource } from '@/data/source';
import { LANGS, type Lang } from '@/i18n';

/**
 * A-162 (2) (cloud_44): THE small settings file from the site - `GET /api/app/v1/ui-config` (public key, contract § «ui-config», PLANNED: the
 * site answers 404 until its own ruling). VALUES the app already knows how to use - never code, never layout:
 *   dots      the widgets' kind dots, #RRGGBB per theme x kind (news / pub / video);
 *   max_rows  the most rows a 4x2 / 4x4 / medium / large widget may show (never more than fit: 0 = as many as fit);
 *   labels    the three widget headers x uk / ru / en («Зараз в ефірі», «Найближчі трансляції», «Нове на сайті»);
 *   home      the order of Home's blocks - a permutation of HOME_BLOCKS.
 * Unknown keys are ignored; a bad value = ITS default; 404 / offline / bad JSON = ALL the defaults (= today's look). Asked at most once per
 * start and 12 h (the last good file is used meanwhile), read by Home and by the widgets (the JSON the app writes, src/native/widgets.ts).
 */
export const HOME_BLOCKS = ['live', 'near', 'new', 'popular'] as const;
export type HomeBlock = (typeof HOME_BLOCKS)[number];
export const DOT_KINDS = ['news', 'pub', 'video'] as const;
type Dots = Record<'light' | 'dark', Record<(typeof DOT_KINDS)[number], string>>;
export type WidgetLabel = 'live' | 'upcoming' | 'new';
export interface UiConfig { dots: Dots; max_rows: number; labels: Partial<Record<Lang, Partial<Record<WidgetLabel, string>>>>; home: HomeBlock[] }

/** the built-in values = the CD kit's colours (reports/mockups/a1018/widgets/README.md «Colours») and today's Home order */
export const UI_DEFAULTS: UiConfig = {
  dots: { light: { news: '#1F6FC5', pub: '#A87A00', video: '#7A4FC4' }, dark: { news: '#5AA9F0', pub: '#E6B437', video: '#B48CF0' } },
  max_rows: 0,
  labels: {},
  home: [...HOME_BLOCKS],
};
export const UI_KEY = 'ui-config';
export const UI_MAX_AGE_MS = 12 * 3600 * 1000;
const HEX = /^#[0-9A-Fa-f]{6}$/;
const obj = (x: unknown): Record<string, unknown> | null => (x && typeof x === 'object' && !Array.isArray(x) ? (x as Record<string, unknown>) : null);

/** The file's VALUES, each checked on its own (a bad one = its default); anything that is not an object = all the defaults. Pure: unit uiConfig. */
export function parseUiConfig(raw: unknown): UiConfig {
  const o = obj(raw);
  if (!o) return UI_DEFAULTS;
  const dots = JSON.parse(JSON.stringify(UI_DEFAULTS.dots)) as Dots; // (no structuredClone: the old floor, Chrome 89)
  const d = obj(o.dots);
  for (const th of ['light', 'dark'] as const) for (const k of DOT_KINDS) {
    const v = obj(d?.[th])?.[k];
    if (typeof v === 'string' && HEX.test(v)) dots[th][k] = v;
  }
  const max_rows = Number.isInteger(o.max_rows) && (o.max_rows as number) >= 1 && (o.max_rows as number) <= 20 ? (o.max_rows as number) : UI_DEFAULTS.max_rows;
  const labels: UiConfig['labels'] = {};
  const l = obj(o.labels);
  for (const lang of LANGS) for (const k of ['live', 'upcoming', 'new'] as const) {
    const v = obj(l?.[lang])?.[k];
    if (typeof v === 'string' && v.trim().length >= 1 && v.length <= 40 && !/[<>{}]/.test(v)) (labels[lang] ??= {})[k] = v.trim();
  }
  const h = o.home;
  const home = Array.isArray(h) && h.length === HOME_BLOCKS.length && HOME_BLOCKS.every((b) => h.includes(b)) ? (h as HomeBlock[]) : UI_DEFAULTS.home;
  return { dots, max_rows, labels, home: [...home] };
}

/** The settings for this start: the last good file while younger than 12 h, else the site's answer; any failure = the defaults. Never throws. */
export async function loadUiConfig(db: Db, now: () => number = Date.now): Promise<UiConfig> {
  try {
    const kept = await cacheGet<unknown>(db, UI_KEY);
    if (kept && now() - kept.fetchedAt < UI_MAX_AGE_MS) return parseUiConfig(kept.value);
  } catch { /* no cache - ask */ }
  try {
    const raw = await dataSource().uiConfig();
    await cacheSet(db, UI_KEY, raw);
    return parseUiConfig(raw);
  } catch {
    return UI_DEFAULTS; // 404 (the site has no file yet) / offline / bad JSON: today's look
  }
}
