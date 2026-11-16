import type { Map as MLMap } from 'maplibre-gl';

/* cloud_37: two answers of the map's runtime, pure (no MapLibre, no window) - unit-tested in node; used by inokMap.ts. */

/** cloud_37 (the iOS 16.4 simulator: «Object.values requires that input parameter not be null or undefined» inside MapLibre's
 *  `areTilesLoaded`, from our 8-s tile timer - the whole app fell to its crash screen): the question asked safely. No style (the map is
 *  between styles / going away) or MapLibre failing to answer = «loaded» - the note is a hint, never worth the app. */
export function tilesLoaded(map: Pick<MLMap, 'areTilesLoaded'> & { style?: unknown }): boolean {
  if (!map.style) return true;
  try { return map.areTilesLoaded(); } catch { return true; }
}

/** cloud_37 (the iOS simulator: a map that never drew, nothing in the console - this handler swallowed MapLibre's errors): the last ten
 *  are kept on `window.__inokMapErrors` and said once each in the console («InokMap:», read from the device log / the CI console). */
export function noteMapError(e: { error?: { message?: string }; sourceId?: string }): void {
  const msg = `${e.sourceId ? `${e.sourceId}: ` : ''}${e.error?.message ?? 'error'}`.slice(0, 200);
  const w = window as unknown as { __inokMapErrors?: string[] };
  const kept = (w.__inokMapErrors ??= []);
  if (kept.includes(msg)) return;
  kept.push(msg); if (kept.length > 10) kept.shift();
  console.warn(`InokMap: ${msg}`);
}

/** cloud_37 (the iOS simulator, ios run 4): where MapLibre's worker starts from - the bundled file on an http(s) page, else (iOS: the page is
 *  `capacitor://`, WKWebView starts no worker from it) the same code from a `blob:` URL of the page's own origin; `forced` = 'blob' anywhere. */
export async function mapWorkerSource(fileUrl: string, protocol: string, forced: string | null, load: (url: string) => Promise<string>,
  toUrl: (code: string) => string = (code) => URL.createObjectURL(new Blob([code], { type: 'text/javascript' }))): Promise<{ how: 'file' | 'blob'; url: string; error?: string }> {
  if (/^https?:$/.test(protocol) && forced !== 'blob') return { how: 'file', url: fileUrl };
  try {
    return { how: 'blob', url: toUrl(await load(fileUrl)) };
  } catch (e) {
    return { how: 'file', url: fileUrl, error: String(e) };
  }
}
