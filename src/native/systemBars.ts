import { registerPlugin, SystemBars, SystemBarsStyle, SystemBarType } from '@capacitor/core';
import { isAndroid, isNative } from './platform';

/** Local plugin (android/app/src/main/java/info/inok/app/WindowColorsPlugin.java): the window colour under the system bars. */
const WindowColors = registerPlugin<{ set(o: { top: string; bottom: string }): Promise<void> }>('WindowColors');

/** THE header colour (variables.css `--inok-toolbar-bg`; the same in both themes) */
export const TOOLBAR_BG = '#0c6486';

/** a computed CSS colour (`rgb(r, g, b)` / `rgba(…)`) as `#rrggbb`; anything else = null */
export function hexOf(css: string): string | null {
  const m = /^rgba?\((\d+),\s*(\d+),\s*(\d+)/.exec(css.trim());
  if (!m) return /^#[0-9a-f]{6}$/i.test(css.trim()) ? css.trim().toLowerCase() : null;
  return '#' + m.slice(1, 4).map((v) => Number(v).toString(16).padStart(2, '0')).join('');
}

/**
 * cloud_38 (REVIEW cloud_37 NOTE 6: a LIGHT status bar above the app's DARK theme): the system bars follow the APP's theme. The status bar
 * lies over the header (teal in both themes) - its icons light; the navigation bar's icons follow the tab bar (light theme = dark icons);
 * on Android the window under the bars takes the header's and the tab bar's colours (seen where the WebView does not reach under them).
 * Never throws: a bar that cannot be styled leaves the system's look.
 */
export async function applySystemBars(dark: boolean, tabBarCss?: string): Promise<void> {
  if (!isNative()) return;
  const bottom = (tabBarCss && hexOf(tabBarCss)) ?? (dark ? '#1f1f1f' : '#ffffff');
  await Promise.all([
    SystemBars.setStyle({ style: SystemBarsStyle.Dark, bar: SystemBarType.StatusBar }).catch(() => undefined),
    SystemBars.setStyle({ style: dark ? SystemBarsStyle.Dark : SystemBarsStyle.Light, bar: SystemBarType.NavigationBar }).catch(() => undefined),
    isAndroid() ? WindowColors.set({ top: TOOLBAR_BG, bottom }).catch(() => undefined) : Promise.resolve(),
  ]);
}
