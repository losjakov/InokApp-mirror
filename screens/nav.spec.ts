import { test, expect, type Page } from '@playwright/test';
import { onShown, settled, watchTransitions } from './settle';
import { ANDROID_UA, KYIV, benignPageError } from './shared';

/**
 * A-27 / D44 (owner, his phone, 01.11.2026 20:58): a bottom tab button ALWAYS opens its own top screen; a screen opened FROM another
 * screen returns there on Back and never stays in another tab's history. The FULL matrix: every cross-screen jump × (at the
 * destination | after Back) × each of the 5 tab buttons; plus: the active tab's button = its top screen scrolled up; a top screen
 * keeps its own state (search text) across tab switches. The header arrow = the system Back (one handler, src/app/backButton.ts).
 */
const ROOTS = { monasteries: '/monasteries', map: '/map', streams: '/streams', articles: '/articles', more: '/more' } as const;
type Tab = keyof typeof ROOTS;
const TABS = Object.keys(ROOTS) as Tab[];
/** what proves the top screen is the one shown (not a detail left in its stack) */
const TOP: Record<Tab, string> = { monasteries: 'search', map: 'map', streams: 'channels', articles: 'kinds', more: 'more-list' };

const vis = (p: Page, id: string) => p.getByTestId(id).locator('visible=true').first();
const tab = (p: Page, t: Tab) => p.locator(`ion-tab-button[tab="${t}"]`).click();
/** the arrow of the SHOWN screen, once its transition is over (D45: a leaving page's arrow, or its clone's, is never the target) */
const back = async (p: Page) => { await settled(p); await onShown(p, 'back').click(); };
const urlOf = (p: Page) => { const u = new URL(p.url()); return u.pathname.replace(/\/$/, '') + u.search; };

/** each tab button in turn (starting with the tab the jump ENDED in, i.e. the active one) lands on that tab's top screen */
async function everyTabIsTop(p: Page, first: Tab) {
  for (const t of [first, ...TABS.filter((x) => x !== first)]) {
    await tab(p, t);
    await expect.poll(() => urlOf(p), { message: `tab ${t}` }).toBe(ROOTS[t]);
    await expect(vis(p, TOP[t])).toBeVisible();
  }
}

type Jump = { name: string; from: string; fromReady: string; go: (p: Page) => Promise<void>; to: RegExp; toTab: Tab };
/** what proves the DESTINATION is the page shown (D45: the map loads lazily — for ~0.4 s after the URL changed the old page is still the
 *  only one shown, and its arrow would be taken for the destination's) */
const SHOWN_AT: [RegExp, string][] = [[/^\/map/, 'map'], [/^\/monasteries\/\d+$/, 'card'], [/^\/articles\?id=/, 'article'], [/^\/monasteries$/, 'search'], [/^\/more\/eparchies(\/\d+|\?id=\d+)$/, 'eparchy-title']];
async function arrived(p: Page) {
  const id = SHOWN_AT.find(([re]) => re.test(urlOf(p)))?.[1];
  await settled(p);
  if (id) await expect(onShown(p, id)).toBeVisible({ timeout: 20_000 });
  await settled(p);
}
const JUMPS: Jump[] = [
  { name: 'eparchy → its map', from: '/more/eparchies/1', fromReady: 'eparchy-title', go: (p) => vis(p, 'eparchy-map').click(), to: /^\/map\?eparchy=1$/, toTab: 'map' },
  { name: 'eparchy → a house card', from: '/more/eparchies/1', fromReady: 'eparchy-title', go: (p) => p.locator('[data-testid^="mrow-"]').locator('visible=true').first().click(), to: /^\/monasteries\/\d+$/, toTab: 'monasteries' },
  { name: 'card → map', from: '/monasteries/37', fromReady: 'show-on-map', go: (p) => vis(p, 'show-on-map').click(), to: /^\/map\?code=37$/, toTab: 'map' },
  { name: 'card → related article', from: '/monasteries/242', fromReady: 'related-publication', go: async (p) => { await vis(p, 'related-publication').scrollIntoViewIfNeeded(); await vis(p, 'related-publication').locator('[data-testid^="arow-"]').first().click(); }, to: /^\/articles\?id=\d+$/, toTab: 'articles' },
  { name: 'home → newest article', from: '/home', fromReady: 'home-new', go: (p) => vis(p, 'home-new').locator('xpath=following::*[starts-with(@data-testid,"arow-")][1]').click(), to: /^\/articles\?id=\d+$/, toTab: 'articles' },
  { name: 'home → nearby card', from: '/home', fromReady: 'home-near', go: (p) => p.locator('[data-testid^="mrow-"]').locator('visible=true').first().click(), to: /^\/monasteries\/\d+$/, toTab: 'monasteries' },
  { name: 'home tile → the monasteries list', from: '/home', fromReady: 'tile-monasteries', go: (p) => vis(p, 'tile-monasteries').click(), to: /^\/monasteries$/, toTab: 'monasteries' },
  { name: 'contacts → its map', from: '/more/contacts', fromReady: 'contacts-minimap', go: (p) => vis(p, 'contacts-minimap').click(), to: /^\/map\?at=[\d.]+,[\d.]+$/, toTab: 'map' },
  { name: 'eparchies list → eparchy', from: '/more/eparchies', fromReady: 'eparchy-list', go: (p) => p.locator('[data-testid^="erow-"]').locator('visible=true').first().click(), to: /^\/more\/eparchies(\/\d+|\?id=\d+)$/, toTab: 'more' }, // F2: the tablet's `?id=`
];

