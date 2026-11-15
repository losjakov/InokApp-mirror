import pkg from '../../package.json';

/**
 * A-46 / A-47: the ONE written minimum browser engine (package.json `browserslist`, read by eslint-plugin-compat).
 * It is the lowest the stack officially accepts - Ionic 9: Chromium 89 (BREAKING.md), Capacitor 8: Chrome 60,
 * MapLibre 6: no number (ES2022, transpiled here) - and never above Chrome 98 (the reference phone, A-47).
 * Vite's build target, Capacitor's `minWebViewVersion`, the WebView error page and the first-run engine check read it from here.
 */
export function chromeFloor(list: readonly string[]): number {
  for (const q of list) {
    const m = /^\s*chrome\s*>=\s*(\d+)\s*$/i.exec(q);
    if (m) return Number(m[1]);
  }
  throw new Error('package.json browserslist: no "chrome >= N" entry');
}

export const ENGINE_FLOOR = chromeFloor(pkg.browserslist);

/**
 * cloud_36 (A-117 (4), A-46's iOS twin): the iOS floor = `ios_saf >= N` of the same list. On iOS the engine IS the system's (WKWebView =
 * Safari of that iOS), so the floor is the app's deployment target: an older iPhone cannot install the app at all - no old engine ever
 * runs it (no white screen possible). Read by vite.config.ts (the build target) and checked against the Xcode project by a unit test.
 */
export function iosFloor(list: readonly string[]): number {
  for (const q of list) {
    const m = /^\s*ios_saf\s*>=\s*(\d+)\s*$/i.exec(q);
    if (m) return Number(m[1]);
  }
  throw new Error('package.json browserslist: no "ios_saf >= N" entry');
}
export const IOS_FLOOR = iosFloor(pkg.browserslist);

/** The Chrome / WebView major of a user agent («Chrome/98.0.4758.87»), null when it is not Chromium. */
export function chromeMajor(ua: string): number | null {
  const m = /Chrome\/(\d+)\./.exec(ua);
  return m ? Number(m[1]) : null;
}

/** Where an old engine is updated (A-46): on Android 7-9 the app's engine is Chrome when the WebView is off, else the WebView. */
export const ENGINE_UPDATE_URLS = {
  webview: 'market://details?id=com.google.android.webview',
  chrome: 'market://details?id=com.android.chrome',
} as const;
