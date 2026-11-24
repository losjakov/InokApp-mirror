import { Preferences } from '@capacitor/preferences';
import { APP_VERSION } from './version';
import { deviceFacts } from './device';

/**
 * A-182 (cloud_46): a device whose WebGL cannot build MapLibre's shaders (iPhone 7 / iOS 15.8: «Program failed to link: Internal error
 * compiling shader with Metal backend.», thrown in the map chunk) must NEVER get the stop screen - and never again on the next opening.
 * ONE predicate (beside `isUserCancel`), ONE route: a mounted map registers its `fail()` here; crash.tsx hands every uncaught error that
 * is a GL failure while a map is mounted to it instead of the stop screen. The flag `map_gl_failed` {app_version, os_version} sends the
 * next opening straight to the fallback list; an app or OS update clears it; «Спробувати показати карту» clears it and tries once.
 */
const GL_WORDS = /program failed to link|shader|webgl|\bgl context|context lost|metal backend|failed to initialize|createProgram|getContext/i;
const MAP_CHUNK = /inokMap-[\w-]*\.js|maplibre/i;

/** the message or the stack says a GL failure of the map. `byStack` false = the message only: MapLibre's own `error` EVENTS (a tile, a style
 *  swap, a sprite - handled, the map lives on) all come from the map chunk; only an UNCAUGHT error there (or a failed construction) may be
 *  read by its stack (cloud_46 E1: screens 45328638042 - two map screens lost their map to a style-swap error read as GL) */
export function isMapGlFailure(err: unknown, byStack = true): boolean {
  const e = err as { message?: unknown; stack?: unknown } | null;
  const msg = typeof err === 'string' ? err : typeof e?.message === 'string' ? e.message : '';
  const stack = typeof e?.stack === 'string' ? e.stack : '';
  return GL_WORDS.test(msg) || (byStack && MAP_CHUNK.test(stack.split('\n').slice(0, 6).join('\n')));
}

type Fail = (err: unknown) => void;
const mounted = new Set<Fail>();
/** a map while it exists: its `fail` (returns the unregister) */
export const onMapGlFailure = (f: Fail): (() => void) => { mounted.add(f); return () => { mounted.delete(f); }; };
/** crash.tsx: true = it was a map's GL failure (the map fell back; no stop screen) */
export function routeMapGlFailure(err: unknown): boolean {
  if (!mounted.size || !isMapGlFailure(err)) return false;
  for (const f of [...mounted]) f(err);
  return true;
}

const KEY = 'map_gl_failed';
interface Flag { app_version: string; os_version: string }
/** the flag of THIS app and OS version (another = an update: cleared, the map is tried again) */
export async function mapGlFailed(): Promise<boolean> {
  try {
    const v = (await Preferences.get({ key: KEY })).value;
    if (!v) return false;
    const f = JSON.parse(v) as Flag; const os = (await deviceFacts()).os_version;
    if (f.app_version === APP_VERSION && f.os_version === os) return true;
    await Preferences.remove({ key: KEY });
    return false;
  } catch { return false; }
}
export async function markMapGlFailed(): Promise<void> {
  try { await Preferences.set({ key: KEY, value: JSON.stringify({ app_version: APP_VERSION, os_version: (await deviceFacts()).os_version } satisfies Flag) }); } catch { /* the fallback still shows now */ }
}
export async function clearMapGlFailed(): Promise<void> { try { await Preferences.remove({ key: KEY }); } catch { /* nothing kept */ } }
