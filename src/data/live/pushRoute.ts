import type { PushMessage } from '@/native/push';
import type { LiveStatus } from '@/data/api/types';
import { videoUrl } from './streams';

export type PushRoute = { kind: 'youtube'; url: string } | { kind: 'navigate'; to: string } | null;

/** Contract §4: a tap on a stream notification opens the stream (A-4.2: in the YouTube app; A-37: the broadcast itself — the push's
 *  `video_id`, else the channel's live one from the last live-status), on an article — the article. */
export function routeForPush(m: PushMessage, status?: LiveStatus | null): PushRoute {
  if (m.type === 'stream_live') {
    const v = m.data.video_id || status?.live.find((l) => String(l.channel_id) === m.data.channel_id)?.video_id;
    return v ? { kind: 'youtube', url: videoUrl(v) } : { kind: 'navigate', to: '/streams' };
  }
  // A-84 (h): the articles' summary (Notifier.TYPE_SUMMARY_TAP) -> Home, whose «Нове на сайті» shows the new items (and clears the tray)
  if (m.type === 'articles_summary') return { kind: 'navigate', to: '/home' };
  if (m.type === 'article') return { kind: 'navigate', to: m.data.id ? `/articles?id=${encodeURIComponent(m.data.id)}` : '/articles' };
  return null;
}

/** The notification's title in the app's language — `title` is a JSON string of the three languages (contract §4). */
export function pushTitle(m: PushMessage, lang: 'uk' | 'ru' | 'en'): string {
  try {
    const o = JSON.parse(m.data.title ?? '') as Record<string, string | null>;
    for (const l of [lang, 'uk', 'ru', 'en']) if (o[l]) return o[l]!;
  } catch { /* plain string */ }
  return m.data.title ?? '';
}
