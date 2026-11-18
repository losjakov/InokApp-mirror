import { Preferences } from '@capacitor/preferences';

/**
 * cloud_41 (A-133 C2) «БЕРЕЖНО»: when the app asks the STORE for its own rating window (Play In-App Review / StoreKit) - never a window of
 * ours, never from a button, no «do you like it?». ONE pure function: the request goes only when EVERY condition holds; the store then
 * decides alone whether anything shows (nothing is assumed about the result). The counters live on the phone only (nothing is sent).
 */
export const DAY_MS = 24 * 60 * 60 * 1000;
export const REVIEW_MIN_DAYS = 7; // since the first start
export const REVIEW_MIN_CARDS = 10; // monastery cards opened
export const REVIEW_PAUSE_DAYS = 120; // since OUR last request

export interface ReviewMarks { firstStartAt: number | null; cardsOpened: number; askedAt: number | null }
export interface ReviewMoment {
  now: number;
  /** the person has just come back to «Головна» (from another screen) */
  backOnHome: boolean;
  /** an open sheet / dialog / the reserve door / the first-run screen = never */
  overlay: boolean; door: boolean; firstRun: boolean;
  online: boolean;
  /** Android: a Play install only (iOS: the App Store / TestFlight decide themselves) */
  fromStore: boolean;
}

/** THE rule: true = ask the store now. Each false condition = no request (unit `reviewAsk`: a table, the 119th / 120th day). */
export function reviewDue(m: ReviewMarks, x: ReviewMoment): boolean {
  return m.firstStartAt != null && x.now - m.firstStartAt >= REVIEW_MIN_DAYS * DAY_MS
    && m.cardsOpened >= REVIEW_MIN_CARDS
    && x.backOnHome && !x.overlay && !x.door && !x.firstRun
    && x.online && x.fromStore
    && (m.askedAt == null || x.now - m.askedAt >= REVIEW_PAUSE_DAYS * DAY_MS);
}

const KEY = 'review_marks';
export async function loadReviewMarks(): Promise<ReviewMarks> {
  try {
    const v = JSON.parse((await Preferences.get({ key: KEY })).value ?? '{}') as Partial<ReviewMarks>;
    return { firstStartAt: typeof v.firstStartAt === 'number' ? v.firstStartAt : null, cardsOpened: typeof v.cardsOpened === 'number' ? v.cardsOpened : 0,
      askedAt: typeof v.askedAt === 'number' ? v.askedAt : null };
  } catch { return { firstStartAt: null, cardsOpened: 0, askedAt: null }; }
}
const saveReviewMarks = (m: ReviewMarks) => Preferences.set({ key: KEY, value: JSON.stringify(m) });
/** every start: the first one is remembered (1.0.15 counts from its own first start) */
export async function noteStart(now = Date.now()): Promise<void> {
  const m = await loadReviewMarks();
  if (m.firstStartAt == null) await saveReviewMarks({ ...m, firstStartAt: now });
}
/** a monastery card opened */
export async function noteCardOpened(): Promise<void> {
  const m = await loadReviewMarks();
  if (m.cardsOpened < 1000) await saveReviewMarks({ ...m, cardsOpened: m.cardsOpened + 1 });
}

let asking = false; // one request per moment, whatever re-renders (pre-mortem P4)
/**
 * The moment «back on Головна»: the marks are read, the rule decides, and ONLY then the store is asked - the «asked» date written BEFORE
 * the bridge call (a crash inside the store's window never asks again the next day). Returns whether the bridge was called.
 */
export async function maybeAskReview(moment: Omit<ReviewMoment, 'now'> & { now?: number }, ask: () => Promise<unknown>): Promise<boolean> {
  if (asking) return false;
  asking = true;
  try {
    const now = moment.now ?? Date.now();
    const m = await loadReviewMarks();
    if (!reviewDue(m, { ...moment, now })) return false;
    await saveReviewMarks({ ...m, askedAt: now });
    await ask().catch(() => undefined);
    return true;
  } finally { asking = false; }
}
