import type { Theme } from './settings';
import { applySystemBars } from '@/native/systemBars';

/** Dark or not: the user's choice, else the system's (A-16). Pure — unit-tested. */
export const isDark = (theme: Theme, systemDark: boolean): boolean => (theme === 'system' ? systemDark : theme === 'dark');

const Q = '(prefers-color-scheme: dark)';
let unlisten: (() => void) | null = null;

/** Applies the theme at once: Ionic's class palette (`ion-palette-dark` on <html>, dark.class.css) and the app's own dark
 *  tokens (variables.css) both key on that class; «як у системі» follows the system live. */
export function applyTheme(theme: Theme): void {
  unlisten?.();
  unlisten = null;
  const m = typeof window !== 'undefined' && window.matchMedia ? window.matchMedia(Q) : null;
  const set = () => {
    const dark = isDark(theme, !!m?.matches);
    document.documentElement.classList.toggle('ion-palette-dark', dark);
    // NOTE 6 (cloud_38): the system bars follow the app's theme; the tab bar's colour is read once the palette class is applied
    const bar = document.querySelector('ion-tab-bar');
    void applySystemBars(dark, bar ? getComputedStyle(bar).backgroundColor : undefined);
  };
  set();
  if (theme === 'system' && m) {
    m.addEventListener('change', set);
    unlisten = () => m.removeEventListener('change', set);
  }
}
