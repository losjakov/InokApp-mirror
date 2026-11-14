import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { calendarStrip, channelUrl, groupChannels, videoUrl } from '@/data/live/streams';
import { routeForPush as route } from '@/data/live/pushRoute';
import { listChannels } from '@/data/repo/channels';
import type { LiveStatus } from '@/data/api/types';
import { importedDb } from './helpers';

const status: LiveStatus = JSON.parse(readFileSync(new URL('../../fixtures/live-status.json', import.meta.url), 'utf8'));

const pos = (ids: number[], order: number[]) => ids.map((id) => order.indexOf(id));
const ascending = (xs: number[]) => xs.every((x, i) => i === 0 || xs[i - 1] < x);

/** REVIEW cloud_02 D7 + cloud_03 D12: the streams screen groups channels as /live/ does, every group in the page's ONE order. */
describe('streams grouping', () => {
  it('every group keeps the /live/ order of the app language (R-13 sort_lang), never the start time; each channel once', async () => {
    const { db } = await importedDb();
    for (const lang of ['uk', 'ru', 'en'] as const) {
      const channels = await listChannels(db, lang);
      expect(ascending(channels.map((c) => c[`sort_${lang}`]!))).toBe(true);
      const order = channels.map((c) => c.id);
      const g = groupChannels(channels, status);
      expect(ascending(pos(g.online.map((x) => x.channel.id), order))).toBe(true);
      expect(ascending(pos(g.scheduled.map((x) => x.channel.id), order))).toBe(true);
      expect(ascending(pos(g.offline.map((c) => c.id), order))).toBe(true);
      const all = [...g.online.map((x) => x.channel.id), ...g.scheduled.map((x) => x.channel.id), ...g.offline.map((c) => c.id)];
      expect([...all].sort()).toEqual([...order].sort());
    }
    // the old rule («earliest start first») would put 1685 (started 30.10) above 1686 (31.10); the site prints 1686 first
    const g = groupChannels(await listChannels(db, 'uk'), status);
    const online = g.online.map((x) => x.channel.id);
    expect(online.indexOf(1686)).toBeLessThan(online.indexOf(1685));
    const starts = g.online.map((x) => x.live.started_at);
    expect(starts).not.toEqual([...starts].sort());
    // en differs from uk (window C's measurement): 1703 is 23rd in uk, 10th in en
    const en = (await listChannels(db, 'en')).map((c) => c.id);
    expect(en.indexOf(1703)).toBeLessThan(en.indexOf(1704));
  });
  it('«Заплановані» = live-status scheduled[] (R-13); a live channel is never scheduled', async () => {
    const { db } = await importedDb();
    const channels = await listChannels(db, 'uk');
    expect(status.scheduled!.length).toBeGreaterThan(0);
    const g = groupChannels(channels, { ...status, scheduled: [...status.scheduled!, { channel_id: 1686, scheduled_at: '2026-11-01T09:00:00Z' }] });
    expect(g.scheduled.map((x) => x.channel.id).sort()).toEqual(status.scheduled!.map((s) => s.channel_id).filter((id) => !status.live.some((l) => l.channel_id === id)).sort());
    expect(g.scheduled.some((x) => x.channel.id === 1686)).toBe(false);
  });
  it('a channel row prints its own eparchy and oblast (R-13), also without a house', async () => {
    const { db } = await importedDb();
    const rows = await listChannels(db, 'uk');
    const c = rows.find((x) => x.id === 1688)!; // Одеська єпархія: no house
    expect(c.monastery_code).toBeNull();
    expect(c.eparchy_uk).toBeTruthy();
    expect(c.oblast_uk).toBeTruthy();
    expect(rows.find((x) => x.id === 1707)!.eparchy_uk).toBeNull();
  });
  it('no status → everything offline', async () => {
    const { db } = await importedDb();
    const g = groupChannels(await listChannels(db, 'uk'), null);
    expect(g.online).toEqual([]);
    expect(g.offline.length).toBe(25);
  });
});

describe('calendar strip', () => {
  it('date in words · first clause · the rest behind «…ще»', () => {
    const s = calendarStrip(status.calendar, 'uk')!;
    expect(s.date).toMatch(/понеділок/);
    expect(s.date).toMatch(/2 листопада/);
    expect(s.first).toBe('Cедмиця 23-тя після П’ятидесятниці.');
    expect(s.rest.startsWith('Вмч. Артемія')).toBe(true);
    expect(calendarStrip(status.calendar, 'en')!.first).toBe('Week 23rd after Pentecost.');
    expect(calendarStrip(null, 'uk')).toBeNull();
  });
});

import { streamTitle } from '@/data/live/streams';
describe('stream title (D14)', () => {
  it('the second line is the stream own title: the « † <channel>» tail is cut, nothing appended', () => {
    expect(streamTitle('Пряма трансляція богослужіння † Свято-Успенська Почаївська Лавра')).toBe('Пряма трансляція богослужіння');
    expect(streamTitle(status.live.find((l) => l.channel_id === 1686)!.title.uk)).toBe('Пряма трансляція богослужіння');
    expect(streamTitle('Богослужіння')).toBe('Богослужіння');
    expect(streamTitle('† Лише хрест')).toBe('† Лише хрест'); // never empty
    expect(streamTitle(null)).toBe('');
  });
});

