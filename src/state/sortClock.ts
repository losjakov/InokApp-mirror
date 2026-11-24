import { Preferences } from '@capacitor/preferences';

/**
 * A-172 (cloud_46): a non-default order of «Публікації» goes back to the default after the app has been AWAY for 3 hours (a phone keeps the
 * process for days - A-97's «kept while the app runs» never ended). The moment the app went to the background is kept in memory AND in
 * Preferences; the app's ONE app-state listener (AppContext, A-51) reports both moves here; back after ≥ SORT_RESET_MS -> the subscribers
 * reset the order (the search text is not touched). A cold start = the default anyway (`sessionSort` starts at 'published').
 */
export const SORT_RESET_MS = 10_800_000;
const KEY = 'sort_bg_at';
let bgAt: number | null = null;
const subs = new Set<() => void>();

export function wentBackground(now: number): void {
  bgAt = now;
  void Preferences.set({ key: KEY, value: String(now) }).catch(() => undefined);
}
/** back in the foreground: true = away ≥ 3 h, the order reset */
export async function cameForeground(now: number): Promise<boolean> {
  let at = bgAt;
  if (at == null) { try { const v = (await Preferences.get({ key: KEY })).value; at = v ? Number(v) : null; } catch { at = null; } }
  bgAt = null;
  void Preferences.remove({ key: KEY }).catch(() => undefined);
  for (const f of [...fronts]) f(); // A-173 (C): the countdowns started at the first foreground inside their window
  if (at == null || !Number.isFinite(at) || now - at < SORT_RESET_MS) return false;
  for (const f of [...subs]) f();
  return true;
}
export const onSortExpired = (f: () => void): (() => void) => { subs.add(f); return () => { subs.delete(f); }; };
/** every return to the foreground (the same ONE app-state listener) */
const fronts = new Set<() => void>();
export const onForeground = (f: () => void): (() => void) => { fronts.add(f); return () => { fronts.delete(f); }; };
