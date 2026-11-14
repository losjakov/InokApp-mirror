import { AppUpdate } from '@capawesome/capacitor-app-update';
import type { AppConfig } from '@/data/api/types';
import { isNative } from './platform';
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
}
export const AVAILABLE = 2;
export const IN_PROGRESS = 3;
export const DOWNLOADED = 11;
interface PlayApi {
  getAppUpdateInfo(): Promise<PlayUpdateInfo>;
  openAppStore(o: { androidPackageName?: string; androidStorePackageName?: string }): Promise<void>;
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

export async function checkUpdate(): Promise<UpdateCheck> {
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

/** «Поділитися застосунком»: the system share sheet with one line and the listing's address (`@capacitor/share`, A-43's call). */
export const shareApp = (title: string, line: string, c?: AppConfig | null): Promise<void> => shareUrl(title, playListingUrl(c), line);

/** Google's own full-screen update (an update the row found, or a version below the site's minimum); not allowed -> the listing. */
export async function immediateUpdate(info: PlayUpdateInfo, c?: AppConfig | null): Promise<void> {
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
