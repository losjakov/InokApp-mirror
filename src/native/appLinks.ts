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

export function onUrlOpen(cb: (url: string) => void): () => void {
  if (isNative()) {
    const h = CapApp.addListener('appUrlOpen', (e) => cb(e.url));
    return () => { void h.then((x) => x.remove()); };
  }
  const on = (e: Event) => cb(String((e as CustomEvent<string>).detail));
  window.addEventListener('inok-url-open', on);
  return () => window.removeEventListener('inok-url-open', on);
}
