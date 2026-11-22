import { useEffect } from 'react';
import { useApp } from '@/state/AppContext';
import { useReminders } from '@/state/reminders';
import { listChannels } from '@/data/repo/channels';
import { listArticles } from '@/data/repo/articles';
import { setWidgets, widgetJson } from '@/native/widgets';

/** T9 (A-153 (2)): mounted once inside the tabs - after every live-status, feed, directory, reminder or language change the widgets get
 *  the app's data (0.5 s after the last change; one write per burst). Renders nothing. */
export function WidgetsHost(): null {
  const { db, t, lang, dict, live, articlesVersion, exportVersion } = useApp();
  const { list } = useReminders();
  useEffect(() => {
    if (!db) return;
    let on = true;
    const h = window.setTimeout(() => void (async () => {
      const [channels, items] = await Promise.all([listChannels(db, lang), listArticles(db, lang)]);
      if (on) await setWidgets(widgetJson({ t, lang, channels, dict, status: live?.status ?? null, items, reminders: list, now: Date.now() }));
    })(), 500);
    return () => { on = false; window.clearTimeout(h); };
  }, [db, t, lang, dict, live, articlesVersion, exportVersion, list]);
  return null;
}
