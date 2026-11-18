import { App as CapApp } from '@capacitor/app';
import { isNative } from './platform';

/**
 * THE source of App Links (A-76, A-78 1): the URL the system started the app with (`launchUrl`) and the ones it hands to the
 * running app (`onUrlOpen`). Native = Capacitor App (`getLaunchUrl` = the launch intent's data; `appUrlOpen` = onNewIntent).
 * The browser ring has no intents: a screen test plays them through `window.__inokLaunch` ({url, ms} - the native bridge answers
 * after a delay, never in the same tick) and the window event `inok-url-open` (detail = the url).
 */
type WebLaunch = { url?: string; ms?: number };
export function launchUrl(): Promise<string | undefined> {
  if (isNative()) return CapApp.getLaunchUrl().then((r) => r?.url || undefined);
  const l = (window as unknown as { __inokLaunch?: WebLaunch }).__inokLaunch;
  return new Promise((ok) => setTimeout(() => ok(l?.url || undefined), l?.ms ?? 0));
}

/**
 * cloud_41 (A-133 C1): an address handed to the app while NO screen listens (the first-run screen, the reserve door, the splash) is kept
 * and given to the first listener - a quick action tapped during the first download opens its tab after it. ONE native listener, from
 * the module's load; a listener added later gets what waited.
 */
let waiting: string[] = [];
let listeners: ((url: string) => void)[] = [];
const deliver = (u: string) => { if (listeners.length) listeners.forEach((l) => l(u)); else waiting.push(u); };
if (isNative()) void CapApp.addListener('appUrlOpen', (e) => deliver(e.url));
else if (typeof window !== 'undefined') window.addEventListener('inok-url-open', (e) => deliver(String((e as CustomEvent<string>).detail)));

export function onUrlOpen(cb: (url: string) => void): () => void {
  listeners.push(cb);
  const kept = waiting; waiting = [];
  kept.forEach((u) => cb(u));
  return () => { listeners = listeners.filter((l) => l !== cb); };
}
/** test seam (unit): forget what waited */
export const _resetUrlOpen = (): void => { waiting = []; listeners = []; };
/** test seam (unit, no window in node): the system handing an address over */
export const _handOver = (u: string): void => deliver(u);
