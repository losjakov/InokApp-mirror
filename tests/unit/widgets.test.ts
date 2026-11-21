import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { importedDb } from './helpers';
import { listChannels } from '@/data/repo/channels';
import { WIDGET_ITEMS, WIDGET_WORDS, widgetJson } from '@/native/widgets';
import { makeT, LANGS } from '@/i18n';
import { APP_KEY } from '@/data/api/client';
import { photoName } from '@/data/photos/store';
import type { Article, LiveStatus } from '@/data/api/types';

// T9 (A-153 (2), A-155, A-156 (1)): THE JSON the three widgets read; their names = «Що нового» 1.0.17 (x3), the same in the picker (Android res)
const status = JSON.parse(readFileSync('fixtures/live-status.json', 'utf8')) as LiveStatus;
const items = (JSON.parse(readFileSync('fixtures/articles.json', 'utf8')) as { items: Article[] }).items;

describe('widgetJson', () => {
  it('fields: words x3 (placeholders kept for the widget), channels with the KEPT avatar file, the last status, 3 items, reminders, the public key', async () => {
    const { db } = await importedDb();
    for (const lang of LANGS) {
      const channels = await listChannels(db, lang);
      const j = widgetJson({ t: makeT(lang), lang, channels, dict: {}, status, items, reminders: [{ channel_id: 1692, video_id: 'v', at: '2026-11-21T08:00:00Z', title: 'x' }], now: 0 });
      expect(Object.keys(j.words).sort()).toEqual([...WIDGET_WORDS].sort());
      for (const k of WIDGET_WORDS) expect(j.words[k], `${lang} widget.${k}`).not.toMatch(/^widget\./);
      expect(j.words.more).toContain('{n}'); expect(j.words.updated).toContain('{time}');
      expect(j.items).toHaveLength(WIDGET_ITEMS);
      expect(j.items[0]).toEqual({ id: items[0].id, kind: items[0].kind, title: items[0].title, published_at: items[0].published_at, site_url: items[0].site_url });
      expect(j.api).toEqual({ base: 'https://inok.info/api/app/v1/', key: APP_KEY });
      expect(j.reminders).toEqual([{ channel_id: 1692, video_id: 'v', at: '2026-11-21T08:00:00Z' }]); // the key + the time only
      const c = channels.find((x) => x.avatar_url)!;
      expect(j.channels[String(c.id)].avatar).toBe(photoName(`ch${c.id}`, c.avatar_url!, c.avatar_sha256));
      expect(j.status!.live).toEqual(status.live);
      expect(JSON.stringify(j).length, 'small (a widget reads it on every draw)').toBeLessThan(20_000);
    }
  });
  it('A-156 (1): the widget names x3 = the release notes\' names = the picker labels (Android strings) = the app\'s headers', () => {
    const notes = readFileSync('store/release_notes/1.0.17.md', 'utf8');
    const res = { uk: 'values-uk', ru: 'values-ru', en: 'values' } as const;
    const names = { uk: ['Зараз в ефірі', 'Найближчі трансляції', 'Нове на сайті'], ru: ['Сейчас в эфире', 'Ближайшие трансляции', 'Новое на сайте'], en: ['Live now', 'Upcoming streams', 'New on the site'] };
    for (const lang of LANGS) {
      const xml = readFileSync(`android/app/src/main/res/${res[lang]}/strings.xml`, 'utf8');
      const got = ['widget_live', 'widget_upcoming', 'widget_new'].map((k) => xml.match(new RegExp(`<string name="${k}">([^<]+)</string>`))![1]);
      expect(got).toEqual(names[lang]);
      for (const n of names[lang]) expect(notes, `${lang}: «${n}» in the notes`).toContain(n);
      const t = makeT(lang);
      expect(t('widget.upcoming_title')).toBe(names[lang][1]);
      expect(t('widget.new_title')).toBe(names[lang][2]);
      expect(t('widget.live_title')).toContain(names[lang][0]);
    }
  });
  it('the Android side is wired: three providers, the plugin registered, WorkManager 30 min, the push hook, no exact alarms', () => {
    const man = readFileSync('android/app/src/main/AndroidManifest.xml', 'utf8');
    for (const k of ['LiveWidget', 'UpcomingWidget', 'NewWidget']) expect(man).toContain(`<receiver android:name=".${k}"`);
    expect(readFileSync('android/app/src/main/java/info/inok/app/MainActivity.java', 'utf8')).toContain('registerPlugin(InokWidgetsPlugin.class)');
    expect(readFileSync('android/app/src/main/java/info/inok/app/WidgetWorker.java', 'utf8')).toMatch(/PeriodicWorkRequest\.Builder\(WidgetWorker\.class, 30, TimeUnit\.MINUTES\)/);
    expect(readFileSync('android/app/src/main/java/info/inok/app/InokMessagingService.java', 'utf8')).toMatch(/stream_live.*stream_ended[\s\S]*WidgetPush\.onStream/);
    for (const k of ['live', 'upcoming', 'new']) expect(readFileSync(`android/app/src/main/res/xml/widget_${k}_info.xml`, 'utf8')).toContain('android:updatePeriodMillis="0"');
  });
});
