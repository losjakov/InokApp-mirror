/** A-84 (b): «Нове на сайті» counts as SEEN when Home has been on screen this long (the app in front, not going to YouTube at once). */
export const HOME_SEEN_MS = 1500;

type Doc = Pick<Document, 'visibilityState' | 'addEventListener' | 'removeEventListener'>;
interface Timers { set: (f: () => void, ms: number) => unknown; clear: (h: unknown) => void }
const realTimers: Timers = { set: (f, ms) => window.setTimeout(f, ms), clear: (h) => window.clearTimeout(h as number) };

/** Calls `onSeen` once the page has stayed visible `ms` (re-armed each time the app comes back to the front, cancelled when it leaves).
 *  Returns the stop function (the page left). A cold start by an App Link, a stream tap or another tab never mounts Home = never fires. */
export function whileSeen(onSeen: () => void, ms = HOME_SEEN_MS, doc: Doc = document, timers: Timers = realTimers): () => void {
  let h: unknown;
  const arm = () => {
    if (h !== undefined) { timers.clear(h); h = undefined; }
    if (doc.visibilityState === 'visible') h = timers.set(() => { h = undefined; onSeen(); }, ms);
  };
  arm();
  doc.addEventListener('visibilitychange', arm);
  return () => { if (h !== undefined) timers.clear(h); doc.removeEventListener('visibilitychange', arm); };
}
