import { test, expect, type Page } from '@playwright/test';
import { mkdirSync, readFileSync } from 'node:fs';
import { ANDROID_UA, localPictures } from './shared';

/**
 * A-48 (a): the app NEVER dies white. The field case (Sony G3412, Chrome 98): Home renders, 2-3 s later - when the background work
 * (the feed, live status, push) re-renders it - the page goes white and «Back» closes the app. Planted here the same way:
 * 1. a RENDER error that comes only when the fresh feed arrives after the first screen (an engine that throws on a date format -
 *    exactly the old-engine class): THE error screen with the code R-… and the error's first line, not a white page; review shots × 3;
 * 2. an unhandled promise rejection while the app runs -> the screen with P-…;
 * 3. the crash is kept: the next launch shows it again; «Спробувати ще раз» clears it and the app goes on;
 * 4. a window `error` without an Error object (ResizeObserver loop notice) is NOT a crash.
 */
const profiles = JSON.parse(readFileSync(new URL('./profiles.json', import.meta.url), 'utf8')) as Record<string, { viewport: { width: number; height: number }; deviceScaleFactor: number; colorScheme: 'light' | 'dark'; locale: string }>;
const OUT = new URL('./out/', import.meta.url).pathname;
mkdirSync(OUT, { recursive: true });
const REVIEW = ['phone-light', 'phone-dark', 'tablet'];

/** An engine whose long-month date format throws - the feed rows of Home use it, the first screen does not. */
const BREAK_LONG_DATES = () => {
  const Orig = Intl.DateTimeFormat;
  const Fake = function (this: unknown, locale?: string | string[], opts?: Intl.DateTimeFormatOptions) {
    const f = new Orig(locale, opts);
    // cloud_43 (A-147): Home's article rows print the SHORT date (month 2-digit, formatToParts) - the probe breaks both forms
    const boom = () => { throw new RangeError('probe: long month format'); };
    if (opts && (opts.month === 'long' || opts.month === '2-digit')) return { format: boom, formatToParts: boom, resolvedOptions: () => f.resolvedOptions() } as unknown as Intl.DateTimeFormat;
    return f;
  } as unknown as typeof Intl.DateTimeFormat;
  Object.assign(Fake, { supportedLocalesOf: Orig.supportedLocalesOf });
  (Intl as { DateTimeFormat: typeof Intl.DateTimeFormat }).DateTimeFormat = Fake;
};

const crashScreen = async (p: Page, code: RegExp) => {
  const c = p.getByTestId('crash');
  await expect(c).toBeVisible({ timeout: 20_000 });
  await expect(c).toHaveAttribute('data-code', code);
  await expect(p.getByTestId('crash-code')).toContainText(code);
  await expect(p.getByTestId('crash-retry')).toBeVisible();
  return c;
};

for (const profile of REVIEW) {
  const cfg = profiles[profile];
  test.describe(`A-48 crash ${profile}`, () => {
    test.use({ viewport: cfg.viewport, deviceScaleFactor: cfg.deviceScaleFactor, colorScheme: cfg.colorScheme, locale: cfg.locale, userAgent: ANDROID_UA });
    test('a render error after Home = the error screen with code and line, never white', async ({ page }) => {
      await page.addInitScript(BREAK_LONG_DATES);
      await localPictures(page);
      await page.goto('/home');
      const c = await crashScreen(page, /^R-RangeError-[0-9a-f]{4}$|R-RangeError-[0-9a-f]{4}/);
      await expect(page.getByTestId('crash-line')).toContainText('probe: long month format');
      await expect(c).toContainText('Щось пішло не так');
      // D63: the icon is the first-run screen's ion-icon with its strokes DRAWN (the triangle outline + the «!»), not a solid mask
      await expect.poll(() => page.evaluate(() => {
        const svg = document.querySelector('[data-testid="crash-icon"]')?.shadowRoot?.querySelector('svg');
        return svg ? Array.from(svg.querySelectorAll('path, circle')).filter((n) => getComputedStyle(n).stroke !== 'none' && parseFloat(getComputedStyle(n).strokeWidth) > 0).length : -1;
      }), { timeout: 10_000, message: 'stroked shapes of the crash icon' }).toBeGreaterThanOrEqual(2);
      // D64: no «надішліть нам» without a way - the line names inok.info and its «Контакти»
      await expect(page.getByTestId('crash-photo')).toContainText('inok.info');
      await expect(c).not.toContainText('надішліть');
      // the whole column on the screen, the button full-width
      const box = await c.boundingBox();
      expect(box!.y + box!.height).toBeLessThanOrEqual(cfg.viewport.height);
      await page.screenshot({ path: `${OUT}crash__${profile}.png` });
    });
  });
}

test.describe('A-48 crash paths', () => {
  test.use({ viewport: profiles['phone-light'].viewport, deviceScaleFactor: 1, locale: 'uk-UA', userAgent: ANDROID_UA });
  test('an unhandled rejection while the app runs = the screen with P-…', async ({ page }) => {
    await localPictures(page);
    await page.goto('/home');
    await expect(page.getByTestId('tiles')).toBeVisible({ timeout: 30_000 });
    await expect(page.getByTestId('crash')).toHaveCount(0);
    await page.evaluate(() => { void Promise.reject(new TypeError('probe: rejection')); });
    await crashScreen(page, /P-TypeError-[0-9a-f]{4}/);
    await expect(page.getByTestId('crash-line')).toContainText('probe: rejection');
  });
  test('the crash is kept for the next launch; «Спробувати ще раз» clears it and the app goes on', async ({ page }) => {
    await localPictures(page);
    await page.goto('/home');
    await expect(page.getByTestId('tiles')).toBeVisible({ timeout: 30_000 });
    await page.evaluate(() => { setTimeout(() => { throw new SyntaxError('probe: kept'); }, 0); });
    const code = await (await crashScreen(page, /E-SyntaxError-/)).getAttribute('data-code');
    await page.reload(); // the tester closed the app without a photo
    await crashScreen(page, new RegExp(code!));
    await page.getByTestId('crash-retry').click();
    await expect(page.getByTestId('crash')).toHaveCount(0);
    await expect(page.getByTestId('tiles')).toBeVisible();
    await page.reload();
    await expect(page.getByTestId('tiles')).toBeVisible({ timeout: 30_000 });
    await expect(page.getByTestId('crash')).toHaveCount(0);
  });
  test('a window error without an Error object (ResizeObserver notice) is not a crash', async ({ page }) => {
    await localPictures(page);
    await page.goto('/home');
    await expect(page.getByTestId('tiles')).toBeVisible({ timeout: 30_000 });
    await page.evaluate(() => window.dispatchEvent(new ErrorEvent('error', { message: 'ResizeObserver loop completed with undelivered notifications.' })));
    await page.waitForTimeout(300);
    await expect(page.getByTestId('crash')).toHaveCount(0);
  });
});
