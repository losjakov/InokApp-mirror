import type { LiveStatus } from '@/data/api/types';
import type { ChannelRow } from '@/data/repo/types';
import { pickLang, type Lang } from '@/i18n';
import { KYIV_TZ } from '@/i18n/date';

export type LiveItem = LiveStatus['live'][number];
export type ScheduledItem = NonNullable<LiveStatus['scheduled']>[number];
export interface Grouped {
  online: { channel: ChannelRow; live: LiveItem }[];
  scheduled: { channel: ChannelRow; at: string; title: LiveItem['title'] | undefined; video_id?: string }[]; // T8: the reminder's key
  offline: ChannelRow[];
}

/**
 * The site's /live/ page in three groups (D7). The site has ONE channel order and every tab is a filter of it — nothing is
 * re-sorted by start time (REVIEW cloud_03 D12, measured on /live/ 01.11): `channels` arrive in that order for the app's
 * language (`listChannels`, R-13 `sort_lang`) and each group keeps it. «Заплановані» = live-status `scheduled[]` (R-13).
 * A channel is in exactly one group; live wins over scheduled.
 */
export function groupChannels(channels: ChannelRow[], status: LiveStatus | null | undefined): Grouped {
  const live = new Map((status?.live ?? []).map((l) => [l.channel_id, l]));
  const sched = new Map((status?.scheduled ?? []).map((s) => [s.channel_id, s]));
  const g: Grouped = { online: [], scheduled: [], offline: [] };
  for (const channel of channels) {
    const l = live.get(channel.id);
    const s = sched.get(channel.id);
    if (l) g.online.push({ channel, live: l });
    else if (s) g.scheduled.push({ channel, at: s.scheduled_at, title: s.title, video_id: s.video_id });
    else g.offline.push(channel);
  }
  return g;
}

/** THE address of a YouTube video (A-4.2: the YouTube app opens it) — articles' videos, a live broadcast, a stream push. */
export const videoUrl = (id: string): string => `https://www.youtube.com/watch?v=${encodeURIComponent(id)}`;

/**
 * A-37 (owner 02.11.2026): what a tap on a channel opens, on EVERY screen — the broadcast itself while the channel is live NOW
 * (`live[].video_id` of the last live-status, polled 120 s), else the channel's page. Scheduled is not live: the channel page.
 */
export function channelUrl(channel: Pick<ChannelRow, 'id' | 'youtube_url'>, status: LiveStatus | null | undefined): string {
  const v = status?.live.find((l) => l.channel_id === channel.id)?.video_id;
  return v ? videoUrl(v) : channel.youtube_url;
}

/** The calendar strip: «неділя, 1 листопада · <first clause>» with the rest behind «…ще» (D7: one compact line, expands on tap). */
export function calendarStrip(cal: LiveStatus['calendar'], lang: Lang): { date: string; first: string; rest: string } | null {
  if (!cal) return null;
  const title = pickLang(cal.title, lang) ?? '';
  const d = new Date(`${cal.date}T00:00:00`);
  const date = Number.isNaN(d.getTime()) ? cal.date : new Intl.DateTimeFormat(lang, { weekday: 'long', day: 'numeric', month: 'long' }).format(d);
  // the first clause ends at the first «. » that is not part of an abbreviation like «Прор.», «Мч.», «єп.», «р.»
  const m = /^(.*?[^\s.]{3,}\.)\s+(?=\S)/.exec(title);
  const first = m ? m[1] : title;
  const rest = m ? title.slice(m[0].length) : '';
  return { date, first, rest };
}

/** THE time zone of Kyiv - one source in `src/i18n/date.ts` (A-15), re-exported for the calendar's callers. */
export { KYIV_TZ };

/** «2026-11-02» — today's date in Kyiv (the calendar's own day boundary, contract §3 R-24) */
export const kyivToday = (now: Date = new Date()): string =>
  new Intl.DateTimeFormat('en-CA', { timeZone: KYIV_TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);

/**
 * A-25 #5 (R-24): the saints calendar as /live/ prints it on a phone — its paragraphs (html-lite: the date bold, the week underlined,
 * the fast bold, the readings italic), the first `summary_paragraphs` folded, every paragraph unfolded; `tomorrow` = the site's
 * cron already shows the next day (after 16:00 Kyiv: `date` later than today in Kyiv) — the app says so. null body → null.
 */
export function calendarView(cal: LiveStatus['calendar'], lang: Lang, now: Date = new Date()): { paragraphs: string[]; summary: number; tomorrow: boolean } | null {
  const html = cal ? pickLang(cal.body ?? null, lang) : null;
  if (!cal || !html) return null;
  const paragraphs = html.match(/<p\b[^>]*>[\s\S]*?<\/p>/g) ?? [html];
  const summary = Math.min(paragraphs.length, Math.max(1, cal.summary_paragraphs ?? 2));
  return { paragraphs, summary, tomorrow: cal.date > kyivToday(now) };
}

/** D14: the row's second line is the stream's OWN title — YouTube titles often end in « † <channel name>», which the row
 *  already prints as its title; that tail is cut. */
export const streamTitle = (title: string | null | undefined): string => {
  const t = (title ?? '').trim();
  return t.replace(/\s*†.*$/s, '').trim() || t;
};

/** «Початок 09:00» — a local wall-clock time for the stream's start. */
export const timeOf = (iso: string, lang: Lang): string => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : new Intl.DateTimeFormat(lang, { hour: '2-digit', minute: '2-digit' }).format(d);
};
