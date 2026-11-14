import type { Theme } from './settings';

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
  const set = () => document.documentElement.classList.toggle('ion-palette-dark', isDark(theme, !!m?.matches));
  set();
  if (theme === 'system' && m) {
    m.addEventListener('change', set);
    unlisten = () => m.removeEventListener('change', set);
  }
}
