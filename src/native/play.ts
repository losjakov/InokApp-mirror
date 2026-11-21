import { AppUpdate } from '@capawesome/capacitor-app-update';
import type { AppConfig } from '@/data/api/types';
import { isIos, isNative } from './platform';
import { APP_VERSION, versionBelow } from '@/app/version';
import { shareUrl } from './intents';

/**
 * THE Google Play seam (A-80, A-15): the listing's address, «Поділитися» / «Оцінити», the in-app update. ONE plugin -
 * `@capawesome/capacitor-app-update` (Play Core `app-update`): the update info, Google's immediate / flexible flows, and «open the
 * listing in the Play app» (`market://` with `com.android.vending`, then any store, then the browser). Play policy: the app never
 * downloads or offers an APK, and no button calls the In-App Review API (its quota) - «Оцінити» only opens the listing.
 * The browser ring has no Play: a screen sets `window.__inokPlay` (the same calls, mocked); without it - «not from Play».
 */
export const APP_ID = 'info.inok.app';
export const PLAY_STORE_PACKAGE = 'com.android.vending';

/** The Play listing: the site's `config.store_url` (R-41) or the one built from the package id. */
export const playListingUrl = (c?: AppConfig | null): string => c?.store_url || `https://play.google.com/store/apps/details?id=${APP_ID}`;
/** R-41: «Поділитися» and «Оцінити» are shown only while the site says the listing is public (absent / false / offline = hidden). */
export const storeLinksShown = (c?: AppConfig | null): boolean => c?.features?.store_links === true;

/** Play Core's answer, as the plugin gives it (`updateAvailability`: 1 none, 2 available, 3 in progress; `installStatus` 11 = downloaded). */
export interface PlayUpdateInfo {
  updateAvailability: number;
  immediateUpdateAllowed?: boolean;
  flexibleUpdateAllowed?: boolean;
  clientVersionStalenessDays?: number;
  installStatus?: number;
  currentVersionName?: string;
  /** iOS: the App Store's numeric id of the app (iTunes lookup `trackId`) - the store page the update opens */
  appStoreId?: number;
}
export const AVAILABLE = 2;
export const IN_PROGRESS = 3;
export const DOWNLOADED = 11;
interface PlayApi {
  getAppUpdateInfo(): Promise<PlayUpdateInfo>;
  openAppStore(o: { androidPackageName?: string; androidStorePackageName?: string; appId?: string }): Promise<void>;
  performImmediateUpdate(): Promise<{ code: number }>;
  startFlexibleUpdate(): Promise<{ code: number }>;
  completeFlexibleUpdate(): Promise<void>;
  addListener(e: 'onFlexibleUpdateStateChange', cb: (s: { installStatus: number }) => void): Promise<{ remove(): Promise<void> }>;
}
const api = (): PlayApi | null =>
  isNative() ? (AppUpdate as unknown as PlayApi) : ((globalThis as { __inokPlay?: PlayApi }).__inokPlay ?? null);

export type UpdateCheck = { state: 'available'; info: PlayUpdateInfo } | { state: 'none'; info: PlayUpdateInfo } | { state: 'not_play' } | { state: 'error' };

/** Play Core refuses an app it did not install (-10 «not owned»), a phone without Play services / the Play API (-9, -6): «not from Play». */
export const notFromPlay = (e: unknown): boolean =>
  /(^|\D)-(10|9|6)(\D|$)|not owned|PLAY_SERVICES|API_NOT_AVAILABLE|not supported/i.test(String((e as Error)?.message ?? e));

/**
 * cloud_36 (B2): iOS has no Play and no in-app update - the App Store's own lookup (`itunes.apple.com/lookup?bundleId=`; Ukraine's
 * storefront first, then the default) says whether a newer version is there and gives the store page; an update = that page
 * (`openAppStore`, the same plugin). Not in the store (TestFlight, before the release) = «not from the store». Never an install path.
 */
export const APP_STORE_LOOKUP = ['ua', null].map((c) => `https://itunes.apple.com/lookup?bundleId=${APP_ID}${c ? `&country=${c}` : ''}`);
export async function appStoreCheck(installed = APP_VERSION): Promise<UpdateCheck> {
  // T3 (cloud_43): Apple's lookup answers max-age ~24 h and a CDN may keep a stale copy - BOTH storefronts in parallel, past the HTTP cache
  // (`cache: 'no-store'`), each with its own catch; the HIGHER version of the answers that carry version + trackId wins
  const answers = await Promise.all(APP_STORE_LOOKUP.map(async (url) => {
    try {
      const j = (await (await fetch(url, { cache: 'no-store' })).json()) as { results?: { version?: string; trackId?: number }[] };
      const r = j.results?.[0];
      return r?.version && r.trackId ? { version: r.version, trackId: r.trackId } : 'empty';
    } catch { return 'failed'; }
  }));
  const found = answers.filter((x): x is { version: string; trackId: number } => typeof x === 'object');
  if (!found.length) return answers.every((x) => x === 'failed') ? { state: 'error' } : { state: 'not_play' };
  const r = found.reduce((hi, x) => (versionBelow(hi.version, x.version) ? x : hi));
  const info: PlayUpdateInfo = { updateAvailability: versionBelow(installed, r.version) ? AVAILABLE : 1, immediateUpdateAllowed: false,
    flexibleUpdateAllowed: false, currentVersionName: installed, appStoreId: r.trackId };
  return info.updateAvailability === AVAILABLE ? { state: 'available', info } : { state: 'none', info };
}