import { fixtureDirectory, freshDb } from './helpers';
import { importDirectory } from '@/data/db/import';
describe('channel avatar (A-17 / R-16)', () => {
  it('every channel of the live export carries its own avatar + sha256 (its version); avatar null → none (placeholder)', async () => {
    const { db, fts } = await freshDb();
    const d = fixtureDirectory();
    d.channels[1].avatar = null;
    await importDirectory(db, d, fts);
    const rows = await listChannels(db, 'uk');
    const c = rows.find((x) => x.id === 1695)!;
    expect(c.avatar_url).toBe('https://inok.info/images/live/1695/channel/ico150.webp');
    expect(c.avatar_sha256).toMatch(/^[0-9a-f]{64}$/);
    expect(new Set(rows.filter((x) => x.avatar_url).map((x) => x.avatar_url)).size).toBe(24); // each its own picture
    expect(rows.find((x) => x.id === d.channels[1].id)!.avatar_url).toBeNull();
  });
});

import { calendarView, kyivToday } from '@/data/live/streams';
describe('the saints calendar in paragraphs (A-25 #5, R-24)', () => {
  it('every paragraph of the /live/ block; folded = summary_paragraphs; each language', () => {
    for (const lang of ['uk', 'ru', 'en'] as const) {
      const v = calendarView(status.calendar, lang, new Date('2026-11-01T15:30:00Z'))!;
      expect(v.paragraphs).toHaveLength(5);
      expect(v.summary).toBe(2);
      expect(v.paragraphs[0]).toMatch(/^<p><strong>/); // the date, bold
      expect(v.paragraphs[1]).toMatch(/^<p><u>/); // the week, underlined
      expect(v.paragraphs[4]).toMatch(/^<p><em>/); // the readings, italic
    }
  });
  it('the 16:00 note: the calendar of 2 Nov is «tomorrow» at 17:30 Kyiv on 1 Nov, not on 2 Nov', () => {
    expect(kyivToday(new Date('2026-11-01T15:30:00Z'))).toBe('2026-11-01'); // 17:30 Kyiv (EET, UTC+2)
    expect(calendarView(status.calendar, 'uk', new Date('2026-11-01T15:30:00Z'))!.tomorrow).toBe(true);
    expect(calendarView(status.calendar, 'uk', new Date('2026-11-02T07:00:00Z'))!.tomorrow).toBe(false);
    expect(kyivToday(new Date('2026-11-01T22:30:00Z'))).toBe('2026-11-02'); // 00:30 Kyiv: the new day
  });
  it('no body (an older cache) → null: the one-line strip stays', () => {
    expect(calendarView({ ...status.calendar!, body: null }, 'uk')).toBeNull();
    expect(calendarView(null, 'uk')).toBeNull();
  });
});

/** A-37: the decision table of «open a channel» — every screen, one helper */
describe('A-37: a channel live NOW opens its broadcast', () => {
  const ch = (id: number) => ({ id, youtube_url: `https://www.youtube.com/channel/UC${id}` });
  const st = { at: '', live: [{ channel_id: 3, video_id: 'LIVE3', title: {}, started_at: '' }], scheduled: [{ channel_id: 4, video_id: 'SOON4', scheduled_at: '' }], calendar: null } as unknown as LiveStatus;
  it.each([
    ['live now → the video', 3, st, videoUrl('LIVE3')],
    ['scheduled only → the channel page', 4, st, 'https://www.youtube.com/channel/UC4'],
    ['not live → the channel page', 5, st, 'https://www.youtube.com/channel/UC5'],
    ['no live-status yet (offline) → the channel page', 3, null, 'https://www.youtube.com/channel/UC3'],
  ])('%s', (_n, id, status, url) => expect(channelUrl(ch(id as number), status as LiveStatus | null)).toBe(url));
  it('a stream push: its own video, else the channel live one, else the streams tab', () => {
    expect(route({ type: 'stream_live', data: { channel_id: '3', video_id: 'PUSHED' } }, st)).toEqual({ kind: 'youtube', url: videoUrl('PUSHED') });
    expect(route({ type: 'stream_live', data: { channel_id: '3' } }, st)).toEqual({ kind: 'youtube', url: videoUrl('LIVE3') });
    expect(route({ type: 'stream_live', data: { channel_id: '5' } }, st)).toEqual({ kind: 'navigate', to: '/streams' });
  });
});

// A-48: the reference phone (Chrome 98) went white 2-3 s after Home: `Europe/Kyiv` (tzdata 2022b) threw RangeError in kyivToday()
describe('kyivToday on an engine with pre-2022b tzdata', () => {
  it('uses the name every engine knows', async () => {
    const { kyivToday, KYIV_TZ } = await import('@/data/live/streams');
    expect(KYIV_TZ).toBe('Europe/Kiev');
    const Orig = Intl.DateTimeFormat;
    const Old = function (l?: string, o?: Intl.DateTimeFormatOptions) {
      if (o?.timeZone === 'Europe/Kyiv') throw new RangeError('Invalid time zone specified: Europe/Kyiv');
      return new Orig(l, o);
    } as unknown as typeof Intl.DateTimeFormat;
    (Intl as { DateTimeFormat: typeof Intl.DateTimeFormat }).DateTimeFormat = Old;
    try { expect(kyivToday(new Date('2026-11-04T22:30:00Z'))).toBe('2026-11-05'); } finally { (Intl as { DateTimeFormat: typeof Intl.DateTimeFormat }).DateTimeFormat = Orig; }
  });
});
