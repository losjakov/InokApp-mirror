import { afterEach, describe, expect, it, vi } from 'vitest';
import { APP_STORE_LOOKUP, appStoreCheck } from '@/native/play';
import { decideOffer } from '@/state/updateOffer';

/** cloud_36 (B2): iOS has no Play - the App Store's lookup answers «newer version?» and gives the store page; never a banner, never an APK */
const answer = (results: object[]) => vi.fn(async () => ({ json: async () => ({ resultCount: results.length, results }) }) as Response);
afterEach(() => vi.unstubAllGlobals());

describe('iOS: the App Store lookup', () => {
  it('Ukraine\'s storefront first, then the default one', () => {
    expect(APP_STORE_LOOKUP).toEqual(['https://itunes.apple.com/lookup?bundleId=info.inok.app&country=ua', 'https://itunes.apple.com/lookup?bundleId=info.inok.app']);
  });
  it('not in the App Store (TestFlight, before the release) = «not from the store»', async () => {
    const f = answer([]); vi.stubGlobal('fetch', f);
    expect(await appStoreCheck('1.0.11')).toEqual({ state: 'not_play' });
    expect(f).toHaveBeenCalledTimes(2);
  });
  it('a newer version = available, with its store id; the same = none; offline = error', async () => {
    vi.stubGlobal('fetch', answer([{ version: '1.0.12', trackId: 6700000001 }]));
    const c = await appStoreCheck('1.0.11');
    expect(c).toMatchObject({ state: 'available', info: { appStoreId: 6700000001, immediateUpdateAllowed: false, flexibleUpdateAllowed: false } });
    // the start-up rule offers nothing on iOS (no Google screen, no background download): the update is «Перевірити оновлення» -> the store page
    expect(decideOffer({ check: c, installed: '1.0.11', minVersion: '1.0.12', bannerAt: null, now: 0 })).toBe('none');
    vi.stubGlobal('fetch', answer([{ version: '1.0.11', trackId: 6700000001 }]));
    expect((await appStoreCheck('1.0.11')).state).toBe('none');
    vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('Load failed'); }));
    expect((await appStoreCheck('1.0.11')).state).toBe('error');
  });
});

// T3 (cloud_43): right after a release the ua storefront's copy was a day stale - both storefronts, past the cache, the HIGHER version
describe('iOS: the App Store lookup is never stale (T3)', () => {
  const by = (m: Record<string, object[] | Error>) => vi.fn(async (url: string) => {
    const r = m[url.includes('country=ua') ? 'ua' : 'default'];
    if (r instanceof Error) throw r;
    return { json: async () => ({ resultCount: r.length, results: r }) } as Response;
  });
  it('ua stale 1.0.16 + default 1.0.17 -> available 1.0.17', async () => {
    vi.stubGlobal('fetch', by({ ua: [{ version: '1.0.16', trackId: 1 }], default: [{ version: '1.0.17', trackId: 1 }] }));
    expect(await appStoreCheck('1.0.16')).toMatchObject({ state: 'available', info: { appStoreId: 1 } });
  });
  it('ua 1.0.17 + default failed -> available; both failed -> error; one empty one failed -> not from the store', async () => {
    vi.stubGlobal('fetch', by({ ua: [{ version: '1.0.17', trackId: 1 }], default: new TypeError('Load failed') }));
    expect((await appStoreCheck('1.0.16')).state).toBe('available');
    vi.stubGlobal('fetch', by({ ua: new TypeError('x'), default: new TypeError('y') }));
    expect((await appStoreCheck('1.0.16')).state).toBe('error');
    vi.stubGlobal('fetch', by({ ua: [], default: new TypeError('y') }));
    expect((await appStoreCheck('1.0.16')).state).toBe('not_play');
  });
  it('every lookup goes past the HTTP cache (cache: no-store)', async () => {
    const f = by({ ua: [{ version: '1.0.17', trackId: 1 }], default: [{ version: '1.0.17', trackId: 1 }] });
    vi.stubGlobal('fetch', f);
    await appStoreCheck('1.0.17');
    expect(f).toHaveBeenCalledTimes(2);
    for (const c of f.mock.calls as unknown as [string, RequestInit][]) expect(c[1]).toEqual({ cache: 'no-store' });
  });
});
