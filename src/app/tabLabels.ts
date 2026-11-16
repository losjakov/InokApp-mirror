import { useLayoutEffect } from 'react';

/**
 * cloud_38 (REVIEW cloud_37 NOTE 3, A-97 «never cut»): the five tab labels share the bar by their own length (app.css); on a narrow phone
 * at the largest system text they did not fit and Ionic cut them («Монаст…», «Кар…», «Щ..»). THE rule: one size for all five - the chrome
 * size (capped, app.css) or, when the five do not fit side by side, scaled down exactly until they do (never below MIN_PX). Pure - unit-tested.
 * @param room   the bar's width minus every button's own padding
 * @param widths each label's width at the chrome size
 * @returns the factor (<= 1) the label size is multiplied by
 */
export const MIN_TAB_LABEL_PX = 9;
export function tabLabelScale(room: number, widths: number[], chromePx: number): number {
  const need = widths.reduce((a, b) => a + b, 0);
  if (need <= 0 || need <= room) return 1;
  return Math.max(MIN_TAB_LABEL_PX / chromePx, Math.floor((room / need) * 1000) / 1000);
}

/** Measures the bar (its size, the labels, the system text size) and writes `--inok-tab-label-scale` on it. The element is found in the
 *  DOM (`ion-tab-bar`): Ionic's React wrapper does not hand a DOM node to a ref (a ref here crashed the app - the screens caught it). */
export function useFitTabLabels(deps: unknown[]): void {
  useLayoutEffect(() => {
    const el = document.querySelector<HTMLElement>('ion-tab-bar');
    if (!el?.style) return;
    const fit = () => {
      el.style.setProperty('--inok-tab-label-scale', '1');
      const btns = Array.from(el.querySelectorAll('ion-tab-button'));
      const labels = btns.map((b) => b.querySelector('ion-label')).filter((l): l is HTMLIonLabelElement => !!l);
      if (!labels.length) return;
      const pad = btns.reduce((a, b) => { const s = getComputedStyle(b); return a + (parseFloat(s.paddingLeft) || 0) + (parseFloat(s.paddingRight) || 0) + 4; }, 0); // + Ionic's 2 + 2 px
      const widths = labels.map((l) => l.scrollWidth);
      const px = parseFloat(getComputedStyle(labels[0]).fontSize) || 12;
      let k = tabLabelScale(el.clientWidth - pad, widths, px);
      el.style.setProperty('--inok-tab-label-scale', String(k));
      // the 48 dp floor of a short tab («Ще») takes room the formula gave to the words: measured again, 4 % less until none is cut
      for (let i = 0; i < 12 && k * px > MIN_TAB_LABEL_PX && labels.some((l) => l.scrollWidth > l.clientWidth + 0.5); i++) {
        k = Math.max(MIN_TAB_LABEL_PX / px, Math.round(k * 0.96 * 1000) / 1000);
        el.style.setProperty('--inok-tab-label-scale', String(k));
      }
    };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(el);
    return () => ro.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- the labels' words (language) and the system text size
  }, deps);
}
