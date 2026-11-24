import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useApp } from './AppContext';
import { cancelReminder, loadReminders, reconcile, saveReminders, scheduleReminder, type Reminder } from '@/native/reminders';
import { pushPermission, requestPushPermission } from '@/native/push';
import { timeOf } from '@/data/live/streams';
import type { Translate } from '@/i18n';
import { syncCountdowns, type CountdownWords } from '@/native/countdown';
import { onForeground } from './sortClock';
import { CANCEL_EVENT } from '@/app/quickActions';

/** T8 (A-153 (1)): the app's reminders - ONE list for the pills, the widgets (Preferences `reminders`) and the re-check on every live-status. */
export interface Reminders {
  list: Reminder[];
  has(channel_id: number, video_id?: string): Reminder | undefined;
  /** 'set' | 'denied' (the notifications are off in the system: no reminder, the caller shows the words + the settings link) */
  remind(r: Reminder): Promise<'set' | 'denied'>;
  cancel(r: Reminder): Promise<void>;
}
const Ctx = createContext<Reminders>({ list: [], has: () => undefined, remind: async () => 'denied', cancel: async () => undefined });
export const useReminders = (): Reminders => useContext(Ctx);

/** THE text of a reminder (x3): «Через 10 хв: <title>» / «<channel> · HH:MM» - the time by THE row helper (`timeOf`, the «Початок о …» of the row). */
export const reminderText = (t: Translate, lang: string, r: Reminder): { title: string; body: string } => ({
  title: t('remind.title', { title: r.title || r.channel || '' }),
  body: t('remind.body', { channel: r.channel ?? '', time: timeOf(r.at, lang as never) }),
});

export function RemindersProvider({ children }: { children: ReactNode }) {
  const { t, lang, live } = useApp();
  const [list, setList] = useState<Reminder[]>([]);
  const loaded = useRef(false);
  useEffect(() => { void loadReminders().then((l) => { loaded.current = true; setList(l); }); }, []);
  const put = useCallback(async (next: Reminder[]) => { setList(next); await saveReminders(next); }, []);
  // EVERY fresh live-status (never the cached one shown offline): a moved time -> re-scheduled, gone -> cancelled, past -> dropped
  useEffect(() => {
    if (!live || live.stale || !loaded.current) return;
    void (async () => {
      const cur = await loadReminders();
      const { keep, moved, cancel } = reconcile(cur, live.status);
      for (const r of cancel) await cancelReminder(r);
      for (const r of moved) await scheduleReminder(r, reminderText(t, lang, r), t('remind.channel'));
      if (keep.length !== cur.length || moved.length) await put(keep);
    })();
  }, [live, t, lang, put]);
  // A-173 (C) / A-174: the countdowns follow the reminders - every change (set, moved, cancelled, dropped) and every return to the foreground
  const words = useMemo<CountdownWords>(() => ({ label: t('countdown.label'), in: t('countdown.in'), started: t('countdown.started'), open: t('countdown.open'),
    cancel: t('countdown.cancel'), channel: t('countdown.channel') }), [t]);
  useEffect(() => { if (loaded.current) void syncCountdowns(list, words); }, [list, words]);
  useEffect(() => onForeground(() => void loadReminders().then((l) => syncCountdowns(l, words))), [words]);
  // A-174: the Android countdown's «Скасувати» (an address handed to the app) = the reminder cancelled by THIS path
  useEffect(() => {
    const h = (e: Event) => { const d = (e as CustomEvent<{ channel_id: number; video_id: string }>).detail; void (async () => {
      const cur = await loadReminders(); const r = cur.find((x) => x.channel_id === d.channel_id && x.video_id === d.video_id);
      if (r) { await cancelReminder(r); await put(cur.filter((x) => x !== r)); } })(); };
    window.addEventListener(CANCEL_EVENT, h);
    return () => window.removeEventListener(CANCEL_EVENT, h);
  }, [put]);
  const value = useMemo<Reminders>(() => ({
    list,
    has: (c, v) => list.find((r) => r.channel_id === c && r.video_id === v),
    async remind(r) {
      let p = await pushPermission();
      if (p === 'prompt') p = await requestPushPermission(); // asks only when not decided yet
      if (p !== 'granted') return 'denied';
      await scheduleReminder(r, reminderText(t, lang, r), t('remind.channel'));
      await put([...list.filter((x) => !(x.channel_id === r.channel_id && x.video_id === r.video_id)), r]);
      return 'set';
    },
    async cancel(r) {
      await cancelReminder(r);
      await put(list.filter((x) => !(x.channel_id === r.channel_id && x.video_id === r.video_id)));
    },
  }), [list, t, lang, put]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
