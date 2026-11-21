import { LocalNotifications } from '@capacitor/local-notifications';
import { Preferences } from '@capacitor/preferences';
import { isAndroid, isNative } from './platform';
import type { LiveStatus } from '@/data/api/types';

/**
 * T8 «Нагадати» (A-153 (1), cloud_43): ONE local reminder 10 minutes before a planned stream («Заплановані»).
 * Android: INEXACT (`isExactNotification: false` - the plugin then never opens the system «Alarms & reminders» screen and the app holds NO
 * SCHEDULE_EXACT_ALARM / USE_EXACT_ALARM, AndroidManifest removes the plugin's own line) + `allowWhileIdle` (fires in Doze; the system may
 * deliver it a few minutes late). iOS: UNUserNotificationCenter, the push permission. The plugin re-arms its alarms after a reboot
 * (its BOOT_COMPLETED receiver). Kept in Preferences `reminders`; re-checked on EVERY live-status: a moved time -> re-scheduled (the same
 * id), the stream gone from «Заплановані» and not live -> cancelled, a past one -> dropped.
 */
export const REMIND_BEFORE_MS = 10 * 60_000;
export const REMINDERS_KEY = 'reminders';
export const REMINDER_CHANNEL = 'reminders';

/** {channel_id, video_id, at} = the key and the time (SPEC); `title` / `channel` = the words of its text, kept for a re-schedule */
export interface Reminder { channel_id: number; video_id: string; at: string; title?: string; channel?: string }
export interface ReminderText { title: string; body: string }

/** A stable notification id of channel + video (FNV-1a, 31 bits, never 0) - the same stream always replaces its own reminder. */
export function reminderId(channel_id: number, video_id: string): number {
  let h = 0x811c9dc5;
  for (const c of `${channel_id}|${video_id}`) { h ^= c.charCodeAt(0); h = Math.imul(h, 0x01000193); }
  return (h >>> 1) || 1;
}

/** The pill is offered only while the start is at least 10 minutes away (and the stream has a video id to key it by). */
export const canRemind = (at: string, video_id: string | undefined, now = Date.now()): boolean =>
  !!video_id && Date.parse(at) - now >= REMIND_BEFORE_MS;

/** When it rings. */
export const fireAt = (at: string): number => Date.parse(at) - REMIND_BEFORE_MS;

/** What the store keeps vs what the site says now: re-schedule (moved), cancel (gone and not live), drop (past); `keep` = the new list. */
export function reconcile(stored: Reminder[], status: Pick<LiveStatus, 'live' | 'scheduled'>, now = Date.now()): { keep: Reminder[]; moved: Reminder[]; cancel: Reminder[] } {
  const keep: Reminder[] = []; const moved: Reminder[] = []; const cancel: Reminder[] = [];
  for (const r of stored) {
    const s = (status.scheduled ?? []).find((x) => x.channel_id === r.channel_id && x.video_id === r.video_id);
    if (s) {
      const next = { ...r, at: s.scheduled_at };
      if (fireAt(next.at) <= now) { if (s.scheduled_at !== r.at) cancel.push(r); continue; } // moved into the past / fired: nothing more to do
      keep.push(next);
      if (s.scheduled_at !== r.at) moved.push(next);
      continue;
    }
    const live = status.live.some((l) => l.channel_id === r.channel_id && l.video_id === r.video_id);
    if (!live && fireAt(r.at) > now) cancel.push(r); // gone from the plan (not started): never ring
    // live now, or its time has passed: the reminder has done (or no longer needs) its work - out of the list
  }
  return { keep, moved, cancel };
}

// ---- the plugin (native) / a recorded stand-in (the browser ring: window.__inokReminders) ----
type Pending = { id: number; at: number; title: string; body: string; exact: boolean; idle: boolean; extra: Record<string, unknown> };
const webPending = (): Pending[] => {
  const w = globalThis as { __inokReminders?: Pending[] };
  return (w.__inokReminders ??= []);
};

let channelMade = false;
async function ensureChannel(name: string): Promise<void> {
  if (!isNative() || !isAndroid() || channelMade) return;
  await LocalNotifications.createChannel({ id: REMINDER_CHANNEL, name, importance: 4, visibility: 1 });
  channelMade = true;
}

/** Schedules (or replaces) the reminder of one stream. */
export async function scheduleReminder(r: Reminder, text: ReminderText, channelName: string): Promise<void> {
  const id = reminderId(r.channel_id, r.video_id);
  const at = fireAt(r.at);
  const extra = { route: '/streams', channel_id: r.channel_id, video_id: r.video_id };
  if (!isNative()) {
    const list = webPending().filter((p) => p.id !== id);
    list.push({ id, at, title: text.title, body: text.body, exact: false, idle: true, extra });
    (globalThis as { __inokReminders?: Pending[] }).__inokReminders = list;
    return;
  }
  await ensureChannel(channelName);
  await LocalNotifications.cancel({ notifications: [{ id }] }).catch(() => undefined);
  await LocalNotifications.schedule({ notifications: [{
    id, title: text.title, body: text.body, channelId: REMINDER_CHANNEL, smallIcon: 'ic_stat_push', extra,
    schedule: { at: new Date(at), allowWhileIdle: true }, isExactNotification: false,
  }] });
}

export async function cancelReminder(r: Pick<Reminder, 'channel_id' | 'video_id'>): Promise<void> {
  const id = reminderId(r.channel_id, r.video_id);
  if (!isNative()) { (globalThis as { __inokReminders?: Pending[] }).__inokReminders = webPending().filter((p) => p.id !== id); return; }
  await LocalNotifications.cancel({ notifications: [{ id }] }).catch(() => undefined);
}

export async function loadReminders(): Promise<Reminder[]> {
  try {
    const v = (await Preferences.get({ key: REMINDERS_KEY })).value;
    const a = v ? (JSON.parse(v) as Reminder[]) : [];
    return Array.isArray(a) ? a.filter((x) => x && typeof x.channel_id === 'number' && typeof x.video_id === 'string' && typeof x.at === 'string') : [];
  } catch { return []; }
}
export const saveReminders = (list: Reminder[]): Promise<void> => Preferences.set({ key: REMINDERS_KEY, value: JSON.stringify(list) });

/** A tap on a reminder -> its screen (wired once by the app: «Трансляції», or the stream itself if it is live by then). */
export function onReminderTap(handler: (extra: { channel_id?: number; video_id?: string }) => void): () => void {
  if (!isNative()) return () => undefined;
  const h = LocalNotifications.addListener('localNotificationActionPerformed', (a) => handler((a.notification.extra ?? {}) as { channel_id?: number; video_id?: string }));
  return () => { void h.then((x) => x.remove()); };
}
