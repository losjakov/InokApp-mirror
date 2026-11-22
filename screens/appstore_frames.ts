import { test, expect } from '@playwright/test';
import { mkdirSync, readFileSync } from 'node:fs';
// @ts-expect-error - a plain ESM module of scripts/ (no types): THE store actions / read-backs
import { ACTIONS, CHECKS } from '../scripts/store_checks.mjs';
import { KYIV, localPictures, picturesSettled } from './shared';

/**
 * cloud_40 (A-129, C1): the App Store frames 04-eparchy / 05-map that a GPU-less CI simulator cannot draw (WebGL), made from the SAME code in
 * the browser engine with the DEVICE's own layout numbers, measured by the simulator in the same run (`insets-<device>.json`: the safe-area
 * insets, the root text size WKWebView takes from -apple-system-body, the CSS viewport, the scale) - so every row sits where it sits on the
 * device. The iPhone's marks (status bar, home indicator) are NOT drawn here: scripts/appstore_join.py cuts them from that run's real
 * simulator frames of the same size, theme and language. The line-up = scripts/store_frames.txt (phone = iPhone, tablet = iPad).
 */
const INSETS = process.env.INSETS ?? '';
const IOS_UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148';
const OUT = process.env.APPSTORE_RAW ?? new URL('./out/appstore_raw/', import.meta.url).pathname;
const frames = readFileSync(new URL('../scripts/store_frames.txt', import.meta.url), 'utf8').split('\n')
  .filter((l) => /^(phone|tablet)\|0[45]-/.test(l)).map((l) => l.split('|'));
type Insets = { top: number; right: number; bottom: number; left: number; rootPx: number; w: number; h: number; dpr: number };

// cloud_44 (A-168 (3)): the 6.3-inch iPhone gets its OWN 04 / 05 at its own measured numbers (never the 6.9-inch frames scaled - 1.0.17 had those)
for (const [set, device] of [['phone', 'iphone'], ['phone', 'iphone63'], ['tablet', 'ipad']] as const) for (const lang of ['uk', 'ru', 'en'] as const) {
  test(`${device} ${lang}`, async ({ browser }) => {
    test.skip(!INSETS, 'INSETS=<dir> (the simulator run\'s insets-<device>.json)');
    const ins: Insets = JSON.parse(readFileSync(`${INSETS}/insets-${device}.json`, 'utf8'));
    // cloud_42: the site serves its pictures to a normal mobile engine, not to «HeadlessChrome» (the live export's pictures come from inok.info)
    const page = await browser.newPage({ userAgent: IOS_UA, viewport: { width: ins.w, height: ins.h }, deviceScaleFactor: ins.dpr, colorScheme: 'light',
      locale: { uk: 'uk-UA', ru: 'ru-RU', en: 'en-US' }[lang], geolocation: KYIV, permissions: ['geolocation'] });
    await page.addInitScript(({ i, l }) => {
      localStorage.setItem('inok.platform', 'ios'); // the iPhone's branches of the one code (no Play links)
      localStorage.setItem('CapacitorStorage.settings', JSON.stringify({ lang: l, theme: 'light', photos: 'any', asked: ['articles', 'streams'], ownDevice: true }));
      document.addEventListener('DOMContentLoaded', () => {
        const st = document.createElement('style'); // the device's safe areas (the app reads --safe-area-inset-* before env()) and root text size
        st.textContent = `:root { --safe-area-inset-top: ${i.top}px; --safe-area-inset-right: ${i.right}px; --safe-area-inset-bottom: ${i.bottom}px;`
          + ` --safe-area-inset-left: ${i.left}px; } html { font-size: ${i.rootPx}px !important; }`;
        document.head.append(st);
      });
    }, { i: ins, l: lang });
    await localPictures(page);
    const act = (name: string) => page.evaluate(async (x) => String(await (0, eval)(x)), ACTIONS[name]);
    const check = (name: string) => page.evaluate((x) => String((0, eval)(x)), CHECKS[name]);
    mkdirSync(`${OUT}/${lang}/${device}`, { recursive: true });
    for (const [, name, path, ready, steps] of frames.filter((f) => f[0] === set)) {
      await page.goto(path);
      await expect(page.locator(ready).locator('visible=true').last()).toBeVisible({ timeout: 60_000 });
      if (name.includes('map')) await expect(page.getByTestId('map').locator('visible=true')).toHaveAttribute('data-drawn', '1', { timeout: 60_000 });
      for (const step of steps && steps !== '-' ? steps.split(';') : []) if (step.startsWith('do:')) await expect.poll(() => act(step.slice(3)), { timeout: 30_000 }).toBe('ok');
      if (name.includes('map')) { await page.waitForTimeout(1500); expect(await check('mapview'), `${lang} ${name}`).toBe('ok'); }
      // the eparchy page's own mini-map (two-pane on the iPad): drawn before the shot, as every map of the set
      for (const mm of await page.locator('[data-testid="minimap-canvas"]').locator('visible=true').all()) await expect(mm).toHaveAttribute('data-ready', '1', { timeout: 60_000 });
      await page.waitForTimeout(2500); // the tiles of the last camera
      await picturesSettled(page);
      await expect.poll(() => check('photos'), { timeout: 30_000 }).toBe('ok');
      await expect.poll(() => check('overlays'), { timeout: 20_000 }).toBe('clear');
      expect(await check('lang')).toBe(lang);
      expect(await check('crash')).toBe('none');
      await page.mouse.move(0, 0); await page.waitForTimeout(500);
      await page.screenshot({ path: `${OUT}/${lang}/${device}/${name}.png` });
    }
    await page.close();
  });
}
