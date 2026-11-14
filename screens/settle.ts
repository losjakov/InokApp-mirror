import type { Page } from '@playwright/test';

/**
 * D45 (REVIEW cloud_09): «the shown screen» for a test, and the moment its page transition is OVER — by Ionic's own events, never a sleep.
 * Mechanism of the red matrix (measured 02.11.2026, cloud_10): during a transition the leaving page is still in the DOM and visible —
 * for a same-route jump (`/more/eparchies` → `/more/eparchies/1`, `/monasteries` → `/monasteries/37`) @ionic/react-router even APPENDS
 * a clone of the leaving page (`clonePageElement`) — so «the last visible arrow» could be the arrow of a page that is going away. The
 * first click is refused («ion-router-outlet intercepts pointer events»), the page is then hidden (`ion-page-hidden` = display:none),
 * and Playwright keeps waiting on that same element handle (it re-resolves a locator only when the element is DETACHED) until the
 * test's 60 s run out. Rule: act on the shown page only after `settled`.
 */
export const SHOWN = 'ion-tabs ion-router-outlet > .ion-page:not(.ion-page-hidden)';

/** count every page transition: `ion-router-outlet` emits ionNavWillChange / ionNavDidChange (non-bubbling, so: the capture phase) */
export async function watchTransitions(p: Page): Promise<void> {
  await p.addInitScript(() => {
    const w = window as unknown as { __navBusy: number };
    w.__navBusy = 0;
    document.addEventListener('ionNavWillChange', () => { w.__navBusy += 1; }, true);
    document.addEventListener('ionNavDidChange', () => { w.__navBusy = Math.max(0, w.__navBusy - 1); }, true);
  });
}

/** no transition running and exactly ONE page shown in the tabs' outlet (no leaving page, no clone, nothing still invisible) */
export async function settled(p: Page): Promise<void> {
  await p.waitForFunction((sel) => {
    const busy = (window as unknown as { __navBusy?: number }).__navBusy ?? 0;
    return busy === 0 && document.querySelectorAll(sel).length === 1 && !document.querySelector('.ion-page-invisible');
  }, SHOWN, { timeout: 15_000 });
}

/** a test id on the page that is shown (after `settled`) */
export const onShown = (p: Page, id: string) => p.locator(SHOWN).getByTestId(id).first();
