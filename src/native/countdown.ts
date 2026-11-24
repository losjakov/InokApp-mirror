import { registerPlugin } from '@capacitor/core';
import { isNative } from './platform';
import type { Reminder } from './reminders';

/**
 * A-173 (C) + A-174 (cloud_46): a reminder whose start is ≤ 8 h away shows a COUNTDOWN - iPhone: a Live Activity (ActivityKit, iOS 16.1+,
 * started only from the app in the foreground: no push, no server, A-7); Android: an ongoing silent notification with the system's
 * counting-down chronometer on its own channel. ONE call from the app: `syncCountdowns` with the reminders as they are now - the native
 * side starts / updates / ends to match (a set reminder, a moved time, a cancel, a dropped stream, the first foreground inside the window).
 * The web and iOS < 16.1: nothing (the plain reminder stays). Native: ios/App/App/InokCountdownPlugin.swift, android/.../CountdownPlugin.java.
 */
export const COUNTDOWN_WINDOW_MS = 8 * 3_600_000;
/** after the start: «Трансляція почалася — відкрити», gone 15 min later */
export const COUNTDOWN_AFTER_MS = 15 * 60_000;
export interface CountdownWords { label: string; in: string; started: string; open: string; cancel: string; channel: string }
export interface CountdownItem { id: string; channel_id: number; video_id: string; at: number; title: string; monastery: string }
interface CountdownPlugin { sync(o: { items: CountdownItem[]; words: CountdownWords; now: number }): Promise<{ active: number }>; state(): Promise<{ active: number; ids: string[] }> }
export const Countdown = registerPlugin<CountdownPlugin>('InokCountdown');

export const countdownId = (r: Pick<Reminder, 'channel_id' | 'video_id'>): string => `${r.channel_id}|${r.video_id}`;
/** THE window rule: the reminders whose start is ≤ 8 h ahead and not more than 15 min past */
export function countdownItems(list: Reminder[], now: number): CountdownItem[] {
  return list.flatMap((r) => {
    const at = Date.parse(r.at);
    if (!Number.isFinite(at) || at - now > COUNTDOWN_WINDOW_MS || now - at > COUNTDOWN_AFTER_MS) return [];
    return [{ id: countdownId(r), channel_id: r.channel_id, video_id: r.video_id, at, title: r.title ?? '', monastery: r.channel ?? '' }];
  });
}
/** the native side made equal to the reminders (never throws: a refused activity leaves the plain reminder) */
export async function syncCountdowns(list: Reminder[], words: CountdownWords, now = Date.now(), plugin: Pick<CountdownPlugin, 'sync'> = Countdown): Promise<number> {
  if (!isNative() && plugin === Countdown) return 0;
  try { return (await plugin.sync({ items: countdownItems(list, now), words, now })).active; } catch { return 0; }
}
