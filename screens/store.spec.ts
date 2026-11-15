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
 * A-74 (1): the STORE-SHOT RING - the emulator script's own frame list (scripts/emu_store.sh PHONE / TABLET, parsed here, never copied) walked in
 * the browser with the SAME read-backs (scripts/store_checks.mjs): the app started in en, the language switched in «Ще → Мова» and read back,
 * the export's unit words read back per language (A-75 (1)), every frame's «drawn» element, its pre-shot click (the map's one zoom step, the
 * tablets' «Публікації» tab), no dialog; then the dark theme read back. Frame 06 uses the fixture's R-39 article (the emulator: $ART, live).
 * A-78 4: the frames' `;`-separated steps (a css click or `do:<action>`, scripts/store_checks.mjs ACTIONS) run as the emulator runs them; after
 * them the frame's read-back: the map's three lavra pins whole (phone 03), the eye's gold (02), the stars' token (06), the selected row in view.
 */
const EMU = readFileSync(new URL('../scripts/emu_store.sh', import.meta.url), 'utf8');
const frames = (name: 'PHONE' | 'TABLET') => {
  const block = EMU.slice(EMU.indexOf(`${name}=(`), EMU.indexOf(')\n', EMU.indexOf(`${name}=(`)) + 1);
  const phone = name === 'TABLET' ? frames('PHONE') : [];
  const items: string[][] = [];
  // a TABLET entry is either a literal "a|b|c|d[|e]" or a slice of PHONE ("${PHONE[@]:from:count}")
  for (const m of block.matchAll(/"\$\{PHONE\[@\]:(\d+):(\d+)\}"|"([^"\\]*(?:\\.[^"\\]*)*)"/g)) {
    if (m[1] != null) items.push(...phone.slice(Number(m[1]), Number(m[1]) + Number(m[2])));
    else items.push(m[3].replace(/\\"/g, '"').replace('$ART', '1832').split('|'));
  }
  return items;
};
const RING = { phone: { viewport: { width: 360, height: 640 }, set: 'PHONE' }, tablet: { viewport: { width: 960, height: 540 }, set: 'TABLET' } } as const;
for (const [device, cfg] of Object.entries(RING)) test.describe(`store ring ${device}`, () => {
  test.use({ userAgent: ANDROID_UA, viewport: cfg.viewport, colorScheme: 'light', locale: 'en-US', geolocation: KYIV, permissions: ['geolocation'] });
  test('the emulator frame list, read back as the run does', async ({ page }) => {
    test.setTimeout(240_000);
    const check = (name: keyof typeof CHECKS) => page.evaluate((x) => String((0, eval)(x)), CHECKS[name]);
    const act = (name: keyof typeof ACTIONS) => page.evaluate(async (x) => String(await (0, eval)(x)), ACTIONS[name]);
    const go = (path: string) => page.evaluate((x) => { const st = { key: Math.random().toString(36).slice(2, 8) }; history.pushState(st, '', x); dispatchEvent(new PopStateEvent('popstate', { state: st })); }, path);
    const onTop = (css: string) => page.locator(css).locator('visible=true').last();
    // a DOM click, as the emulator's emu_nav.mjs does (CI screens 42476738475: a pointer click waited 4 min behind the entering page's transition)
    const tap = async (css: string) => { await expect(onTop(css)).toBeVisible({ timeout: 20_000 }); await onTop(css).evaluate((e) => (e as HTMLElement).click()); };
    await localPictures(page);
    // the live eye of card 242 (1146 on 08.11.2026) - the emulator's frame 02 waits for it
    await page.route('**/fixtures/views.json', async (r) => r.fulfill({ json: { ...JSON.parse(readFileSync('fixtures/views.json', 'utf8')), 'monasteries/242/views': 1146 } }));
    // the live «Публікації» list holds 1832 (the fixture's feed does not): the fixture feed + 1832 of the R-39 sample, for `do:showSelected`
    await page.route(/\/fixtures\/articles\.json$/, async (r) => { const j = await (await r.fetch()).json(); const art = JSON.parse(readFileSync('fixtures/articles_links.json', 'utf8')).uk.items.find((x: { id: number }) => x.id === 1832);
      await r.fulfill({ json: { ...j, items: [...j.items, ...Array.from({ length: 12 }, (_, k) => ({ ...j.items[0], id: 900 + k })), art] } }); });
    await page.addInitScript(() => { if (!sessionStorage.getItem('ring')) { localStorage.setItem('CapacitorStorage.settings', JSON.stringify({ lang: 'en', asked: ['articles', 'streams'] })); sessionStorage.setItem('ring', '1'); } });
    await page.goto('/home');
    await expect(onTop('[data-testid="home-near"]')).toBeVisible({ timeout: 20_000 });
    const list = frames(cfg.set);
    expect(list.length, `${cfg.set} frames`).toBe(cfg.set === 'PHONE' ? 7 : 6);
    for (const lang of ['uk', 'ru', 'en'] as const) {
      await go('/more/language'); await tap(`[data-testid="lang-${lang}"]`);
      await expect.poll(() => check('lang')).toBe(lang);
      for (const path of ['/monasteries/242', '/monasteries']) {
        await go(path); await expect(onTop(path === '/monasteries' ? '[data-testid^="mrow-"]' : '[data-testid="card"] .card__sub')).toBeVisible();
        expect(await check('units'), `${lang} ${path}`).toBe('ok');
      }
      for (const [name, path, ready, , click] of list) {
        await go(path);
        await expect(onTop(ready), `${lang} ${name}: ${ready}`).toBeVisible({ timeout: 20_000 });
        for (const step of click && click !== '-' ? click.split(';') : []) {
          if (!step.startsWith('do:')) { await tap(step); continue; }
          if (name === 'map') await expect(page.getByTestId('map').locator('visible=true')).toHaveAttribute('data-drawn', '1', { timeout: 30_000 });
          await expect.poll(() => act(step.slice(3) as keyof typeof ACTIONS), { timeout: 30_000, message: `${lang} ${name}: ${step}` }).toBe('ok');
        }
        if (click?.includes('do:fitLavras')) {
          await expect(page.getByTestId('map').locator('visible=true')).toHaveAttribute('data-drawn', '1', { timeout: 30_000 });
          expect(await check('lavras'), `${lang} ${name}: the three lavras whole`).toBe('ok');
        }
        if (click?.includes('do:showSelected')) {
          await expect(onTop('[data-testid="arow-1832"]')).toBeInViewport();
          expect(await check('articleTop'), `${lang} ${name}: the article's top beside the list (A-79 5)`).toBe('ok');
        }
        if (name === 'card') expect(await check('eye'), `${lang} card: the gold eye`).toBe('ok');
        if (name === 'article') expect(await check('stars'), `${lang} article: the stars' token`).toBe('ok');
        expect(await check('dialog'), `${lang} ${name}`).toBe('clear');
        expect(await check('lang'), `${lang} ${name}`).toBe(lang);
      }
    }
    await go('/more'); await tap('[data-testid="theme-dark"]');
    await expect.poll(() => check('theme')).toBe('dark');
  });
});

/**
 * cloud_36 (B5, A-115): the App Store screenshots - the same app in fixtures mode, the sizes Apple asks for: iPhone 6.9" 1320 x 2868
 * (440 x 956 @3) and iPad 13" 2064 x 2752 (1032 x 1376 @2), uk / ru / en, six frames, the section «Публікації» opening on «Статті»
 * (A-117 (2)). JPEG (Apple: PNG or JPEG, no transparency). Only on demand (APPSTORE=1 npx playwright test … store.spec): the drafts go to
 * store/ios/screenshots/<lang>/ by hand, as the Play drafts did; the screens job never spends time on them.
 */
const APPSTORE = new URL('./out/appstore/', import.meta.url).pathname;
const IOS_DEVICES = { iphone: { viewport: { width: 440, height: 956 }, deviceScaleFactor: 3, size: [1320, 2868] }, ipad: { viewport: { width: 1032, height: 1376 }, deviceScaleFactor: 2, size: [2064, 2752] } } as const;
const IOS_LOCALES = { uk: 'uk-UA', ru: 'ru-RU', en: 'en-US' } as const;
const IOS_SHOTS: typeof SHOTS = [
  // «Головна» with the newest publications (a first start has none cached: «Оновити дані» as a person would) - never an empty block
  { name: 'home', path: '/home', ready: async (p) => {
      await SHOTS[0].ready(p);
      const fresh = p.locator('[data-testid="home-new"] ~ * [data-testid^="arow-"], ion-list [data-testid^="arow-"]').locator('visible=true');
      if (!(await fresh.count())) await p.getByTestId('home-fresh').locator('visible=true').click();
      await expect(fresh.first()).toBeVisible({ timeout: 20_000 });
      await expect(p.locator('ion-toast').locator('visible=true')).toHaveCount(0, { timeout: 15_000 }); // «Дані оновлено» gone
      await expect(p.locator('ion-header [data-testid="refresh"] ion-spinner, ion-header ion-spinner').locator('visible=true')).toHaveCount(0, { timeout: 15_000 });
      await p.evaluate(async () => { for (const c of Array.from(document.querySelectorAll('ion-content'))) await (c as HTMLIonContentElement).scrollToTop(0); }); // the click scrolled it
    } },
  { name: 'publications', path: '/articles', ready: async (p) => { await expect(p.locator('[data-testid^="arow-"]').locator('visible=true').first()).toBeVisible(); } },
  SHOTS[1], SHOTS[2], SHOTS[3], SHOTS[4],
];
for (const [lang, locale] of Object.entries(IOS_LOCALES)) for (const [device, cfg] of Object.entries(IOS_DEVICES)) test.describe(`appstore ${lang} ${device}`, () => {
  test.skip(!process.env.APPSTORE, 'App Store drafts: APPSTORE=1 only');
  test.use({ userAgent: ANDROID_UA, viewport: cfg.viewport, deviceScaleFactor: cfg.deviceScaleFactor, colorScheme: 'light', locale, geolocation: KYIV, permissions: ['geolocation'] });
  for (const [i, s] of IOS_SHOTS.entries()) test(s.name, async ({ page }) => {
    mkdirSync(`${APPSTORE}${lang}`, { recursive: true });
    await localPictures(page);
    await watchTransitions(page);
    await page.goto(s.path);
    await s.ready(page);
    await settled(page);
    await picturesSettled(page);
    await page.mouse.move(0, 0);
    await page.waitForTimeout(400);
    expect(await page.evaluate(() => document.documentElement.lang)).toBe(lang);
    if (s.name === 'publications') await expect(page.locator('[data-testid="kind-tab-publication"]').locator('visible=true')).toHaveClass(/segment-button-checked/);
    const shot = await page.screenshot({ path: `${APPSTORE}${lang}/${i + 1}-${s.name}__${device}.jpg`, type: 'jpeg', quality: 88 });
    expect([shot.readUInt16BE(shot.indexOf(Buffer.from([0xff, 0xc0])) + 7), shot.readUInt16BE(shot.indexOf(Buffer.from([0xff, 0xc0])) + 5)], 'Apple\'s exact size').toEqual([...cfg.size]);
  });
});
