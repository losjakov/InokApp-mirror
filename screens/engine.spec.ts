import { test, expect, type Page } from '@playwright/test';
import { mkdirSync, readFileSync } from 'node:fs';
import { ANDROID_UA, KYIV, localPictures, mapReady, toastAboveTabs } from './shared';

/**
 * A-46 / A-47 (old phones). Three proofs in the browser (the API 26 emulator ships WebView 69, below every floor):
 * 1. the first-run screen tells the cause apart (server code / no answer / engine below the floor) - review shots × 3 profiles;
 * 2. dist/error.html (what Capacitor shows below `minWebViewVersion`) - the same engine texts, both Play links - × 3 profiles;
 * 3. «the Chrome 89 API surface»: every API newer than the floor is DELETED before the app starts (the page; the map worker is
 *    built to the floor with its own polyfills) - the first run imports the directory, the list opens, the map draws, no page error.
 *    Syntax is held by the build target (chrome89) and checked in dist here.
 */
const profiles = JSON.parse(readFileSync(new URL('./profiles.json', import.meta.url), 'utf8')) as Record<string, { viewport: { width: number; height: number }; deviceScaleFactor: number; colorScheme: 'light' | 'dark'; locale: string }>;
const OUT = new URL('./out/', import.meta.url).pathname;
mkdirSync(OUT, { recursive: true });
const REVIEW = ['phone-light', 'phone-dark', 'tablet'];
const UA_70 = ANDROID_UA.replace(/Chrome\/[\d.]+/, 'Chrome/70.0.3538.110');

type Cause = { name: string; cause: string; code: RegExp | null; ua?: string; route: (p: Page) => Promise<unknown> };
const CAUSES: Cause[] = [
  // the field case of 04.11: the network works, the server refuses (403) - it used to say «Потрібен інтернет»
  { name: 'first-run-server', cause: 'server', code: /HTTP-403/, route: (p) => p.route('**/fixtures/manifest.json', (r) => r.fulfill({ status: 403, contentType: 'application/json', body: '{"error":"forbidden"}' })) },
  { name: 'first-run-network', cause: 'network', code: /NET-FAIL/, route: (p) => p.route('**/fixtures/manifest.json', (r) => r.abort('connectionrefused')) },
  { name: 'first-run-engine', cause: 'engine', code: /ENG-70/, ua: UA_70, route: (p) => p.route('**/fixtures/manifest.json', (r) => r.abort('connectionrefused')) },
];

for (const profile of REVIEW) {
  const cfg = profiles[profile];
  test.describe(`A-46 ${profile}`, () => {
    test.use({ viewport: cfg.viewport, deviceScaleFactor: cfg.deviceScaleFactor, colorScheme: cfg.colorScheme, locale: cfg.locale });
    for (const c of CAUSES) {
      test.describe(c.name, () => {
        test.use({ userAgent: c.ua ?? ANDROID_UA });
        test('the cause, its text and its code', async ({ page }) => {
          await c.route(page);
          await page.goto('/home');
          const gate = page.getByTestId('first-run');
          await expect(gate).toBeVisible({ timeout: 20_000 });
          await expect(gate).toHaveAttribute('data-cause', c.cause);
          if (c.code) await expect(page.getByTestId('first-run-code')).toHaveText(c.code);
          if (c.cause === 'engine') {
            await expect(gate.getByText('Android System WebView', { exact: false }).first()).toBeVisible();
            await expect(gate).toContainText('70');
            await expect(gate).toContainText('89');
          } else await expect(gate).not.toContainText('Потрібен інтернет');
          // D64: a code to photograph always says for whom and where (inok.info «Контакти»), never «надішліть нам»
          await expect(gate).not.toContainText('надішліть');
          if (c.cause === 'server') await expect(page.getByTestId('first-run-photo')).toContainText('inok.info');
          // nothing cut: the whole column is on the screen at the largest phone, buttons full-width
          const box = await gate.boundingBox();
          expect(box!.y + box!.height).toBeLessThanOrEqual(cfg.viewport.height);
          await page.mouse.move(0, 0);
          await page.screenshot({ path: `${OUT}${c.name}__${profile}.png` });
        });
      });
    }
    test.describe('webview-error', () => {
      test.use({ userAgent: ANDROID_UA.replace(/Chrome\/[\d.]+/, 'Chrome/69.0.3497.100') });
      test('error.html: the engine texts, the version read from the agent, both Play links', async ({ page }) => {
        await page.goto('/error.html');
        await expect(page.locator('#t')).toHaveText('Оновіть Android System WebView / Chrome');
        await expect(page.locator('#b')).toContainText('69');
        await expect(page.locator('#b')).toContainText('89');
        await expect(page.locator('#w')).toHaveAttribute('href', 'market://details?id=com.google.android.webview');
        await expect(page.locator('#c')).toHaveAttribute('href', 'market://details?id=com.android.chrome');
        await page.screenshot({ path: `${OUT}webview-error__${profile}.png` });
      });
    });
  });
}

