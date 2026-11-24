import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import { COUNTDOWN_AFTER_MS, COUNTDOWN_WINDOW_MS, countdownItems, syncCountdowns } from '@/native/countdown';
import type { Reminder } from '@/native/reminders';

// A-173 (C) + A-174 (cloud_46): the reminder's countdown - ONE window rule, ONE native call
const read = (p: string) => readFileSync(p, 'utf8');
const H = 3_600_000; const NOW = Date.parse('2026-11-24T08:00:00Z');
const rem = (video: string, hoursAhead: number, title = 'Літургія'): Reminder => ({ channel_id: 3, video_id: video, at: new Date(NOW + hoursAhead * H).toISOString(), title, channel: 'Почаївська Лавра' });
const W = { label: 'НАГАДУВАННЯ · inok.info', in: 'через', started: 'почалася', open: 'Відкрити', cancel: 'Скасувати', channel: 'Відлік' };

describe('the 8 h window (A-173 (C), A-174)', () => {
  it('≤ 8 h ahead = a countdown; 8 h + 1 min = none yet; up to 15 min after the start = still there (the «started» line); later = gone', () => {
    expect(COUNTDOWN_WINDOW_MS).toBe(8 * H); expect(COUNTDOWN_AFTER_MS).toBe(15 * 60_000);
    const list = [rem('aaaaaa1', 7.99), rem('aaaaaa2', 8 + 1 / 60), rem('aaaaaa3', -0.2), rem('aaaaaa4', -0.3)];
    expect(countdownItems(list, NOW).map((i) => i.video_id)).toEqual(['aaaaaa1', 'aaaaaa3']);
    expect(countdownItems(list, NOW)[0]).toMatchObject({ id: '3|aaaaaa1', channel_id: 3, title: 'Літургія', monastery: 'Почаївська Лавра', at: NOW + 7.99 * H });
  });
  it('set earlier (> 8 h): none now, it starts at the first foreground inside the window (the same call, a later clock)', () => {
    const list = [rem('bbbbbb1', 10)];
    expect(countdownItems(list, NOW)).toEqual([]);
    expect(countdownItems(list, NOW + 2.5 * H).map((i) => i.id)).toEqual(['3|bbbbbb1']);
  });
  it('a moved time = the same id with the new start (the native side updates it); cancelled / dropped = absent (ended)', async () => {
    const sync = vi.fn(async (_o: { items: { id: string; at: number }[] }) => ({ active: 1 }));
    await syncCountdowns([rem('cccccc1', 2)], W, NOW, { sync });
    await syncCountdowns([{ ...rem('cccccc1', 2), at: new Date(NOW + 3 * H).toISOString() }], W, NOW, { sync });
    await syncCountdowns([], W, NOW, { sync });
    expect(sync.mock.calls.map(([o]) => o.items.map((i) => [i.id, i.at]))).toEqual([[['3|cccccc1', NOW + 2 * H]], [['3|cccccc1', NOW + 3 * H]], []]);
  });
  it('a refused native call never throws (the plain reminder stays)', async () => {
    await expect(syncCountdowns([rem('dddddd1', 1)], W, NOW, { sync: async () => { throw new Error('off'); } })).resolves.toBe(0);
  });
  it('the reminders call it on every change and every return to the foreground (one path)', () => {
    const src = read('src/state/reminders.tsx');
    expect(src).toMatch(/useEffect\(\(\) => \{ if \(loaded\.current\) void syncCountdowns\(list, words\); \}, \[list, words\]\);/);
    expect(src).toMatch(/onForeground\(\(\) => void loadReminders\(\)\.then\(\(l\) => syncCountdowns\(l, words\)\)\)/);
  });
});

describe('the native sides (static)', () => {
  it('iPhone: ActivityKit only behind #available(iOS 16.1), requested only in the FOREGROUND, no push token; the UI in the widget extension; NSSupportsLiveActivities', () => {
    const plug = read('ios/App/App/InokCountdownPlugin.swift'); const shared = read('ios/App/Shared/InokCountdown.swift'); const bundle = read('ios/App/InokWidgets/InokWidgetsBundle.swift');
    expect(plug).toMatch(/if #available\(iOS 16\.1, \*\) \{ DispatchQueue\.main\.async \{ self\.syncActivities\(call\) \}; return \}/);
    expect(plug).toMatch(/guard foreground, enabled else \{ continue \}/);
    expect(plug.match(/pushType: nil/g)).toHaveLength(2);
    expect(plug).toMatch(/dismissalPolicy: \.immediate/);
    expect(shared).toMatch(/@available\(iOS 16\.1, \*\)\nstruct InokCountdownAttributes: ActivityAttributes/);
    expect(shared).toMatch(/Text\(timerInterval: /); expect(shared).toMatch(/ProgressView\(timerInterval: /);
    expect(bundle).toMatch(/if #available\(iOSApplicationExtension 16\.1, \*\) \{ InokCountdownLive\(\) \}/);
    expect(read('ios/App/App/Info.plist')).toMatch(/<key>NSSupportsLiveActivities<\/key>\s*<true\/>/);
    expect(read('ios/App/App/InokBridgeViewController.swift')).toMatch(/registerPluginInstance\(InokCountdownPlugin\(\)\)/);
  });
  it('Android: its own LOW channel without sound / vibration, silent, the counting-down chronometer, ongoing until the start, 15 min after it gone', () => {
    const j = read('android/app/src/main/java/info/inok/app/CountdownPlugin.java');
    expect(j).toMatch(/NotificationManager\.IMPORTANCE_LOW\);\s*ch\.setSound\(null, null\); ch\.enableVibration\(false\)/);
    expect(j).toMatch(/\.setSilent\(true\)/);
    expect(j).toMatch(/\.setUsesChronometer\(!started\)\.setChronometerCountDown\(true\)/);
    expect(j).toMatch(/\.setWhen\(at\)/);
    expect(j).toMatch(/\.setOngoing\(!started\)/);
    expect(j).toMatch(/\.setTimeoutAfter\(Math\.max\(1000L, at \+ AFTER_MS - now\)\)/);
    expect(j).toMatch(/Manifest\.permission\.POST_NOTIFICATIONS/);
    expect(read('android/app/src/main/java/info/inok/app/MainActivity.java')).toMatch(/registerPlugin\(CountdownPlugin\.class\)/);
    expect(read('android/app/src/main/AndroidManifest.xml')).not.toMatch(/SCHEDULE_EXACT_ALARM" \/>|FOREGROUND_SERVICE" \/>/);
  });
});
