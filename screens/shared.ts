import { expect, type Page } from '@playwright/test';
import { existsSync, readFileSync } from 'node:fs';

/** Shared by the review screens (screens.spec.ts) and the store screenshots (store.spec.ts) — one copy of each rule. */
/** D20: the fixtures' pictures are served from fixtures/img/<URL path> (scripts/fetch_fixture_images.py) — no network, the review sees them. */
export const IMG = new URL('../fixtures/img', import.meta.url).pathname;
const TYPES: Record<string, string> = { jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp', svg: 'image/svg+xml' };
export const localPictures = (p: Page) => p.route('https://inok.info/images/**', (r) => {
  const path = new URL(r.request().url()).pathname; const file = `${IMG}${decodeURIComponent(path)}`;
  return existsSync(file) ? r.fulfill({ body: readFileSync(file), contentType: TYPES[path.split('.').pop()!.toLowerCase()] ?? 'application/octet-stream' }) : r.continue();
});
/** D20: every <img> in the viewport has finished (loaded or failed) before the shot — no grey box that is only «not yet». */
export const picturesSettled = (p: Page) => expect.poll(() => p.evaluate(() => Array.from(document.images).filter((i) => {
  const b = i.getBoundingClientRect(); return b.bottom > 0 && b.top < innerHeight && b.width > 0 && !i.complete; }).length), { timeout: 15_000 }).toBe(0);
export const ANDROID_UA = 'Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36';
export const KYIV = { latitude: 50.4501, longitude: 30.5234 };
/** D61 after a camera jump: `jumpTo` fires movestart (drawn 0); the map's own `idle` with the houses in place sets it back - never a timer
 *  (cloud_16: a 3 s + 1.2 s wait missed the re-clustered pins on a slow CI runner, 2 of 477 red) */
export const jumpDrawn = async (p: Page, camera: { center: [number, number]; zoom: number }) => {
  await p.evaluate((c) => (window as any).__inokMap.jumpTo(c), camera);
  await expect(p.getByTestId('map')).toHaveAttribute('data-drawn', '1', { timeout: 30_000 });
};
export const mapReady = async (p: Page, markers = '18') => {
  await expect(p.getByTestId('map')).toHaveAttribute('data-ready', '1', { timeout: 20_000 });
  await expect(p.getByTestId('map')).toHaveAttribute('data-markers', markers);
  // D61: the map's own «drawn» signal (MapLibre `idle`: no movement, the view's tiles loaded), never a timer; the probe proves the signal tells the truth
  await expect(p.getByTestId('map')).toHaveAttribute('data-drawn', '1', { timeout: 30_000 });
  // cloud_16 (CI, slow runner; the cloud_15 base fails it too under CPU throttling): «drawn» came while a re-fit / the symbol placement
  // still had 0 pins on screen - wait on the TRUTH (our marks rendered), then on «drawn» again; never a timer
  if (markers !== '0' && await p.evaluate(() => !!(window as unknown as { __inokMap?: unknown }).__inokMap)) {
    await expect.poll(() => p.evaluate(() => (window as any).__inokMap.queryRenderedFeatures({ layers: ['points', 'lavras', 'clusters'] }).length),
      { timeout: 30_000, message: 'our marks rendered' }).toBeGreaterThan(0);
    await expect(p.getByTestId('map')).toHaveAttribute('data-drawn', '1', { timeout: 30_000 });
  }
  if (await p.evaluate(() => !!(window as unknown as { __inokMap?: unknown }).__inokMap)) {
    expect(await p.evaluate(() => { const m = (window as any).__inokMap; return m.areTilesLoaded() && !m.isMoving(); }), 'drawn = tiles loaded, not moving').toBe(true);
  }
};

/** D73 (Material 3: a snackbar sits ABOVE the bottom navigation): the message `sel` is shown and its bottom edge is at or above the tab bar's top. */
export const toastAboveTabs = (p: Page, sel: string) => expect.poll(() => p.evaluate((s) => {
  const w = document.querySelector(s)?.shadowRoot?.querySelector('.toast-wrapper');
  const bar = document.querySelector('ion-tab-bar');
  if (!w || !bar) return 'no toast or no tab bar';
  const a = w.getBoundingClientRect(), b = bar.getBoundingClientRect();
  return a.height > 0 && a.bottom <= b.top + 0.5 ? 'above' : `toast bottom ${Math.round(a.bottom)} > tab bar top ${Math.round(b.top)}`;
}, sel), { timeout: 2500 }).toBe('above');