/** Everything newer than Chrome 89 that a modern Chromium has - deleted before any script of the app runs. */
const NEWER_THAN_FLOOR = () => {
  const del = (o: any, k: string) => { try { if (o && k in o) delete o[k]; } catch { /* non-configurable */ } };
  for (const C of [Array, String, Int8Array, Uint8Array, Uint8ClampedArray, Int16Array, Uint16Array, Int32Array, Uint32Array, Float32Array, Float64Array]) del(C.prototype, 'at'); // 92
  del(Object, 'hasOwn'); // 93
  for (const k of ['findLast', 'findLastIndex']) del(Array.prototype, k); // 97
  del(window, 'structuredClone'); // 98
  for (const k of ['timeout', 'any']) del(AbortSignal, k); // 103, 116
  del(AbortSignal.prototype, 'throwIfAborted'); // 100
  for (const k of ['toSorted', 'toReversed', 'toSpliced', 'with']) del(Array.prototype, k); // 110
  for (const k of ['isWellFormed', 'toWellFormed']) del(String.prototype, k); // 111
  del(Object, 'groupBy'); del(Map, 'groupBy'); // 117
  del(Promise, 'withResolvers'); del(Promise, 'try'); // 119, 128
  del(Array, 'fromAsync'); // 121
  for (const k of ['union', 'intersection', 'difference', 'symmetricDifference', 'isSubsetOf', 'isSupersetOf', 'isDisjointFrom']) del(Set.prototype, k); // 122
  del(URL, 'canParse'); del(URL, 'parse'); // 120, 126
  del(Crypto.prototype, 'randomUUID'); // 92
  del(Element.prototype, 'checkVisibility'); // 105
  del(HTMLElement.prototype, 'inert'); // 102
  // A-48: Intl DATA too - the floor's ICU has tzdata before 2022b, where `Europe/Kyiv` does not exist (RangeError on Chrome 98)
  const DTF = Intl.DateTimeFormat;
  const OldDTF = function (this: unknown, l?: string | string[], o?: Intl.DateTimeFormatOptions) {
    if (o && o.timeZone === 'Europe/Kyiv') throw new RangeError('Invalid time zone specified: Europe/Kyiv');
    return new DTF(l, o);
  } as unknown as typeof Intl.DateTimeFormat;
  Object.assign(OldDTF, { supportedLocalesOf: DTF.supportedLocalesOf });
  Object.defineProperty(OldDTF, 'prototype', { value: DTF.prototype });
  (Intl as { DateTimeFormat: typeof Intl.DateTimeFormat }).DateTimeFormat = OldDTF;
  (window as any).__floorProbe = { at: 'at' in Array.prototype, randomUUID: 'randomUUID' in Crypto.prototype, timeout: 'timeout' in AbortSignal };
};

