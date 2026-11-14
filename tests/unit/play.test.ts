import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Capacitor Preferences in node: a Map (the app's store of the offer's marks)
const store = new Map<string, string>();
vi.mock('@capacitor/preferences', () => ({
  Preferences: {
    get: async ({ key }: { key: string }) => ({ value: store.get(key) ?? null }),
    set: async ({ key, value }: { key: string; value: string }) => { store.set(key, value); },
  },
}));
const shared = vi.hoisted(() => ({ calls: [] as unknown[] }));
vi.mock('@capacitor/share', () => ({ Share: { share: async (o: unknown) => { shared.calls.push(o); } } }));

import { AVAILABLE, checkUpdate, immediateUpdate, notFromPlay, openListing, playListingUrl, shareApp, storeLinksShown, type PlayUpdateInfo } from '@/native/play';
import { BANNER_PAUSE_DAYS, decideOffer, FLEXIBLE_STALE_DAYS, startupOffer, UPDATE_CHECK_MS } from '@/state/updateOffer';
import { versionBelow } from '@/app/version';
import type { AppConfig } from '@/data/api/types';

const DAY = 86_400_000;
const g = globalThis as { __inokPlay?: unknown };
/** the plugin, mocked: what Play answers + what the app asked of it */
function mockPlay(info: Partial<PlayUpdateInfo> | Error) {
  const asked: string[] = [];
  g.__inokPlay = {
    getAppUpdateInfo: async () => { asked.push('info'); if (info instanceof Error) throw info; return { updateAvailability: 1, ...info }; },
    openAppStore: async (o: object) => { asked.push(`store ${JSON.stringify(o)}`); },
    performImmediateUpdate: async () => { asked.push('immediate'); return { code: 0 }; },
    startFlexibleUpdate: async () => { asked.push('flexible'); return { code: 0 }; },
    completeFlexibleUpdate: async () => { asked.push('complete'); },
    addListener: async () => ({ remove: async () => undefined }),
  };
  return asked;
}
const cfg = (over: Omit<Partial<AppConfig>, 'features'> & { features?: Partial<AppConfig['features']> } = {}) =>
  ({ min_app_version: '1.0.0', ...over, features: { comments_write: false, embedded_player: false, ...over.features } }) as AppConfig;

beforeEach(() => { store.clear(); shared.calls.length = 0; });
afterEach(() => { delete g.__inokPlay; vi.unstubAllGlobals(); });

