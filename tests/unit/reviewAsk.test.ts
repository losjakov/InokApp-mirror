import { beforeEach, describe, expect, it, vi } from 'vitest';

// cloud_41 (A-133 C2): the store's rating window - ONE pure function, every condition a row; the bridge called once per moment
const store = new Map<string, string>();
vi.mock('@capacitor/preferences', () => ({ Preferences: {
  get: async ({ key }: { key: string }) => ({ value: store.get(key) ?? null }),
  set: async ({ key, value }: { key: string; value: string }) => { store.set(key, value); },
} }));
const { DAY_MS, loadReviewMarks, maybeAskReview, noteCardOpened, noteStart, reviewDue } = await import('@/state/reviewAsk');

const NOW = Date.UTC(2026, 11, 1);
const OK_MARKS = { firstStartAt: NOW - 7 * DAY_MS, cardsOpened: 10, askedAt: null };
const OK = { now: NOW, backOnHome: true, overlay: false, door: false, firstRun: false, online: true, fromStore: true };

describe('reviewDue: every condition', () => {
  it('all hold -> ask', () => expect(reviewDue(OK_MARKS, OK)).toBe(true));
  it.each([
    ['6 days since the first start', { ...OK_MARKS, firstStartAt: NOW - 6 * DAY_MS - 1 }, OK],
    ['no first start known', { ...OK_MARKS, firstStartAt: null }, OK],
    ['9 cards opened', { ...OK_MARKS, cardsOpened: 9 }, OK],
    ['not back on «Головна»', OK_MARKS, { ...OK, backOnHome: false }],
    ['a sheet / dialog open', OK_MARKS, { ...OK, overlay: true }],
    ['the reserve door', OK_MARKS, { ...OK, door: true }],
    ['the first-run screen', OK_MARKS, { ...OK, firstRun: true }],
    ['offline', OK_MARKS, { ...OK, online: false }],
    ['Android not from Play', OK_MARKS, { ...OK, fromStore: false }],
    ['our last request 119 days ago', { ...OK_MARKS, askedAt: NOW - 119 * DAY_MS }, OK],
  ])('%s -> no request', (_, m, x) => expect(reviewDue(m, x)).toBe(false));
  it('our last request 120 days ago -> ask again', () => expect(reviewDue({ ...OK_MARKS, askedAt: NOW - 120 * DAY_MS }, OK)).toBe(true));
  it('exactly 7 days and exactly 10 cards -> ask', () => expect(reviewDue({ firstStartAt: NOW - 7 * DAY_MS, cardsOpened: 10, askedAt: null }, OK)).toBe(true));
});

describe('maybeAskReview: the counters on the phone, one bridge call per moment, the date written before the call', () => {
  beforeEach(() => store.clear());
  it('first start and cards counted locally', async () => {
    await noteStart(NOW - 8 * DAY_MS); await noteStart(NOW); // the second start does not move the first
    for (let i = 0; i < 10; i++) await noteCardOpened();
    expect(await loadReviewMarks()).toEqual({ firstStartAt: NOW - 8 * DAY_MS, cardsOpened: 10, askedAt: null });
  });
  it('two moments at once (re-renders) = ONE bridge call; then 120 days of quiet', async () => {
    await noteStart(NOW - 8 * DAY_MS);
    for (let i = 0; i < 10; i++) await noteCardOpened();
    const ask = vi.fn(async () => undefined);
    const r = await Promise.all([maybeAskReview({ ...OK, now: NOW }, ask), maybeAskReview({ ...OK, now: NOW }, ask)]);
    expect(ask).toHaveBeenCalledTimes(1);
    expect(r.filter(Boolean)).toHaveLength(1);
    expect((await loadReviewMarks()).askedAt).toBe(NOW);
    expect(await maybeAskReview({ ...OK, now: NOW + 119 * DAY_MS }, ask)).toBe(false);
    expect(await maybeAskReview({ ...OK, now: NOW + 120 * DAY_MS }, ask)).toBe(true);
    expect(ask).toHaveBeenCalledTimes(2);
  });
  it('the «asked» date is written BEFORE the bridge (a failing store never asks twice)', async () => {
    await noteStart(NOW - 8 * DAY_MS);
    for (let i = 0; i < 10; i++) await noteCardOpened();
    let seen: number | null = null;
    await maybeAskReview({ ...OK, now: NOW }, async () => { seen = (await loadReviewMarks()).askedAt; throw new Error('store gone'); });
    expect(seen).toBe(NOW);
  });
  it('no button anywhere calls it; «Оцінити» in «Про застосунок» stays the listing / the App Store page', async () => {
    const { readFileSync } = await import('node:fs');
    expect(readFileSync('src/pages/About.tsx', 'utf8')).not.toMatch(/requestStoreReview|maybeAskReview/);
  });
});

describe('the thin plugin on both platforms (no npm dependency; the store\'s window only)', () => {
  it('Android: registered, Play In-App Review in Gradle; iOS: StoreKit, registered by the bridge, in the Xcode sources', async () => {
    const { readFileSync } = await import('node:fs');
    const r = (p: string) => readFileSync(p, 'utf8');
    expect(r('android/app/src/main/java/info/inok/app/MainActivity.java')).toMatch(/registerPlugin\(InAppReviewPlugin\.class\)/);
    expect(r('android/app/build.gradle')).toMatch(/com\.google\.android\.play:review:\$playReviewVersion/);
    expect(r('android/app/src/main/java/info/inok/app/InAppReviewPlugin.java')).toMatch(/launchReviewFlow/);
    expect(r('ios/App/App/InAppReviewPlugin.swift')).toMatch(/SKStoreReviewController\.requestReview\(in: scene\)/);
    expect(r('ios/App/App/InokBridgeViewController.swift')).toMatch(/registerPluginInstance\(InAppReviewPlugin\(\)\)/);
    expect(r('ios/App/App.xcodeproj/project.pbxproj')).toMatch(/InAppReviewPlugin\.swift in Sources \*\/,/);
    expect(Object.keys(JSON.parse(r('package.json')).dependencies).filter((d) => /review/i.test(d))).toEqual([]);
  });
});
