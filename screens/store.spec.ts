import { test, expect } from '@playwright/test';
import { mkdirSync, readFileSync } from 'node:fs';
// @ts-expect-error - a plain ESM module of scripts/ (no types): THE read-backs of a store frame
import { ACTIONS, CHECKS } from '../scripts/store_checks.mjs';
import { settled, watchTransitions } from './settle';
import { ANDROID_UA, KYIV, localPictures, mapReady, picturesSettled } from './shared';

/**
 * Stage 5: the Google Play screenshots — the app's own screens in fixtures mode (no mock-ups), uk (the listing's default language).
 * Play: PNG/JPEG, each side 320…3840 px, the long side ≤ 2× the short one → phone 360×720 @3 = 1080×2160 (2:1), tablet 800×1280 @2.
 * Output screens/out/store/<n>-<screen>__<device>.png (the screens artifact); drafts for the owner in store/screenshots/.
 */
const OUT = new URL('./out/store/', import.meta.url).pathname;
mkdirSync(OUT, { recursive: true });
const DEVICES = { phone: { viewport: { width: 360, height: 720 }, deviceScaleFactor: 3 }, tablet: { viewport: { width: 800, height: 1280 }, deviceScaleFactor: 2 } };
const SHOTS: { name: string; path: string; ready: (p: import('@playwright/test').Page) => Promise<void> }[] = [
  { name: 'home', path: '/home', ready: async (p) => { await expect(p.getByTestId('home-near').locator('visible=true')).toBeVisible(); } },
  { name: 'monasteries', path: '/monasteries', ready: async (p) => { await expect(p.locator('[data-testid^="mrow-"]').first()).toBeVisible(); } },
  { name: 'card', path: '/monasteries/242', ready: async (p) => { await expect(p.getByTestId('card').locator('visible=true')).toBeVisible(); } },
  { name: 'map', path: '/map', ready: (p) => mapReady(p) },
  { name: 'streams', path: '/streams', ready: async (p) => { await expect(p.locator('[data-testid^="srow-"], [data-testid^="stream-"]').first()).toBeVisible(); } },
  { name: 'eparchy', path: '/more/eparchies/1', ready: async (p) => { await expect(p.getByTestId('eparchy-title').locator('visible=true')).toBeVisible(); } },
  { name: 'article', path: '/articles?id=2869', ready: async (p) => { await expect(p.locator('.aview').locator('visible=true').first()).toBeVisible(); } },
];

for (const [device, cfg] of Object.entries(DEVICES)) test.describe(`store ${device}`, () => {
  test.use({ userAgent: ANDROID_UA, ...cfg, colorScheme: 'light', locale: 'uk-UA', geolocation: KYIV, permissions: ['geolocation'] });
  for (const [i, s] of SHOTS.entries()) test(s.name, async ({ page }) => {
    await localPictures(page);
    await watchTransitions(page);
    await page.goto(s.path);
    await s.ready(page);
    await settled(page);
    await picturesSettled(page);
    await page.mouse.move(0, 0);
    await page.waitForTimeout(400);
    const file = `${OUT}${i + 1}-${s.name}__${device}.png`;
    await page.screenshot({ path: file });
    const { width, height } = page.viewportSize()!;
    const [w, h] = [width * cfg.deviceScaleFactor, height * cfg.deviceScaleFactor];
    expect(Math.max(w, h) / Math.min(w, h), 'Play: the long side ≤ 2× the short one').toBeLessThanOrEqual(2);
    expect(Math.min(w, h)).toBeGreaterThanOrEqual(320); expect(Math.max(w, h)).toBeLessThanOrEqual(3840);
  });
});

