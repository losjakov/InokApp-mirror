import { test, expect, type Page } from '@playwright/test';
import { mkdirSync, readFileSync } from 'node:fs';
import { ANDROID_UA, KYIV, localPictures, picturesSettled } from './shared';
import { settled, watchTransitions } from './settle';

/**
 * A-43: «Поділитися» at the END of every list / item screen that has a page on the site - one button, the address of the same page
 * in the interface language. Each shot = the screen scrolled to its end: the button whole, above the tab bar, nothing over it.
 */
const profiles = JSON.parse(readFileSync(new URL('./profiles.json', import.meta.url), 'utf8')) as Record<string, { viewport: { width: number; height: number }; deviceScaleFactor: number; colorScheme: 'light' | 'dark'; locale: string }>;
const OUT = new URL('./out/', import.meta.url).pathname;
mkdirSync(OUT, { recursive: true });
const REVIEW = ['phone-light', 'phone-dark', 'tablet'];

type S = { name: string; path: string; url: string; ready: string; before?: (p: Page) => Promise<unknown> };
const SCREENS: S[] = [
  { name: 'monasteries', path: '/monasteries', url: 'https://inok.info/monasteries/', ready: 'list' },
  { name: 'eparchies', path: '/more/eparchies', url: 'https://inok.info/dioceses/', ready: 'eparchy-list' },
  { name: 'eparchy', path: '/more/eparchies/1', url: 'https://inok.info/dioceses/1/', ready: 'eparchy-houses' },
  { name: 'streams', path: '/streams', url: 'https://inok.info/live/', ready: 'channels' },
  { name: 'articles', path: '/articles', url: 'https://inok.info/articles/', ready: 'articles' },
  { name: 'articles-video', path: '/articles', url: 'https://inok.info/articles/video/', ready: 'articles', before: (p) => p.getByTestId('kind-tab-video').locator('visible=true').click() },
  { name: 'article', path: '/articles?id=2869', url: 'https://inok.info/articles/publications/2869/', ready: 'article' },
  { name: 'commission', path: '/more/commission', url: 'https://inok.info/about/', ready: 'share-footer' },
  { name: 'contacts', path: '/more/contacts', url: 'https://inok.info/about/contacts/', ready: 'contacts' },
];

for (const profile of REVIEW) {
  const cfg = profiles[profile];
  test.describe(`A-43 share ${profile}`, () => {
    test.use({ userAgent: ANDROID_UA, viewport: cfg.viewport, deviceScaleFactor: cfg.deviceScaleFactor, colorScheme: cfg.colorScheme, locale: cfg.locale, geolocation: KYIV, permissions: ['geolocation'] });
    for (const s of SCREENS) {
      test(s.name, async ({ page }) => {
        const errors: string[] = [];
        page.on('pageerror', (e) => errors.push(String(e)));
        await localPictures(page);
        await watchTransitions(page);
        await page.goto(s.path);
        await expect(page.getByTestId(s.ready).locator('visible=true').first()).toBeVisible({ timeout: 30_000 });
        if (s.before) { await s.before(page); await page.waitForTimeout(300); }
        await settled(page);
        // the monasteries list pages in as it scrolls (PLAN 6): its button comes after the LAST page
        for (let i = 0; i < 40 && await page.getByTestId('list-more').locator('visible=true').count(); i++) {
          await page.getByTestId('list-more').locator('visible=true').first().scrollIntoViewIfNeeded();
          await page.waitForTimeout(150);
        }
        const share = page.locator(`[data-testid="share-footer"][data-url="${s.url}"]`).locator('visible=true');
        await expect(share, 'ONE share button with this address').toHaveCount(1, { timeout: 15_000 });
        await share.scrollIntoViewIfNeeded();
        await picturesSettled(page);
        await page.waitForTimeout(250);
        // the last block of the screen's content, the whole button above the tab bar (nothing covers it)
        const box = (await share.boundingBox())!;
        const tabTop = await page.locator('ion-tab-bar').evaluate((b) => b.getBoundingClientRect().top);
        expect(box.y + box.height, 'the button above the tab bar').toBeLessThanOrEqual(tabTop + 0.5);
        const covered = await share.locator('ion-button').evaluate((b) => { const r = b.getBoundingClientRect(); const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2); return !(hit && (b.contains(hit) || hit.contains(b) || b.shadowRoot?.contains(hit))); });
        expect(covered, 'nothing over the button').toBe(false);
        expect(await share.locator('ion-button').textContent()).toContain(cfg.locale.startsWith('uk') ? 'Поділитися' : '');
        await page.mouse.move(0, 0);
        await page.screenshot({ path: `${OUT}share-${s.name}__${profile}.png` });
        expect(errors).toEqual([]);
      });
    }
  });
}