// A-80 1-3: «Поділитися» + «Оцінити» behind the site's switch (R-41), «Перевірити оновлення» always. Red on 1.0.3: none of it existed.
describe('A-80: the Play seam', () => {
  it('share + rate only while config says the listing is public; absent / false / offline = hidden', () => {
    expect(storeLinksShown(null)).toBe(false);
    expect(storeLinksShown(cfg())).toBe(false);
    expect(storeLinksShown(cfg({ features: { store_links: false } }))).toBe(false);
    expect(storeLinksShown(cfg({ features: { store_links: true } }))).toBe(true);
  });
  it('the Play URL = config.store_url, else the ONE constant built from the package id', () => {
    expect(playListingUrl(cfg())).toBe('https://play.google.com/store/apps/details?id=info.inok.app');
    expect(playListingUrl(cfg({ store_url: 'https://play.google.com/store/apps/details?id=info.inok.app&hl=uk' }))).toContain('&hl=uk');
  });
  it('the share payload: one line of text + the Play URL', async () => {
    vi.stubGlobal('navigator', { share: () => undefined });
    await shareApp('Монастирський вісник України', 'Монастирський вісник України — застосунок inok.info для Android', cfg());
    expect(shared.calls[0]).toMatchObject({ text: 'Монастирський вісник України — застосунок inok.info для Android', url: 'https://play.google.com/store/apps/details?id=info.inok.app' });
  });
  it('«Оцінити» opens the listing IN the Play app (com.android.vending) - never the In-App Review API', async () => {
    const asked = mockPlay({});
    await openListing(cfg());
    expect(asked).toEqual(['store {"androidPackageName":"info.inok.app","androidStorePackageName":"com.android.vending"}']);
    const src = readFileSync('src/native/play.ts', 'utf8') + readFileSync('src/pages/About.tsx', 'utf8');
    expect(src).not.toMatch(/requestReview|InAppReview|in-app-review/i);
    expect(Object.keys(JSON.parse(readFileSync('package.json', 'utf8')).dependencies).filter((d) => /review/i.test(d))).toEqual([]);
  });
  it('update states: available / none / not from Play / error', async () => {
    mockPlay({ updateAvailability: AVAILABLE });
    expect((await checkUpdate()).state).toBe('available');
    mockPlay({ updateAvailability: 1 });
    expect((await checkUpdate()).state).toBe('none');
    mockPlay(new Error('-10: Install Error(-10): The app is not owned by any user on this device.'));
    expect((await checkUpdate()).state).toBe('not_play');
    mockPlay(new Error('GOOGLE_PLAY_SERVICES_UNAVAILABLE'));
    expect((await checkUpdate()).state).toBe('not_play');
    mockPlay(new Error('Task failed: network'));
    expect((await checkUpdate()).state).toBe('error');
    delete g.__inokPlay; // the browser / no Play at all
    expect((await checkUpdate()).state).toBe('not_play');
    expect(notFromPlay('-100')).toBe(false);
  });
  it('an update the row found -> Google\'s own flow; immediate not allowed -> the listing', async () => {
    let asked = mockPlay({});
    await immediateUpdate({ updateAvailability: AVAILABLE, immediateUpdateAllowed: true });
    expect(asked).toEqual(['immediate']);
    asked = mockPlay({});
    await immediateUpdate({ updateAvailability: AVAILABLE, immediateUpdateAllowed: false });
    expect(asked[0]).toMatch(/^store /);
  });
  it('the app never downloads or offers an APK (Play policy)', () => {
    for (const f of ['src/native/play.ts', 'src/pages/About.tsx', 'src/components/UpdateOffer.tsx', 'src/state/updateOffer.ts'])
      expect(readFileSync(f, 'utf8')).not.toMatch(/\.apk|REQUEST_INSTALL_PACKAGES|app\/\?/i);
    expect(readFileSync('android/app/src/main/AndroidManifest.xml', 'utf8')).not.toMatch(/REQUEST_INSTALL_PACKAGES/);
  });
});

