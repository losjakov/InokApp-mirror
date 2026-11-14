import { Preferences } from '@capacitor/preferences';
import { versionBelow } from '@/app/version';
import { AVAILABLE, DOWNLOADED, IN_PROGRESS, type PlayUpdateInfo, type UpdateCheck } from '@/native/play';

/**
 * A-80 ADDENDUM 1 - how the app OFFERS an update (developer.android.com «In-app updates»). Play is asked at EVERY start (a local call;
 * Android's guide checks DOWNLOADED / IN_PROGRESS at every resume - F4, REVIEW cloud_25):
 * (1) the installed version is below the site's `config.min_app_version` (R-2) -> IMMEDIATE (Google's full screen), every start;
 * (2) an update downloaded earlier and not installed -> the «Перезапустити» banner, every start;
 * (3) else, at most once a day (UPDATE_CHECK_MS - this gate ONLY), an update has been in Play for FLEXIBLE_STALE_DAYS+ days and the
 *     banner was not shown for BANNER_PAUSE_DAYS -> FLEXIBLE: a non-modal banner above the tab bar «Доступна нова версія — Оновити»,
 *     the download in the background, then «Перезапустити»; (4) not from Play / no update -> nothing.
 */
export const UPDATE_CHECK_MS = 24 * 60 * 60 * 1000; // the FLEXIBLE offer looked at at most once a day (F4: not the restart / immediate)
export const FLEXIBLE_STALE_DAYS = 3; // an update in Play for this many days before the banner offers it
export const BANNER_PAUSE_DAYS = 3; // the banner not more often than this
const DAY_MS = 24 * 60 * 60 * 1000;

export type Offer = 'immediate' | 'flexible' | 'restart' | 'none';
export interface OfferMarks { checkedAt: number | null; bannerAt: number | null }

export function decideOffer(o: { check: UpdateCheck; installed: string; minVersion?: string | null; bannerAt: number | null; now: number; flexibleDue?: boolean }): Offer {
  if (o.check.state === 'not_play' || o.check.state === 'error') return 'none';
  const i: PlayUpdateInfo = o.check.info;
  if (i.installStatus === DOWNLOADED) return 'restart';
  const available = i.updateAvailability === AVAILABLE || i.updateAvailability === IN_PROGRESS;
  if (!available) return 'none';
  if (o.minVersion && versionBelow(o.installed, o.minVersion) && i.immediateUpdateAllowed !== false) return 'immediate';
  const stale = (i.clientVersionStalenessDays ?? 0) >= FLEXIBLE_STALE_DAYS;
  const rested = o.bannerAt == null || o.now - o.bannerAt >= BANNER_PAUSE_DAYS * DAY_MS;
  return o.flexibleDue !== false && i.updateAvailability === AVAILABLE && i.flexibleUpdateAllowed !== false && stale && rested ? 'flexible' : 'none';
}

export const checkDue = (m: OfferMarks, now: number): boolean => m.checkedAt == null || now - m.checkedAt >= UPDATE_CHECK_MS;

const KEY = 'update_offer';
export async function loadMarks(): Promise<OfferMarks> {
  try {
    const v = JSON.parse((await Preferences.get({ key: KEY })).value ?? '{}') as Partial<OfferMarks>;
    return { checkedAt: typeof v.checkedAt === 'number' ? v.checkedAt : null, bannerAt: typeof v.bannerAt === 'number' ? v.bannerAt : null };
  } catch { return { checkedAt: null, bannerAt: null }; }
}
export const saveMarks = (m: OfferMarks): Promise<void> => Preferences.set({ key: KEY, value: JSON.stringify(m) });

/** The start-up step: Play asked at every start; the flexible rule once a day (its marks saved); the offer returned with Play's answer. */
export async function startupOffer(check: () => Promise<UpdateCheck>, o: { installed: string; minVersion?: string | null; now?: number }): Promise<{ offer: Offer; check?: UpdateCheck }> {
  const now = o.now ?? Date.now();
  const marks = await loadMarks();
  const c = await check();
  if (c.state === 'error') return { offer: 'none', check: c }; // offline / Play busy: asked again at the next start
  const flexibleDue = checkDue(marks, now);
  const offer = decideOffer({ check: c, installed: o.installed, minVersion: o.minVersion, bannerAt: marks.bannerAt, now, flexibleDue });
  if (flexibleDue) await saveMarks({ checkedAt: now, bannerAt: offer === 'flexible' ? now : marks.bannerAt });
  return { offer, check: c };
}
