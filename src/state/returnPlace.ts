import { useIonViewDidEnter } from '@ionic/react';
import { useCallback, useEffect } from 'react';

/**
 * A-178 (cloud_46): Back from a publication returns to the SAME place of the list it was opened from - ONE helper for every list that opens
 * a publication («Публікації» on every tab / sort / search / home entry, «Головна»'s blocks, «Недочитані»). The tap keeps the ROW (its
 * data-testid) and where it stood on the screen; when that list shows the row again, its scroller moves so the row stands at the same
 * offset (± a frame), the row is lit ~1 s (the selected colour, fading) and the screen reader's focus is on it. Anchored on the row, not
 * on scrollTop: blocks above it may have changed height meanwhile (Home: +76 px measured by CD). One place per list; used once.
 */
interface Place { testId: string; top: number }
const places = new Map<string, Place>();
export const LIT_MS = 1200;

const shownEl = (testId: string): HTMLElement | undefined => Array.from(document.querySelectorAll<HTMLElement>(`[data-testid="${testId}"]`))
  .find((e) => !e.closest('.ion-page-hidden') && e.getClientRects().length > 0);

/** at the tap: the row and its offset on the screen */
export function rememberPlace(key: string, testId: string): void {
  const el = shownEl(testId);
  if (el) places.set(key, { testId, top: el.getBoundingClientRect().top });
}
/** the tab button's «to the top» (A-27): no place is waiting to pull the list back down */
export function forgetPlaces(): void { places.clear(); }
export const placeWaiting = (key: string): boolean => places.has(key);

/** the list shows rows again: the kept row back at its offset (false = no place, or the row not drawn yet - asked again later) */
export async function restorePlace(key: string): Promise<boolean> {
  const p = places.get(key);
  if (!p) return false;
  const el = shownEl(p.testId);
  if (!el) return false;
  places.delete(key);
  const content = el.closest('ion-content') as HTMLIonContentElement | null;
  const scroller = content?.getScrollElement ? await content.getScrollElement() : (el.closest('.split__pane') as HTMLElement | null);
  if (!scroller) return false;
  const fix = () => { scroller.scrollTop += el.getBoundingClientRect().top - p.top; };
  fix();
  requestAnimationFrame(fix);
  window.setTimeout(fix, 250); // pictures above that settled after the first frame
  el.classList.add('row--back');
  window.setTimeout(() => el.classList.remove('row--back'), LIT_MS);
  const target = (el.shadowRoot?.querySelector('button, a') as HTMLElement | null) ?? el; // IonItem's own native button: TalkBack / VoiceOver land on it
  target.focus({ preventScroll: true });
  return true;
}

/** a list just rendered may draw its rows a few frames later (the page's custom elements hydrate): asked again every 80 ms, ~2 s at most */
async function restoreSoon(key: string, tries = 25): Promise<void> {
  for (let i = 0; i < tries && placeWaiting(key); i++) {
    if (await restorePlace(key)) return;
    await new Promise((r) => window.setTimeout(r, 80));
  }
}

/** ONE hook per list: `mark(testId)` at the tap; the place is restored when the list is `ready` (rows drawn) and when its page is shown again */
export function useReturnPlace(key: string, ready: boolean): (testId: string) => void {
  useEffect(() => { if (ready) void restoreSoon(key); }, [key, ready]);
  useIonViewDidEnter(() => { void restoreSoon(key); });
  return useCallback((testId: string) => rememberPlace(key, testId), [key]);
}
