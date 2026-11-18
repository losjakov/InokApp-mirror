import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { QUICK_ACTIONS, quickRoute } from '@/app/quickActions';
import { _handOver, _resetUrlOpen, onUrlOpen } from '@/native/appLinks';
import { execFileSync } from 'node:child_process';

// cloud_41 (A-133 C1): FOUR quick actions in the owner's order, the same on both platforms, each to its tab through the link router
const ORDER = ['streams', 'monasteries', 'map', 'articles'];
const read = (p: string) => readFileSync(p, 'utf8');

describe('quick actions on the app icon', () => {
  it('the router: inokapp://tab/<id> -> the tab; anything else -> null', () => {
    expect(QUICK_ACTIONS.map((a) => a.id)).toEqual(ORDER);
    expect(ORDER.map((i) => quickRoute(`inokapp://tab/${i}`))).toEqual(['/streams', '/monasteries', '/map', '/articles']);
    expect(quickRoute('inokapp://tab/unknown')).toBeNull();
    expect(quickRoute('https://inok.info/monasteries/242/')).toBeNull();
    expect(quickRoute(undefined)).toBeNull();
  });
  it('Android: res/xml/shortcuts.xml = the four, in order, each an explicit VIEW of the app with its address; the manifest names it', () => {
    const x = read('android/app/src/main/res/xml/shortcuts.xml');
    expect(Array.from(x.matchAll(/shortcutId="([^"]+)"/g)).map((m) => m[1])).toEqual(ORDER);
    expect(Array.from(x.matchAll(/android:data="inokapp:\/\/tab\/([^"]+)"/g)).map((m) => m[1])).toEqual(ORDER);
    expect(x.match(/targetClass="info\.inok\.app\.MainActivity"/g)).toHaveLength(4);
    expect(read('android/app/src/main/AndroidManifest.xml')).toMatch(/<meta-data android:name="android\.app\.shortcuts" android:resource="@xml\/shortcuts" \/>/);
  });
  it('Android labels by the system language (values = en, -uk, -ru); the icons are generated from the tab glyphs and current', () => {
    const want: Record<string, string[]> = { values: ['Streams', 'Monasteries', 'Map', 'Publications'], 'values-uk': ['Трансляції', 'Монастирі', 'Карта', 'Публікації'], 'values-ru': ['Трансляции', 'Монастыри', 'Карта', 'Публикации'] };
    for (const [d, w] of Object.entries(want)) {
      const s = read(`android/app/src/main/res/${d}/strings.xml`);
      expect(ORDER.map((i) => new RegExp(`<string name="shortcut_${i}">([^<]+)</string>`).exec(s)?.[1])).toEqual(w);
    }
    expect(execFileSync('python3', ['-I', 'scripts/shortcut_icons.py', '--check']).toString()).toMatch(/PASS/);
  });
  it('iOS: Info.plist = the four in order (SF Symbols), titles in the three InfoPlist.strings; the SceneDelegate hands both starts over', () => {
    const p = read('ios/App/App/Info.plist');
    expect(Array.from(p.matchAll(/<string>info\.inok\.app\.tab\.([a-z]+)<\/string>/g)).map((m) => m[1])).toEqual(ORDER);
    const want: Record<string, string[]> = { en: ['Streams', 'Monasteries', 'Map', 'Publications'], uk: ['Трансляції', 'Монастирі', 'Карта', 'Публікації'], ru: ['Трансляции', 'Монастыри', 'Карта', 'Публикации'] };
    for (const [l, w] of Object.entries(want)) {
      const s = read(`ios/App/App/${l}.lproj/InfoPlist.strings`);
      expect(ORDER.map((i) => new RegExp(`"SHORTCUT_${i}" = "([^"]+)";`).exec(s)?.[1])).toEqual(w);
    }
    const sd = read('ios/App/App/SceneDelegate.swift');
    expect(sd).toMatch(/connectionOptions\.shortcutItem/); // a cold start
    expect(sd).toMatch(/performActionFor shortcutItem/); // from the background
    expect(sd).toMatch(/"inokapp:\/\/tab\/"/);
  });
  it('an address handed over while no screen listens (first run, the door) waits for the first listener', () => {
    _resetUrlOpen();
    _handOver('inokapp://tab/map');
    const got: string[] = [];
    const off = onUrlOpen((u) => got.push(u));
    expect(got).toEqual(['inokapp://tab/map']);
    _handOver('inokapp://tab/streams');
    expect(got).toEqual(['inokapp://tab/map', 'inokapp://tab/streams']);
    off();
  });
});