for (const [profile, viewport] of [['phone', { width: 360, height: 780 }], ['tablet', { width: 800, height: 1280 }]] as const) test.describe(`A-27 tabs ${profile}`, () => {
  test.use({ userAgent: ANDROID_UA, viewport, locale: 'uk-UA', geolocation: KYIV, permissions: ['geolocation'] });
  // a page error during a transition broke every later tab tap on the emulator (run 41342920913): none is allowed anywhere here
  let errors: string[] = [];
  test.beforeEach(async ({ page }) => { errors = []; page.on('pageerror', (e) => { if (!benignPageError(e)) errors.push(String(e)); }); await watchTransitions(page); });
  test.afterEach(() => { expect(errors, 'page errors').toEqual([]); });

  test('a map with a selected house left alive in its tab, then eparchy → its map → Back: tabs still work, no error', async ({ page: p }) => {
    await p.goto('/map?code=37');
    await expect(p.getByTestId('map')).toHaveAttribute('data-ready', '1', { timeout: 20_000 });
    await expect(vis(p, 'map-card-details')).toBeVisible();
    await tab(p, 'more'); await vis(p, 'more-eparchies').click();
    await p.locator('[data-testid^="erow-"]').locator('visible=true').first().click();
    await expect(vis(p, 'eparchy-title')).toBeVisible();
    const eparchy = urlOf(p);
    await vis(p, 'eparchy-map').click();
    await expect.poll(() => urlOf(p)).toMatch(/^\/map\?eparchy=/);
    await arrived(p);
    await back(p);
    await expect.poll(() => urlOf(p)).toBe(eparchy);
    await everyTabIsTop(p, 'monasteries');
  });

  test('the owner\'s path: eparchy → map → Back → eparchy; then «Ще» from any tab = the menu', async ({ page: p }) => {
    await p.goto('/home');
    await tab(p, 'more'); await vis(p, 'more-eparchies').click();
    await p.locator('[data-testid^="erow-"]').locator('visible=true').first().click();
    await expect(vis(p, 'eparchy-title')).toBeVisible();
    const eparchy = urlOf(p);
    await vis(p, 'eparchy-map').click();
    await expect(p.getByTestId('map')).toHaveAttribute('data-ready', '1', { timeout: 20_000 });
    await back(p);
    await expect.poll(() => urlOf(p)).toBe(eparchy);
    for (const t of ['monasteries', 'map', 'streams', 'articles'] as Tab[]) {
      await tab(p, t); await tab(p, 'more');
      await expect.poll(() => urlOf(p), { message: `«Ще» after ${t}` }).toBe('/more');
      await expect(vis(p, 'more-list')).toBeVisible();
    }
  });

  for (const j of JUMPS) {
    for (const after of ['at the destination', 'after Back'] as const) {
      test(`${j.name}: ${after} every tab button = its top screen`, async ({ page: p }) => {
        await p.goto(j.from);
        await expect(vis(p, j.fromReady)).toBeVisible({ timeout: 20_000 });
        const from = urlOf(p);
        await j.go(p);
        await expect.poll(() => urlOf(p)).toMatch(j.to);
        await arrived(p);
        let first: Tab = j.toTab;
        if (after === 'after Back') {
          await back(p);
          await expect.poll(() => urlOf(p), { message: 'Back returns where the screen was opened from' }).toBe(from);
          first = (TABS.find((t) => from.startsWith(ROOTS[t])) ?? 'monasteries');
        }
        await everyTabIsTop(p, first);
      });
    }
  }

  test('a tab tapped WHILE the Back transition still runs is not lost (D45: the app side of the race)', async ({ page: p }) => {
    // a pushed page on every profile: «Ще» → «Єпархії» (F2: on the tablet an eparchy row no longer pushes a page - it fills the pane)
    await p.goto('/more');
    await vis(p, 'more-eparchies').click();
    await expect.poll(() => urlOf(p)).toBe('/more/eparchies');
    await expect(vis(p, 'eparchy-list')).toBeVisible({ timeout: 20_000 });
    // record how many transitions run at the moment the tab bar receives the tap
    await p.evaluate(() => document.querySelector('ion-tab-bar')!.addEventListener('click', () => {
      const w = window as unknown as { __navBusy: number; __busyAtTap: number }; w.__busyAtTap = w.__navBusy; }, { capture: true, once: true }));
    await settled(p);
    // the page transitions 10x slower (Chromium DevTools: Animation.setPlaybackRate), so the tap surely lands inside the Back transition
    const cdp = await p.context().newCDPSession(p);
    await cdp.send('Animation.enable'); await cdp.send('Animation.setPlaybackRate', { playbackRate: 0.1 });
    await onShown(p, 'back').click();
    await p.waitForFunction(() => (window as unknown as { __navBusy: number }).__navBusy > 0); // the Back transition has started
    await tab(p, 'streams');
    await expect.poll(() => urlOf(p)).toBe('/streams');
    await settled(p);
    await expect(onShown(p, 'channels')).toBeVisible();
    expect(await p.evaluate(() => (window as unknown as { __busyAtTap: number }).__busyAtTap), 'the tap landed inside the Back transition').toBeGreaterThan(0);
  });

  test('the active tab button: a detail → its top screen; the top screen → scrolled to the top', async ({ page: p }) => {
    await p.goto('/more');
    await vis(p, 'more-eparchies').click();
    await p.locator('[data-testid^="erow-"]').locator('visible=true').first().click();
    await expect(vis(p, 'eparchy-title')).toBeVisible();
    await tab(p, 'more');
    await expect.poll(() => urlOf(p)).toBe('/more');
    await tab(p, 'monasteries');
    // the list's scroller: the page's ion-content on a phone, the list pane on a tablet (F2: two scrollers)
    const content = p.locator('ion-content').filter({ has: p.getByTestId('list') }).locator('visible=true').first();
    const top = (set?: number) => content.evaluate(async (c, v) => {
      const s = c.querySelector<HTMLElement>('.split__pane.split__list') ?? await (c as HTMLIonContentElement).getScrollElement();
      if (v != null) s.scrollTop = v;
      return s.scrollTop;
    }, set);
    await top(1200);
    await expect.poll(() => top()).toBeGreaterThan(500);
    await tab(p, 'monasteries');
    await expect.poll(() => top()).toBe(0);
  });

  test('a top screen keeps its state: the search text survives a tab switch', async ({ page: p }) => {
    await p.goto('/monasteries');
    const input = vis(p, 'search').locator('input');
    await input.fill('лавра');
    await expect.poll(() => urlOf(p)).toBe('/monasteries');
    await tab(p, 'streams'); await tab(p, 'monasteries');
    await expect(vis(p, 'search').locator('input')).toHaveValue('лавра');
  });
});
