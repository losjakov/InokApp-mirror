import { test, expect, type Page } from '@playwright/test';
import { mkdirSync, readFileSync } from 'node:fs';
import { ANDROID_UA, KYIV, localPictures, benignPageError } from './shared';
import { A11Y_PROFILES, axeScreen } from './a11y';

/**
 * cloud_41 (A-132, contract R-58 / R-59): THE RESERVE DOOR in the browser ring. The site's config is played by `window.__inokConfig`
 * (src/data/source.ts); the browser plays Android unless `inok.platform` = ios. The door renders INSTEAD of the app: no tab bar, no header,
 * so these screens have their own small harness (the screen set's toolbar / Back / refresh checks do not apply). Shots
 * `door-*__<profile>.png`; axe 0 on the review profiles.
 */
const profiles = JSON.parse(readFileSync(new URL('./profiles.json', import.meta.url), 'utf8')) as Record<string, { viewport: { width: number; height: number }; deviceScaleFactor: number; colorScheme: 'light' | 'dark'; locale: string }>;
const OUT = new URL('./out/', import.meta.url).pathname;
mkdirSync(OUT, { recursive: true });
const REVIEW = ['phone-light', 'phone-dark', 'tablet'];
const LOW = { min: '1.0.0', recommended: '1.0.0' };
const cfg = (o: object) => (p: Page) => p.addInitScript((c) => { (window as unknown as { __inokConfig: object }).__inokConfig = c; }, o);
const versions = (android: object, ios: object = LOW) => cfg({ versions: { android, ios } });
const door = (p: Page) => p.getByTestId('door');
type S = { name: string; only?: string[]; path?: string; before: (p: Page) => Promise<unknown>; ready: (p: Page) => Promise<unknown> };
const SOFT = versions({ min: '1.0.0', recommended: '99.0.0' });
const HARD = versions({ min: '99.0.0', recommended: '99.0.0' });
const SCREENS: S[] = [
  // R-59 soft: min <= installed < recommended - the words, «Оновити» + «Пізніше»; NO tab bar while it shows
  { name: 'door-soft', only: REVIEW, before: SOFT, ready: async (p) => {
      await expect(door(p)).toHaveAttribute('data-level', 'soft', { timeout: 20_000 });
      await expect(p.getByTestId('door-do')).toBeVisible();
      await expect(p.getByTestId('door-later')).toBeVisible();
      await expect(p.getByTestId('door-title')).toContainText(/Вийшла нова версія|Вышла новая версия|A new version/);
      await expect(p.locator('ion-tab-bar')).toHaveCount(0);
      await expect(p.getByTestId('door-title')).toBeFocused(); // the screen reader starts on the words
    } },
  // «Пізніше»: the app at once (this run); the door is not a lock
  { name: 'door-soft-later', only: ['phone-light'], before: SOFT, ready: async (p) => {
      await expect(door(p)).toBeVisible({ timeout: 20_000 });
      await p.getByTestId('door-later').click();
      await expect(door(p)).toHaveCount(0);
      await expect(p.locator('ion-tab-bar')).toBeVisible();
      await expect(p.getByTestId('home-near').locator('visible=true')).toBeVisible();
    } },
  // R-59 hard: installed < min - ONLY «Оновити»: no «Пізніше», no Back, no tab bar; a deep link behind it is never reached
  { name: 'door-hard', only: REVIEW, before: HARD, ready: async (p) => {
      await expect(door(p)).toHaveAttribute('data-level', 'hard', { timeout: 20_000 });
      await expect(p.getByTestId('door-title')).toContainText(/більше не підтримується|больше не поддерживается|no longer supported/);
      await expect(p.getByTestId('door-do')).toBeVisible();
      await expect(p.getByTestId('door-later')).toHaveCount(0);
      await expect(p.locator('ion-tab-bar, ion-header [data-testid="back"]')).toHaveCount(0);
    } },
  { name: 'door-hard-back', only: ['phone-light'], path: '/monasteries/242', before: HARD, ready: async (p) => {
      await expect(door(p)).toHaveAttribute('data-level', 'hard', { timeout: 20_000 });
      await expect(p.getByTestId('card')).toHaveCount(0); // the link that started the app waits behind the door, unreachable
      // Back in the forms the browser ring can give (the phone's back = Ionic's hardware back event; on a phone Capacitor's own
      // `backButton` listener keeps the WebView's history out of it): Escape, the hardware back event, a history step of the app
      await p.keyboard.press('Escape');
      await p.evaluate(() => { history.pushState({}, '', '/home'); dispatchEvent(new PopStateEvent('popstate')); history.back(); });
      await p.evaluate(() => document.dispatchEvent(new CustomEvent('ionBackButton', { detail: { register: (_: number, h: () => void) => h() } })));
      await expect(door(p)).toHaveAttribute('data-level', 'hard');
      await expect(p.locator('ion-tab-bar')).toHaveCount(0);
    } },
  // the hard door's button on a browser «not from Play» = the Play listing (market:// on a phone through the plugin)
  { name: 'door-hard-update', only: ['phone-light'], before: async (p) => { await HARD(p); await p.addInitScript(() => {
      const w = window as unknown as { __opened: string[] }; w.__opened = []; window.open = ((u: string) => { w.__opened.push(u); return null; }) as typeof window.open; }); },
    ready: async (p) => {
      await p.getByTestId('door-do').click({ timeout: 20_000 });
      await expect.poll(() => p.evaluate(() => (window as unknown as { __opened: string[] }).__opened)).toEqual(['https://play.google.com/store/apps/details?id=info.inok.app']);
      await expect(door(p)).toBeVisible(); // still there: only a new version opens the way
    } },
  // iOS: its own pair only (Android's hard bar does NOT lock an iPhone); its hard bar -> the App Store page (the app's id when no address)
  { name: 'door-ios-own-pair', only: ['phone-light'], before: async (p) => { await versions({ min: '99.0.0', recommended: '99.0.0' })(p); await p.addInitScript(() => localStorage.setItem('inok.platform', 'ios')); },
    ready: async (p) => {
      await expect(p.getByTestId('home-near').locator('visible=true')).toBeVisible({ timeout: 20_000 });
      await p.waitForTimeout(2500); // the config comes after the first screen: the door would have come by now
      await expect(door(p)).toHaveCount(0);
    } },
  { name: 'door-ios-hard', only: ['phone-light'], before: async (p) => {
      await versions(LOW, { min: '99.0.0', recommended: '99.0.0' })(p);
      await p.addInitScript(() => { localStorage.setItem('inok.platform', 'ios'); const w = window as unknown as { __opened: string[] }; w.__opened = []; window.open = ((u: string) => { w.__opened.push(u); return null; }) as typeof window.open; }); },
    ready: async (p) => {
      await expect(door(p)).toHaveAttribute('data-level', 'hard', { timeout: 20_000 });
      await p.getByTestId('door-do').click();
      await expect.poll(() => p.evaluate(() => (window as unknown as { __opened: string[] }).__opened)).toEqual(['https://apps.apple.com/app/id6835134380']);
    } },
  // R-58: the notice WINS over the bars; the site's own words in the interface language; reinstall -> its page
  { name: 'door-notice', only: ['phone-light', 'phone-ru'], before: cfg({
      versions: { android: { min: '1.0.0', recommended: '99.0.0' }, ios: LOW },
      notice: { id: 'n-test', below: '99.0.0', platforms: ['android', 'ios'], action: 'reinstall', level: 'soft',
        title: { uk: 'Перевстановіть застосунок', ru: 'Переустановите приложение', en: 'Reinstall the app' },
        text: { uk: 'Видаліть і встановіть знову.', ru: 'Удалите и установите снова.', en: 'Delete and install again.' } } }),
    ready: async (p) => {
      await expect(door(p)).toHaveAttribute('data-source', 'notice', { timeout: 20_000 });
      await expect(door(p)).toHaveAttribute('data-action', 'reinstall');
      await expect(p.getByTestId('door-title')).toHaveText(/^(Перевстановіть застосунок|Переустановите приложение)$/);
      await expect(p.getByTestId('door-text')).toHaveText(/^(Видаліть і встановіть знову\.|Удалите и установите снова\.)$/);
    } },
  // R-58 reset_data offline: the reason, NOTHING cleared, the door stays
  { name: 'door-reset-offline', only: ['phone-light'], before: async (p) => {
      await cfg({ notice: { id: 'n-reset', below: '99.0.0', platforms: ['android'], action: 'reset_data', level: 'soft' } })(p); },
    ready: async (p) => {
      await expect(door(p)).toHaveAttribute('data-action', 'reset_data', { timeout: 20_000 });
      await expect(p.getByTestId('door-title')).toContainText(/«Обрані», «Я тут був» і налаштування збережуться/);
      await p.evaluate(() => localStorage.setItem('inok.net', JSON.stringify({ connected: false, metered: false, dataSaver: false })));
      await p.getByTestId('door-do').click();
      await expect(p.getByTestId('door-net')).toContainText(/Немає з'єднання/);
      await expect(door(p)).toBeVisible();
    } },
  // never for ever: a bar of a broken form = nothing (the app as always)
  { name: 'door-broken', only: ['phone-light'], before: versions({ min: '1.0', recommended: 'abc' }), ready: async (p) => {
      await expect(p.getByTestId('home-near').locator('visible=true')).toBeVisible({ timeout: 20_000 });
      await p.waitForTimeout(2500);
      await expect(door(p)).toHaveCount(0);
    } },
];

for (const [profile, c] of Object.entries(profiles)) {
  test.describe(`door ${profile}`, () => {
    test.use({ userAgent: ANDROID_UA, viewport: c.viewport, deviceScaleFactor: c.deviceScaleFactor, colorScheme: c.colorScheme, locale: c.locale, geolocation: KYIV, permissions: ['geolocation'], timezoneId: 'UTC' });
    for (const s of SCREENS) {
      if (s.only && !s.only.includes(profile)) continue;
      test(s.name, async ({ page }) => {
        const errors: string[] = [];
        page.on('pageerror', (e) => { if (!benignPageError(e)) errors.push(String(e)); });
        await localPictures(page);
        await s.before(page);
        await page.goto(s.path ?? '/home');
        await s.ready(page);
        await page.mouse.move(0, 0);
        await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur?.());
        await page.waitForTimeout(300);
        await page.screenshot({ path: `${OUT}${s.name}__${profile}.png` });
        expect(errors).toEqual([]);
        if (A11Y_PROFILES.includes(profile)) expect(await axeScreen(page, s.name, profile), 'axe WCAG 2.1 A + AA').toEqual([]);
      });
    }
  });
}