test.describe('A-46 the Chrome 89 API surface', () => {
  test.use({ userAgent: ANDROID_UA, viewport: profiles['phone-light'].viewport, deviceScaleFactor: 1, locale: 'uk-UA', geolocation: KYIV, permissions: ['geolocation'] });
  test('first run imports, the list opens with the lavras, a card opens, the map draws - no page error', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(String(e)));
    page.on('console', (m) => { if (m.type() === 'error') errors.push(`console: ${m.text()}`.slice(0, 300)); });
    page.on('worker', (w) => w.evaluate(() => 0).catch(() => {}));
    await page.addInitScript(NEWER_THAN_FLOOR);
    await localPictures(page);
    await page.goto('/monasteries');
    // the probe ran first: the APIs were gone when the app's own code started (`.at` back = our polyfill, nothing else)
    expect(await page.evaluate(() => (window as any).__floorProbe)).toEqual({ at: false, randomUUID: false, timeout: false });
    await expect(page.locator('[data-testid^="mrow-"]').first()).toBeVisible({ timeout: 30_000 });
    expect(await page.evaluate(() => typeof (Array.prototype as any).at === 'function' && typeof (Object as any).hasOwn === 'function'), 'the floor polyfills installed').toBe(true);
    await page.screenshot({ path: `${OUT}old-engine-list__phone-light.png` });
    await page.locator('[data-testid^="mrow-"]').first().click();
    await expect(page.getByTestId('card').locator('visible=true')).toBeVisible({ timeout: 20_000 });
    await page.goto('/map');
    await mapReady(page).catch((e) => { throw new Error(`${e}\n${errors.join('\n')}`); });
    await page.screenshot({ path: `${OUT}old-engine-map__phone-light.png` });
    expect(errors, 'page errors on the floor API surface').toEqual([]);
  });
  test('A-48: Home stays alive 10 s with the live status and the feed (the reference phone went white here), then every tab', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(String(e)));
    await page.addInitScript(NEWER_THAN_FLOOR);
    await localPictures(page);
    await page.goto('/home');
    await expect(page.getByTestId('tiles')).toBeVisible({ timeout: 30_000 });
    // what Home starts in its first seconds: the live status (the calendar strip, «Зараз в ефірі») and the feed («Нове на сайті»)
    await expect(page.getByTestId('calendar')).toBeVisible({ timeout: 15_000 });
    await expect(page.locator('[data-testid^="arow-"]').first()).toBeVisible({ timeout: 15_000 });
    await page.waitForTimeout(10_000);
    await expect(page.getByTestId('crash'), 'the error screen').toHaveCount(0);
    await expect(page.getByTestId('tiles')).toBeVisible();
    await page.screenshot({ path: `${OUT}old-engine-home__phone-light.png` });
    // D73 on the floor surface: the result message is anchored above the tab bar (Ionic positionAnchor = getBoundingClientRect only)
    await page.getByTestId('refresh').locator('visible=true').click();
    await toastAboveTabs(page, 'ion-toast.refresh-toast');
    for (const [tab, ready] of [['monasteries', '[data-testid^="mrow-"]'], ['streams', '[data-testid="channels"]'], ['articles', '[data-testid^="arow-"]'], ['more', '[data-testid="more-eparchies"]']] as const) {
      await page.goto(`/${tab}`);
      await expect(page.locator(ready).locator('visible=true').first(), tab).toBeVisible({ timeout: 20_000 });
    }
    await expect(page.getByTestId('crash')).toHaveCount(0);
    expect(errors, 'page errors on the floor API surface').toEqual([]);
  });
  test('the bundle holds no syntax newer than the floor (class static blocks = Chrome 94) - the map worker included', async () => {
    const { readdirSync } = await import('node:fs');
    const dir = new URL('../dist/assets/', import.meta.url).pathname;
    const js = readdirSync(dir).filter((f) => /\.(m?js)$/.test(f));
    const worker = js.find((f) => f.startsWith('mapWorker-'));
    expect(worker, 'the map worker is built by Vite').toBeTruthy();
    // a bare import of MapLibre's dist worker was tree-shaken to a 530-byte file (no tiles, cloud_16): MapLibre's code must be inside
    expect(readFileSync(dir + worker, 'utf8').length, 'MapLibre inside the worker bundle').toBeGreaterThan(200_000);
    const offenders = js.filter((f) => /\bstatic\s*\{/.test(readFileSync(dir + f, 'utf8')));
    expect(offenders).toEqual([]);
  });
});
