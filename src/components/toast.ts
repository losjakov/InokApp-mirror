import { useIonToast } from '@ionic/react';
import { closeOutline } from 'ionicons/icons';
import { useCallback, useRef } from 'react';

/**
 * D73 (REVIEW cloud_19; Material 3: a snackbar appears ABOVE the bottom navigation): the ONE way the app shows a short result message (A-15).
 * Every message is anchored to the tab bar's top edge (Ionic `positionAnchor`: the anchor's `getBoundingClientRect`, any engine), so the five
 * tabs stay visible and tappable; a screen without the tab bar (first run, errors) gets the bottom edge, as before.
 */
export function toastAnchor(doc: Pick<Document, 'querySelector'> = document): HTMLElement | undefined {
  const bar = doc.querySelector<HTMLElement>('ion-tab-bar');
  return bar && bar.offsetParent !== null ? bar : undefined; // hidden (display:none) = no anchor: Ionic would warn and misplace it
}

export const TOAST_MS = 2500;
/** A-96 W-6: a confirmation of the person's own tap (the favourite star) - «буквально на две секунды» */
export const FLASH_MS = 2000;

/**
 * One message at a time, and a NEW one REPLACES the shown one (A-96 W-6: star, star again = «Вилучено…» at once, never queued behind
 * «Додано…»): Ionic's `present` ignores a second toast of the hook while the first is up (gotcha cloud_25), so the shown one is dismissed
 * first. Ionic's toast is `role="status"` + `aria-live="polite"`: TalkBack reads it without moving the focus.
 */
export function useToast(): (message: string, o?: { duration?: number; cssClass?: string; testId?: string }) => void {
  const [present, dismiss] = useIonToast();
  const chain = useRef<Promise<unknown>>(Promise.resolve());
  return useCallback((message, o) => {
    chain.current = chain.current.then(() => dismiss()).catch(() => {}).then(() => present({
      message, duration: o?.duration ?? TOAST_MS, cssClass: ['app-toast', o?.cssClass].filter(Boolean).join(' '), position: 'bottom', positionAnchor: toastAnchor(),
      htmlAttributes: o?.testId ? { 'data-testid': o.testId } : undefined,
    }));
  }, [present, dismiss]);
}

/**
 * A-80 ADDENDUM 1: a BANNER = the same snackbar above the tab bar, but it stays until its action or «×» (Material: a snackbar with an
 * action). One at a time: Ionic's `present` ignores a second toast of a hook until the first has dismissed - the next waits for it.
 */
export function useBanner(): (b: { message: string; action: string; onAction: () => void; close: string; testId: string }) => Promise<void> {
  const [present] = useIonToast();
  const closed = useRef<Promise<void>>(Promise.resolve());
  return useCallback(async (b) => {
    await closed.current;
    closed.current = new Promise<void>((done) => void present({
      message: b.message, duration: 0, position: 'bottom', positionAnchor: toastAnchor(), cssClass: 'app-toast app-banner',
      htmlAttributes: { 'data-testid': b.testId }, onDidDismiss: () => done(),
      buttons: [
        { text: b.action, handler: b.onAction, htmlAttributes: { 'data-testid': `${b.testId}-do` } },
        { icon: closeOutline, role: 'cancel', htmlAttributes: { 'aria-label': b.close, 'data-testid': `${b.testId}-close` } },
      ],
    }));
  }, [present]);
}
