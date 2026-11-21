import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';

// T8 «Нагадати» (A-153 (1), cloud_43): 10 min before, INEXACT + allowWhileIdle, re-checked on every live-status
const plug = vi.hoisted(() => ({ calls: [] as { fn: string; arg: unknown }[], native: true }));
vi.mock('@capacitor/local-notifications', () => ({ LocalNotifications: {
  schedule: async (a: unknown) => { plug.calls.push({ fn: 'schedule', arg: a }); return { notifications: [] }; },
  cancel: async (a: unknown) => { plug.calls.push({ fn: 'cancel', arg: a }); },
  createChannel: async (a: unknown) => { plug.calls.push({ fn: 'channel', arg: a }); },
  addListener: async () => ({ remove: async () => undefined }),
} }));
const store = new Map<string, string>();
vi.mock('@capacitor/preferences', () => ({ Preferences: {
  get: async ({ key }: { key: string }) => ({ value: store.get(key) ?? null }),
  set: async ({ key, value }: { key: string; value: string }) => { store.set(key, value); },
} }));
vi.mock('@/native/platform', () => ({ isNative: () => plug.native, isAndroid: () => true, isIos: () => false }));

import { canRemind, cancelReminder, fireAt, loadReminders, reconcile, reminderId, REMIND_BEFORE_MS, saveReminders, scheduleReminder, type Reminder } from '@/native/reminders';
import { reminderText } from '@/state/reminders';
import { makeT } from '@/i18n';

const T0 = Date.parse('2026-11-21T06:00:00Z');
const r = (over: Partial<Reminder> = {}): Reminder => ({ channel_id: 1692, video_id: 'sK7JF1F6BiA', at: '2026-11-21T08:00:00Z', title: 'Літургія', channel: 'Кафедральний собор', ...over });
const status = (scheduled: { channel_id: number; video_id: string; scheduled_at: string }[], live: { channel_id: number; video_id: string }[] = []) =>
  ({ scheduled, live: live.map((l) => ({ ...l, title: { uk: '', ru: '', en: '' }, started_at: '' })) }) as never;
beforeEach(() => { plug.calls.length = 0; plug.native = true; store.clear(); });
afterEach(() => vi.unstubAllGlobals());

describe('the rule', () => {
  it('a stable id per channel + video (positive, never 0, different per stream)', () => {
    expect(reminderId(1692, 'a')).toBe(reminderId(1692, 'a'));
    expect(reminderId(1692, 'a')).not.toBe(reminderId(1692, 'b'));
    expect(reminderId(1692, 'a')).toBeGreaterThan(0);
    expect(reminderId(1692, 'a')).toBeLessThan(2 ** 31);
  });
  it('the pill only when the start is >= 10 min away and the stream has a video id', () => {
    expect(REMIND_BEFORE_MS).toBe(600_000);
    expect(canRemind('2026-11-21T06:10:00Z', 'v', T0)).toBe(true);
    expect(canRemind('2026-11-21T06:09:59Z', 'v', T0)).toBe(false);
    expect(canRemind('2026-11-21T08:00:00Z', undefined, T0)).toBe(false);
    expect(new Date(fireAt('2026-11-21T08:00:00Z')).toISOString()).toBe('2026-11-21T07:50:00.000Z');
  });
  it('reconcile: a moved time -> re-scheduled; gone and not live -> cancelled; live / past -> dropped; same -> kept', () => {
    const a = r(); const b = r({ channel_id: 1, video_id: 'b' }); const c = r({ channel_id: 2, video_id: 'c' }); const d = r({ channel_id: 3, video_id: 'd', at: '2026-11-21T05:00:00Z' });
    const e = r({ channel_id: 4, video_id: 'e' });
    const out = reconcile([a, b, c, d, e], status([{ channel_id: 1692, video_id: 'sK7JF1F6BiA', scheduled_at: '2026-11-21T09:00:00Z' }, { channel_id: 4, video_id: 'e', scheduled_at: e.at }],
      [{ channel_id: 2, video_id: 'c' }]), T0);
    expect(out.moved.map((x) => [x.channel_id, x.at])).toEqual([[1692, '2026-11-21T09:00:00Z']]);
    expect(out.cancel.map((x) => x.channel_id)).toEqual([1]); // b gone from the plan, not live
    expect(out.keep.map((x) => x.channel_id)).toEqual([1692, 4]); // c live (out), d past (out)
    expect(out.keep[0].title).toBe('Літургія'); // the words travel with it
  });
});

describe('the plugin call (Android: inexact, no settings jump)', () => {
  it('schedule: at = start - 10 min, isExactNotification false, allowWhileIdle true, the reminders channel, the push icon, the route', async () => {
    await scheduleReminder(r(), { title: 'Через 10 хв: Літургія', body: 'Кафедральний собор · 10:00' }, 'Нагадування');
    const ch = plug.calls.find((c) => c.fn === 'channel')!.arg as { id: string };
    expect(ch.id).toBe('reminders');
    const s = plug.calls.find((c) => c.fn === 'schedule')!.arg as { notifications: Record<string, any>[] };
    const n = s.notifications[0];
    expect(n.schedule.at.toISOString()).toBe('2026-11-21T07:50:00.000Z');
    expect(n.isExactNotification).toBe(false);
    expect(n.schedule.allowWhileIdle).toBe(true);
    expect(n).toMatchObject({ id: reminderId(1692, 'sK7JF1F6BiA'), channelId: 'reminders', smallIcon: 'ic_stat_push', extra: { route: '/streams', channel_id: 1692 } });
    expect(n.isExactMandatory).toBeUndefined();
  });
  it('cancel by the same id; the store keeps {channel_id, video_id, at}', async () => {
    await cancelReminder(r());
    expect(plug.calls.at(-1)).toEqual({ fn: 'cancel', arg: { notifications: [{ id: reminderId(1692, 'sK7JF1F6BiA') }] } });
    await saveReminders([r()]);
    expect(await loadReminders()).toEqual([r()]);
    store.set('reminders', '{"broken"'); expect(await loadReminders()).toEqual([]);
  });
  it('the text x3: «Через 10 хв: <title>» / «<channel> · HH:MM» by THE row helper (timeOf)', () => {
    for (const [lang, head] of [['uk', 'Через 10 хв: '], ['ru', 'Через 10 мин: '], ['en', 'In 10 min: ']] as const) {
      const x = reminderText(makeT(lang), lang, r());
      expect(x.title).toBe(`${head}Літургія`);
      expect(x.body).toMatch(/^Кафедральний собор · \d\d:\d\d( [AP]M)?$/);
    }
  });
  it('the merged manifest: the plugin\'s SCHEDULE_EXACT_ALARM removed, USE_EXACT_ALARM never; build.yml fails on either', () => {
    const man = readFileSync('android/app/src/main/AndroidManifest.xml', 'utf8');
    expect(man).toMatch(/<uses-permission android:name="android\.permission\.SCHEDULE_EXACT_ALARM" tools:node="remove" \/>/);
    expect(man).toMatch(/<uses-permission android:name="android\.permission\.USE_EXACT_ALARM" tools:node="remove" \/>/);
    expect(man).toMatch(/<uses-permission android:name="android\.permission\.FOREGROUND_SERVICE" tools:node="remove" \/>/); // WorkManager's, unused
    expect(readFileSync('.github/workflows/build.yml', 'utf8')).toMatch(/SCHEDULE_EXACT_ALARM\|USE_EXACT_ALARM/);
  });
});