/**
 * A-74 (1): the STORE-SHOT RING - THE frame list of the store sets (scripts/store_frames.txt: Google Play's emulator run and the App Store's
 * simulator run read it, never a copy) walked in the browser with the SAME read-backs (scripts/store_checks.mjs): the app started in en, the
 * language switched in «Ще → Мова» and read back, the export's unit words read back per language (A-75 (1)), every frame's «drawn» element,
 * its pre-shot steps (`;`-separated: a css click or `do:<action>`), then the frame's read-backs as scripts/store_lib.sh makes them: the dark
 * frames in the dark theme (A-120 (4): «Головна» dark FIRST), nothing over the frame, every picture in view loaded (A-122), card 242's
 * gallery in the app, «Публікації» on «Статті», the three lavras whole, the article's top beside the list, the eye's gold and the stars' token.
 */
const FRAMES = readFileSync(new URL('../scripts/store_frames.txt', import.meta.url), 'utf8');
const frames = (set: 'phone' | 'tablet') => FRAMES.split('\n').filter((l) => l.startsWith(`${set}|`)).map((l) => l.replace('$ART', '1832').split('|').slice(1));
const RING = { phone: { viewport: { width: 360, height: 640 }, n: 8 }, tablet: { viewport: { width: 960, height: 540 }, n: 7 } } as const;
for (const [device, cfg] of Object.entries(RING)) test.describe(`store ring ${device}`, () => {
  test.use({ userAgent: ANDROID_UA, viewport: cfg.viewport, colorScheme: 'light', locale: 'en-US', geolocation: KYIV, permissions: ['geolocation'] });
  test('the store frame list, read back as the runs do', async ({ page }) => {
    test.setTimeout(360_000);
    const check = (name: keyof typeof CHECKS) => page.evaluate((x) => String((0, eval)(x)), CHECKS[name]);
    const act = (name: keyof typeof ACTIONS) => page.evaluate(async (x) => String(await (0, eval)(x)), ACTIONS[name]);
    const go = (path: string) => page.evaluate((x) => { const st = { key: Math.random().toString(36).slice(2, 8) }; history.pushState(st, '', x); dispatchEvent(new PopStateEvent('popstate', { state: st })); }, path);
    const onTop = (css: string) => page.locator(css).locator('visible=true').last();
    // a DOM click, as the emulator's emu_nav.mjs does (CI screens 42476738475: a pointer click waited 4 min behind the entering page's transition)
    const tap = async (css: string) => { await expect(onTop(css)).toBeVisible({ timeout: 20_000 }); await onTop(css).evaluate((e) => (e as HTMLElement).click()); };
    const theme = async (t: 'light' | 'dark') => { await go('/more'); await tap(`[data-testid="theme-${t}"]`); await expect.poll(() => check('theme')).toBe(t); };
    await localPictures(page);
    // the live eye of card 242 (1146 on 08.11.2026) - the frame «card» waits for it
    await page.route('**/fixtures/views.json', async (r) => r.fulfill({ json: { ...JSON.parse(readFileSync('fixtures/views.json', 'utf8')), 'monasteries/242/views': 1146 } }));
    // the live «Статті» list holds 1832 (the fixture's feed does not): the fixture feed + 1832 of the R-39 sample, for `do:showSelected`
    // cloud_41 (NOTE 4; mirror screens 44166204794: «Response has been disposed»): a request the page dropped while its fixture was read is
    // left alone - the handler never throws into the test
    await page.route(/\/fixtures\/articles\.json$/, async (r) => { let j; try { j = await (await r.fetch()).json(); } catch { await r.abort().catch(() => {}); return; } const art = JSON.parse(readFileSync('fixtures/articles_links.json', 'utf8')).uk.items.find((x: { id: number }) => x.id === 1832);
      await r.fulfill({ json: { ...j, items: [...j.items, ...Array.from({ length: 12 }, (_, k) => ({ ...j.items[0], id: 900 + k })), art] } }); });
    await page.addInitScript(() => { if (!sessionStorage.getItem('ring')) { localStorage.setItem('CapacitorStorage.settings', JSON.stringify({ lang: 'en', photos: 'any', asked: ['articles', 'streams'] })); sessionStorage.setItem('ring', '1'); } });
    await page.goto('/home');
    await expect(onTop('[data-testid="home-near"]')).toBeVisible({ timeout: 20_000 });
    const list = frames(device as 'phone' | 'tablet');
    expect(list.map(([f]) => f), `${device} frames (A-122)`).toEqual(device === 'phone'
      ? ['01-home-dark', '02-home', '03-card', '04-eparchy', '05-map', '06-monasteries', '07-publications', '08-article']
      : ['01-home-dark', '02-home', '03-card', '04-eparchy', '05-map', '06-monasteries', '07-publications-article']);
    expect(list.length).toBe(cfg.n);
    for (const lang of ['uk', 'ru', 'en'] as const) {
      await go('/more/language'); await tap(`[data-testid="lang-${lang}"]`);
      await expect.poll(() => check('lang')).toBe(lang);
      for (const path of ['/monasteries/242', '/monasteries']) {
        await go(path); await expect(onTop(path === '/monasteries' ? '[data-testid^="mrow-"]' : '[data-testid="card"] .card__sub')).toBeVisible();
        expect(await check('units'), `${lang} ${path}`).toBe('ok');
      }
      for (const [name, path, ready, steps] of list) {
        const dark = name.endsWith('-dark');
        if (dark) await theme('dark');
        await go(path);
        await expect(onTop(ready), `${lang} ${name}: ${ready}`).toBeVisible({ timeout: 20_000 });
        for (const step of steps && steps !== '-' ? steps.split(';') : []) {
          if (!step.startsWith('do:')) { await tap(step); continue; }
          if (name.includes('map')) await expect(page.getByTestId('map').locator('visible=true')).toHaveAttribute('data-drawn', '1', { timeout: 30_000 });
          await expect.poll(() => act(step.slice(3) as keyof typeof ACTIONS), { timeout: 30_000, message: `${lang} ${name}: ${step}` }).toBe('ok');
        }
        if (steps?.includes('do:fitLavras')) {
          await expect(page.getByTestId('map').locator('visible=true')).toHaveAttribute('data-drawn', '1', { timeout: 30_000 });
          expect(await check('lavras'), `${lang} ${name}: the three lavras whole`).toBe('ok');
        }
        if (steps?.includes('do:showSelected')) {
          await expect(onTop('[data-testid="arow-1832"]')).toBeInViewport();
          expect(await check('articleTop'), `${lang} ${name}: the article's top beside the list (A-79 5)`).toBe('ok');
          expect(await check('listTop'), `${lang} ${name}: the list starts on a whole row (NOTE 7)`).toBe('ok');
        }
        if (steps?.includes('do:wholeRows')) expect(await check('rowsWhole'), `${lang} ${name}: no row cut by the tab bar (NOTE 9)`).toBe('ok');
        if (name.includes('map')) expect(await check('mapview'), `${lang} ${name}: the view on Ukraine, the canvas sized (D16)`).toBe('ok');
        expect(await check('crash'), `${lang} ${name}: never the crash screen (E11)`).toBe('none');
        if (name.includes('card')) { expect(await check('eye'), `${lang} card: the gold eye`).toBe('ok'); expect(await check('gallery'), `${lang} card: the gallery in the app`).toBe('in-app'); }
        if (name.includes('article')) expect(await check('stars'), `${lang} article: the stars' token`).toBe('ok');
        if (name.includes('publications')) expect(await check('kind'), `${lang} ${name}: «Статті» active`).toBe('publication');
        await expect.poll(() => check('photos'), { timeout: 30_000, message: `${lang} ${name}: every picture in view loaded` }).toBe('ok');
        await expect.poll(() => check('overlays'), { timeout: 20_000, message: `${lang} ${name}: nothing over the frame` }).toBe('clear');
        expect(await check('lang'), `${lang} ${name}`).toBe(lang);
        expect(await check('theme'), `${lang} ${name}`).toBe(dark ? 'dark' : 'light');
        if (dark) await theme('light');
      }
    }
  });
});
