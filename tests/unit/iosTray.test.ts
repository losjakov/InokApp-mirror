import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it, vi } from 'vitest';

// cloud_46 (A-171 Part A, FUTURE_notifications_ios.md §4 A1-A8 / §5): the A-84 tray rules on iPhone
const read = (p: string) => readFileSync(p, 'utf8');
const calls: [string, unknown][] = [];
vi.mock('@capacitor/core', async (orig) => {
  const real = await orig<typeof import('@capacitor/core')>();
  return { ...real, Capacitor: { ...real.Capacitor, isNativePlatform: () => true, getPlatform: () => 'ios' },
    registerPlugin: (name: string) => new Proxy({}, { get: (_t, m) => async (o: unknown) => { calls.push([`${name}.${String(m)}`, o]); } }) };
});
afterEach(() => { calls.length = 0; });

describe('A1: push.ts asks the plugin on iPhone too (one path, A-84)', () => {
  it('consumedArticles / liveChannelsNow reach FcmTopics on iOS', async () => {
    const { consumedArticles, liveChannelsNow } = await import('@/native/push');
    await consumedArticles(); await consumedArticles(['2869']); await liveChannelsNow([3, 1686]);
    expect(calls).toEqual([['FcmTopics.consumedArticles', {}], ['FcmTopics.consumedArticles', { ids: ['2869'] }], ['FcmTopics.liveChannels', { ids: ['3', '1686'] }]]);
  });
  it('the «Позначити прочитаним» action is not a tap (nothing opens)', () => {
    expect(read('src/native/push.ts')).toMatch(/if \(a\.actionId !== MARK_READ_ACTION\) onTap\?\.\(/);
  });
});

describe('A2-A8 in the iOS code (static)', () => {
  const tray = read('ios/App/Shared/InokShared.swift'); const plug = read('ios/App/App/FcmTopicsPlugin.swift');
  const app = read('ios/App/App/AppDelegate.swift'); const nse = read('ios/App/InokNotifications/NotificationService.swift');
  const bridge = read('ios/App/App/InokBridgeViewController.swift');
  it('removal only by identifiers READ from getDeliveredNotifications (never a guessed id); articles never touch «ефір»', () => {
    for (const f of ['removeArticles', 'keepLive', 'removeLive']) {
      const body = tray.slice(tray.indexOf(`static func ${f}`), tray.indexOf('\n    }\n', tray.indexOf(`static func ${f}`)));
      expect(body, f).toMatch(/getDeliveredNotifications \{ ns in[\s\S]*map \{ \$0\.request\.identifier \}[\s\S]*removeDeliveredNotifications\(withIdentifiers: gone\)/);
    }
    expect(tray).toMatch(/kind\(\$0\) == "article"/);
    expect(tray).toMatch(/kind\(\$0\) == "stream_live" && \$0\.request\.identifier != keep/);
  });
  it('A2 / A3 / A7: the plugin really removes (no more empty resolves) and sets the badge to 0', () => {
    expect(plug).toMatch(/InokTray\.removeArticles\(ids\)/);
    expect(plug).toMatch(/InokTray\.keepLive\(Set\(ids\)\)/);
    expect(plug).toMatch(/setBadgeCount\(0\)/);
    expect(plug).toMatch(/applicationIconBadgeNumber = 0/);
  });
  it('A4 (a) background stream_ended -> its «ефір» removed; (b) the NSE prunes stale «ефір» but never the request delivered and never alters content', () => {
    expect(app).toMatch(/"stream_ended", let ch = InokTray\.str\(userInfo\["channel_id"\]\) \{ InokTray\.removeLive\(channel: ch\)/);
    expect(nse).toMatch(/InokTray\.keepLive\(live, except: request\.identifier\) \}\s*deliver\(\)/); // delivered at once, never waiting
    expect(nse).toMatch(/h\(c\) \/\/ the very content that arrived - never modified/);
    expect(nse).not.toMatch(/mutableCopy|bestAttemptContent/);
  });
  it('A6: the category INOK_ARTICLE + INOK_MARK_READ (no foreground) registered at launch, merged; the action handled natively before Capacitor\'s router', () => {
    expect(tray).toMatch(/articleCategory = "INOK_ARTICLE"/);
    expect(tray).toMatch(/markRead = "INOK_MARK_READ"/);
    expect(app).toMatch(/didFinishLaunchingWithOptions[\s\S]*AppDelegate\.registerArticleCategory\(\)/);
    expect(app).toMatch(/UNNotificationAction\(identifier: InokTray\.markRead, title: NSLocalizedString\("INOK_MARK_READ"[^)]*\), options: \[\]\)/);
    expect(app).toMatch(/have\.filter \{ \$0\.identifier != InokTray\.articleCategory \}\.union\(\[cat\]\)/);
    expect(bridge).toMatch(/InokNotificationDelegate\.install\(\)/);
    expect(bridge).toMatch(/response\.actionIdentifier == InokTray\.markRead[\s\S]*InokTray\.removeArticles\(nil\)/);
    for (const [l, w] of [['uk', 'Позначити прочитаним'], ['ru', 'Отметить прочитанным'], ['en', 'Mark as read']])
      expect(read(`ios/App/App/${l}.lproj/Localizable.strings`)).toContain(`"INOK_MARK_READ" = "${w}";`);
  });
});