export async function checkUpdate(): Promise<UpdateCheck> {
  if (isIos()) return appStoreCheck();
  const p = api();
  if (!p) return { state: 'not_play' };
  try {
    const info = await p.getAppUpdateInfo();
    const on = info.updateAvailability === AVAILABLE || info.updateAvailability === IN_PROGRESS;
    return on ? { state: 'available', info } : { state: 'none', info };
  } catch (e) {
    return notFromPlay(e) ? { state: 'not_play' } : { state: 'error' };
  }
}

/** «Оцінити» / an update without Google's screen: the listing IN the Play app (browser fallback inside the plugin; the web: a tab). */
export async function openListing(c?: AppConfig | null): Promise<void> {
  const p = api();
  if (p) { await p.openAppStore({ androidPackageName: APP_ID, androidStorePackageName: PLAY_STORE_PACKAGE }); return; }
  window.open(playListingUrl(c), '_blank', 'noopener');
}

/** iOS: the app's App Store page (the App Store app; the browser ring: a tab) */
export async function openAppStorePage(id?: number): Promise<void> {
  if (!id) return;
  if (isNative()) { await AppUpdate.openAppStore({ appId: String(id) }); return; }
  window.open(`https://apps.apple.com/app/id${id}`, '_blank', 'noopener');
}

/** R-60 (A-131): THE address «Поділитися застосунком» shares on BOTH platforms - the site's smart link (iPhone / iPad -> the App Store while
 *  its switch is on, Android -> Google Play, anything else -> /app/); the share line names no platform. */
export const APP_SHARE_URL = 'https://inok.info/app/get/';
/** «Поділитися застосунком»: the system share sheet with one line and the smart link (`@capacitor/share`, A-43's call). */
export const shareApp = (title: string, line: string): Promise<void> => shareUrl(title, APP_SHARE_URL, line);

/** R-57 (A-131): the App Store - iOS reads ONLY this pair (`features.app_store_links` + `app_store_url`); Android reads only R-41's. */
export const APP_STORE_ID = '6835134380';
export const APP_STORE_PAGE = `https://apps.apple.com/app/id${APP_STORE_ID}`;
/** the App Store page: the site's `app_store_url`, absent = the app's own id (the door's update button never stays without an address) */
export const appStorePageUrl = (c?: AppConfig | null): string => c?.app_store_url || APP_STORE_PAGE;
/** «Оцінити застосунок» on iOS: only while the site's App Store switch is on AND it gives the address */
export const appStoreLinksShown = (c?: AppConfig | null): boolean => c?.features?.app_store_links === true && !!c?.app_store_url;
export const appStoreReviewUrl = (c?: AppConfig | null): string => `${appStorePageUrl(c)}?action=write-review`;
/** the App Store page (or its «write a review» form) in the App Store app; the browser ring: a tab */
export async function openAppStoreUrl(c?: AppConfig | null, review = false): Promise<void> {
  const url = review ? appStoreReviewUrl(c) : appStorePageUrl(c);
  if (isNative()) { window.location.href = url.replace(/^https:\/\/apps\.apple\.com\//, 'itms-apps://apps.apple.com/'); return; }
  window.open(url, '_blank', 'noopener');
}

/** Google's own full-screen update (an update the row found, or a version below the site's minimum); not allowed -> the listing. */
export async function immediateUpdate(info: PlayUpdateInfo, c?: AppConfig | null): Promise<void> {
  if (isIos()) { await openAppStorePage(info.appStoreId); return; }
  const p = api();
  if (p && info.immediateUpdateAllowed !== false) { await p.performImmediateUpdate(); return; }
  await openListing(c);
}

/** The flexible flow: Play's consent, then the download in the background; `downloaded` once it can be installed. */
export async function flexibleUpdate(downloaded: () => void): Promise<void> {
  const p = api();
  if (!p) return;
  const h = await p.addListener('onFlexibleUpdateStateChange', (s) => {
    if (s.installStatus === DOWNLOADED) { downloaded(); void h.remove(); }
  });
  const r = await p.startFlexibleUpdate();
  if (r.code !== 0) await h.remove(); // declined / failed: nothing waits
}

/** «Перезапустити»: Play installs the downloaded version and restarts the app. */
export const completeUpdate = async (): Promise<void> => { await api()?.completeFlexibleUpdate(); };
