import { registerPlugin } from '@capacitor/core';
import { isNative } from './platform';

/**
 * A-36 (owner 02.11.2026, answer «Б»): Firebase Analytics — the screens opened and the app instance id, NOTHING else: no advertising
 * id (R-9, the manifest + its CI check), no search text, no coordinates, no ids of what was opened, no personal data. «Ще →
 * Статистика використання» (on by default) switches collection on / off at once. The native side starts with collection OFF
 * (manifest `firebase_analytics_collection_enabled=false`): nothing leaves before the app has read the person's choice.
 * Local plugin: android/app/src/main/java/info/inok/app/AnalyticsPlugin.java.
 */
const Native = registerPlugin<{ setEnabled(o: { enabled: boolean }): Promise<void>; screen(o: { name: string }): Promise<void> }>('InokAnalytics');

/** the screen's NAME from its address — the route, never what is in it (no card code, no article id, no search) */
const SCREENS: [RegExp, string][] = [
  [/^\/home$/, 'home'], [/^\/monasteries$/, 'monasteries'], [/^\/monasteries\/[^/]+$/, 'monastery'], [/^\/map$/, 'map'],
  [/^\/streams$/, 'streams'], [/^\/more$/, 'more'], [/^\/more\/eparchies$/, 'eparchies'],
  [/^\/more\/eparchies\/[^/]+$/, 'eparchy'], [/^\/more\/(favourites|language|notifications|commission|contacts|about)$/, ''],
];
export function screenName(pathname: string, search = ''): string | null {
  const p = pathname.replace(/\/+$/, '') || '/';
  for (const [re, name] of SCREENS) {
    const m = p.match(re);
    if (m) return name || m[1];
  }
  if (p === '/articles') return new URLSearchParams(search).has('id') ? 'article' : 'articles';
  return null;
}

let enabled = false;
/** Browser screens read what would have been sent (the proof that «off» sends nothing): `window.__inokAnalytics`. */
const webLog = (): string[] => ((window as unknown as { __inokAnalytics?: string[] }).__inokAnalytics ??= []);

export async function setAnalytics(on: boolean): Promise<void> {
  enabled = on;
  if (isNative()) await Native.setEnabled({ enabled: on }).catch(() => undefined);
}
/** One screen opened (an article = «article»): sent only while the switch is on. */
export function logScreen(name: string | null): void {
  if (!enabled || !name) return;
  if (isNative()) void Native.screen({ name }).catch(() => undefined);
  else webLog().push(name);
}
