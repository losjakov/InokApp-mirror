import { registerPlugin } from '@capacitor/core';
import { isNative } from './platform';
import { APP_KEY } from '@/data/api/client';
import { photoName } from '@/data/photos/store';
import { field, rowSubtitle, type ChannelRow } from '@/data/repo/types';
import type { Article, LiveStatus } from '@/data/api/types';
import type { Reminder } from './reminders';
import type { Lang, Translate } from '@/i18n';
import { sortArticles } from '@/data/repo/articleOrder';

/**
 * T9 (A-153 (2), A-155, A-156 (1); cloud_43): THE data the three home-screen widgets read - written by the app on every refresh (live-status,
 * the feed, the directory, the reminders, the language). The widget refreshes ITSELF while the app is closed (live-status, articles?limit=3
 * with the public key below); channel names / pictures and the words come only from here. Android: SharedPreferences «CapacitorStorage»
 * key `widgets` + every widget redrawn; iOS: the App Group `group.info.inok.app` + WidgetCenter.reloadAllTimelines (InokWidgetsPlugin).
 */
export const WIDGET_WORDS = ['live_title', 'live_small', 'upcoming_title', 'nearest', 'new_title', 'more', 'updated', 'none_live', 'none_upcoming', 'none_new',
  'tomorrow', 'next', 'remind', 'say_live', 'say_planned', 'say_news', 'say_pub', 'say_video'] as const;
/** 1.0.18 (A-161 (1), A-163): the newest items of ANY kind by their placing on the site (`created`) - as many as the largest widget shows */
export const WIDGET_ITEMS = 8;

export interface WidgetJson {
  v: 1; lang: Lang; updated_at: string;
  api: { base: string; key: string };
  words: Record<(typeof WIDGET_WORDS)[number], string>;
  channels: Record<string, { name: string; place: string; avatar: string }>;
  status: Pick<LiveStatus, 'live' | 'scheduled'> | null;
  items: { id: number; kind: string; title: string; published_at: string; created_at: string; site_url: string }[];
  reminders: { channel_id: number; video_id: string; at: string }[];
}

/** The JSON (pure: unit `widgets`). The channel picture = the app's KEPT file name (photoName, the same file the rows show offline). */
export function widgetJson(o: { t: Translate; lang: Lang; channels: ChannelRow[]; dict: Record<string, string>; status: LiveStatus | null; items: Article[];
  reminders: Reminder[]; now: number }): WidgetJson {
  const words = Object.fromEntries(WIDGET_WORDS.map((k) => [k, o.t(`widget.${k}`)])) as WidgetJson['words'];
  const channels: WidgetJson['channels'] = {};
  for (const c of o.channels)
    channels[String(c.id)] = { name: field(c, 'title', o.lang), place: rowSubtitle(c, o.lang, o.dict), avatar: c.avatar_url ? photoName(`ch${c.id}`, c.avatar_url, c.avatar_sha256) : '' };
  return {
    v: 1, lang: o.lang, updated_at: new Date(o.now).toISOString(),
    api: { base: 'https://inok.info/api/app/v1/', key: APP_KEY },
    words, channels,
    status: o.status ? { live: o.status.live, scheduled: o.status.scheduled ?? [] } : null,
    items: sortArticles(o.items, 'created').slice(0, WIDGET_ITEMS)
      .map((a) => ({ id: a.id, kind: a.kind, title: a.title, published_at: a.published_at, created_at: a.created_at ?? a.published_at, site_url: a.site_url })),
    reminders: o.reminders.map((r) => ({ channel_id: r.channel_id, video_id: r.video_id, at: r.at })),
  };
}

const Native = registerPlugin<{ set(o: { json: string }): Promise<void> }>('InokWidgets');

/** Hands the JSON to the widgets (the browser ring: window.__inokWidgets). Never throws - a widget is never worth a broken screen. */
export async function setWidgets(j: WidgetJson): Promise<void> {
  const json = JSON.stringify(j);
  if (!isNative()) { (globalThis as { __inokWidgets?: string }).__inokWidgets = json; return; }
  try { await Native.set({ json }); } catch (e) { console.warn('InokWidgets:', e instanceof Error ? e.message : String(e)); }
}
