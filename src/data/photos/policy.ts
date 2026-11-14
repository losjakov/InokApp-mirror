/**
 * A-20: when a photo may download BY ITSELF. ONE decision table for every picture of the app, by its SIZE CLASS:
 *  - `small` (owner 03.11.2026: «миниатюры во всех списках … при любом интернете»): the list thumbnails (houses 150 × 150, articles 150 × 150,
 *    eparchies' map pictures 640 px), channel avatars, icons — tens of KB, loaded on ANY network, Wi-Fi or mobile, the setting and Data Saver
 *    aside (a foreground list the person is looking at; Android: request small images on metered networks, the large ones by choice);
 *  - `large` (the card's and the article's covers, article body pictures, the viewer): the setting «Автозавантаження фото» below.
 *
 *  - «Wi-Fi» means an UNMETERED network (Android `isActiveNetworkMetered()`): a phone's hotspot over Wi-Fi is metered, roaming is mobile.
 *  - The system Data Saver (`getRestrictBackgroundStatus()` = enabled, the app not whitelisted) stops every automatic download,
 *    whatever the setting. A manual tap («Завантажити») always works while any network exists.
 */
export type PhotoMode = 'unmetered' | 'any' | 'manual';
export const PHOTO_MODES: PhotoMode[] = ['unmetered', 'any', 'manual'];
export const DEFAULT_PHOTO_MODE: PhotoMode = 'unmetered';

export interface NetState {
  connected: boolean;
  /** true = mobile data, a hotspot, roaming, or unknown cost */
  metered: boolean;
  /** the system Data Saver restricts this app's background data */
  dataSaver: boolean;
}

/** Why a photo waits — the placeholder's reason line (`photos.reason_<why>`) and whether a manual download is offered. */
export type Wait = 'offline' | 'wifi' | 'saver' | 'manual';
export type Decision = { load: true } | { load: false; why: Wait; canLoad: boolean };

export type PhotoSize = 'small' | 'large';

export function decide(net: NetState, mode: PhotoMode, manual = false, size: PhotoSize = 'large'): Decision {
  if (!net.connected) return { load: false, why: 'offline', canLoad: false };
  if (manual || size === 'small') return { load: true };
  if (net.dataSaver) return { load: false, why: 'saver', canLoad: true };
  if (mode === 'manual') return { load: false, why: 'manual', canLoad: true };
  if (mode === 'any' || !net.metered) return { load: true };
  return { load: false, why: 'wifi', canLoad: true };
}

/** The settings of cloud_01–04 stored `wifiOnly`; it maps onto the mode once (true → unmetered, false → any). */
export const modeFromLegacy = (wifiOnly: unknown): PhotoMode => (wifiOnly === false ? 'any' : DEFAULT_PHOTO_MODE);