// A-80 ADDENDUM 1: the start-up offer. Red on 1.0.3 (no offer at all).
describe('A-80 ADDENDUM 1: the update offer', () => {
  const now = Date.UTC(2026, 10, 9, 10);
  const info = (o: Partial<PlayUpdateInfo>) => ({ state: 'available' as const, info: { updateAvailability: AVAILABLE, immediateUpdateAllowed: true, flexibleUpdateAllowed: true, ...o } });
  it('the two numbers are ONE constant each (3 days, 3 days) and Play is asked at most once a day', () => {
    expect([FLEXIBLE_STALE_DAYS, BANNER_PAUSE_DAYS, UPDATE_CHECK_MS]).toEqual([3, 3, DAY]);
  });
  it('immediate: installed below the site\'s min_app_version', () => {
    expect(decideOffer({ check: info({ clientVersionStalenessDays: 0 }), installed: '1.0.4', minVersion: '1.0.5', bannerAt: null, now })).toBe('immediate');
    expect(versionBelow('1.0.4', '1.0.10')).toBe(true);
    expect(versionBelow('1.1.0', '1.0.10')).toBe(false);
  });
  it('flexible: an update 3+ days in Play, the banner not shown for 3 days; fresher -> nothing', () => {
    expect(decideOffer({ check: info({ clientVersionStalenessDays: 3 }), installed: '1.0.4', minVersion: '1.0.0', bannerAt: null, now })).toBe('flexible');
    expect(decideOffer({ check: info({ clientVersionStalenessDays: 2 }), installed: '1.0.4', minVersion: '1.0.0', bannerAt: null, now })).toBe('none');
  });
  it('dismissed: the banner shown less than 3 days ago -> nothing; 3 days later -> again', () => {
    const c = info({ clientVersionStalenessDays: 9 });
    expect(decideOffer({ check: c, installed: '1.0.4', bannerAt: now - 2 * DAY, now })).toBe('none');
    expect(decideOffer({ check: c, installed: '1.0.4', bannerAt: now - 3 * DAY, now })).toBe('flexible');
  });
  it('none: no update; not from Play: nothing at start-up; downloaded earlier: «Перезапустити»', () => {
    expect(decideOffer({ check: { state: 'none', info: { updateAvailability: 1 } }, installed: '1.0.4', bannerAt: null, now })).toBe('none');
    expect(decideOffer({ check: { state: 'not_play' }, installed: '1.0.4', minVersion: '9.0.0', bannerAt: null, now })).toBe('none');
    expect(decideOffer({ check: { state: 'none', info: { updateAvailability: 1, installStatus: 11 } }, installed: '1.0.4', bannerAt: null, now })).toBe('restart');
  });
  it('start-up: the FLEXIBLE offer once a day, the banner\'s day saved; an error is asked again next start', async () => {
    let n = 0;
    const check = async () => { n++; return info({ clientVersionStalenessDays: 5 }); };
    expect((await startupOffer(check, { installed: '1.0.4', minVersion: '1.0.0', now })).offer).toBe('flexible');
    expect((await startupOffer(check, { installed: '1.0.4', minVersion: '1.0.0', now: now + DAY - 1 })).offer).toBe('none');
    expect(n).toBe(2); // F4: Play is asked at every start (a local call); only the flexible offer waits a day
    expect((await startupOffer(check, { installed: '1.0.4', minVersion: '1.0.0', now: now + DAY })).offer).toBe('none'); // banner rests 3 days
    expect((await startupOffer(check, { installed: '1.0.4', minVersion: '1.0.0', now: now + 3 * DAY })).offer).toBe('flexible');
    store.clear();
    expect((await startupOffer(async () => ({ state: 'error' as const }), { installed: '1.0.4', now })).offer).toBe('none');
    expect(store.size).toBe(0);
  });
  // F4 (REVIEW cloud_25): the once-a-day gate hid «Перезапустити» and the below-minimum update until a day passed. Red on 7ba6af7.
  it('F4: an update DOWNLOADED within the day -> «Перезапустити» at the next start', async () => {
    let downloaded = false;
    const check = async () => (downloaded
      ? { state: 'available' as const, info: { updateAvailability: AVAILABLE, installStatus: 11 } }
      : info({ clientVersionStalenessDays: 5 }));
    expect((await startupOffer(check, { installed: '1.0.4', minVersion: '1.0.0', now })).offer).toBe('flexible');
    downloaded = true; // «Оновити» tapped, the download finished, the app closed before «Перезапустити»
    expect((await startupOffer(check, { installed: '1.0.4', minVersion: '1.0.0', now: now + 60_000 })).offer).toBe('restart');
  });
  it('F4: below the site\'s minimum within the day -> the immediate update at EVERY start', async () => {
    const check = async () => info({ clientVersionStalenessDays: 0 });
    expect((await startupOffer(check, { installed: '1.0.4', minVersion: '1.0.0', now })).offer).toBe('none'); // the day's check: nothing
    // the site raised min_app_version an hour later: the next start goes to Google's screen, not tomorrow
    expect((await startupOffer(check, { installed: '1.0.4', minVersion: '1.0.5', now: now + 3_600_000 })).offer).toBe('immediate');
    expect((await startupOffer(check, { installed: '1.0.4', minVersion: '1.0.5', now: now + 7_200_000 })).offer).toBe('immediate'); // cancelled: again
  });
  it('F4: the flexible banner is still offered at most once a day (and rests 3 days after it was shown)', async () => {
    const check = async () => info({ clientVersionStalenessDays: 1 }); // too fresh at the day's check
    expect((await startupOffer(check, { installed: '1.0.4', minVersion: '1.0.0', now })).offer).toBe('none');
    const stale = async () => info({ clientVersionStalenessDays: 3 }); // stale an hour later: the flexible rule waits for its day
    expect((await startupOffer(stale, { installed: '1.0.4', minVersion: '1.0.0', now: now + 3_600_000 })).offer).toBe('none');
    expect((await startupOffer(stale, { installed: '1.0.4', minVersion: '1.0.0', now: now + DAY })).offer).toBe('flexible');
  });
});
