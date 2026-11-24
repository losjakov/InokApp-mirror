import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// A-182 (cloud_46): the iPhone 7 / iOS 15.8 case - MapLibre's shaders fail to link in WebKit; the map must fall back, never stop the app.
const GL = 'Program failed to link: Internal error compiling shader with Metal backend.';
const glError = () => Object.assign(new Error(GL), { stack: `Error: ${GL}\n    at Vt (capacitor://localhost/assets/inokMap-Bq1x2.js:815:2211)\n    at r (inokMap-Bq1x2.js:1:9)` });

// a node page: storage, the document the error screen would be drawn on (drawing it = the defect), fetch recorded
const store = new Map<string, string>();
const sent: { url: string; body: Record<string, unknown> }[] = [];
let stopScreens = 0;
const listeners: Record<string, ((e: unknown) => void)[]> = {};
beforeEach(() => {
  store.clear(); sent.length = 0; stopScreens = 0; for (const k of Object.keys(listeners)) delete listeners[k];
  vi.stubGlobal('localStorage', { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v), removeItem: (k: string) => void store.delete(k),
    key: (i: number) => [...store.keys()][i] ?? null, get length() { return store.size; } });
  vi.stubGlobal('document', { documentElement: { lang: 'uk' }, createElement: (tag: string) => { if (tag === 'canvas') return { getContext: () => null }; stopScreens++; throw new Error('the stop screen was drawn'); } });
  vi.stubGlobal('window', { addEventListener: (t: string, f: (e: unknown) => void) => { (listeners[t] ??= []).push(f); }, removeEventListener: () => undefined });
  vi.stubGlobal('fetch', vi.fn(async (url: string, init: { body?: string }) => { sent.push({ url, body: JSON.parse(init.body ?? '{}') }); return new Response(null, { status: 404 }); }));
  vi.stubGlobal('location', { protocol: 'https:' });
  vi.stubGlobal('addEventListener', () => undefined); vi.stubGlobal('removeEventListener', () => undefined); // the network module's listeners
  store.set('inok.errreport', 'on'); // the browser seam: a native app always sends
});
afterEach(() => { vi.unstubAllGlobals(); vi.resetModules(); });

vi.mock('@capacitor/preferences', () => ({ Preferences: {
  get: async ({ key }: { key: string }) => ({ value: store.get(`CapacitorStorage.${key}`) ?? null }),
  set: async ({ key, value }: { key: string; value: string }) => void store.set(`CapacitorStorage.${key}`, value),
  remove: async ({ key }: { key: string }) => void store.delete(`CapacitorStorage.${key}`) } }));
vi.mock('@capacitor/device', () => ({ Device: { getInfo: async () => ({ osVersion: '15.8', model: 'iPhone9,3' }) } }));
// the MapLibre map: `throwAt` = 'create' throws GL at construction; otherwise a map of no-op methods (records remove)
const fake = { throwAt: 'none' as 'create' | 'none', removed: 0 };
vi.mock('maplibre-gl', async (orig) => {
  const real = await orig<typeof import('maplibre-gl')>();
  class FakeMap {
    constructor() {
      if (fake.throwAt === 'create') throw glError();
      return new Proxy(this, { get: (_t, k) => k === 'remove' ? () => { fake.removed++; } : k === 'getContainer' ? () => ({ dataset: {}, clientWidth: 0, clientHeight: 0, querySelector: () => null })
        : k === 'touchZoomRotate' ? { disableRotation: () => undefined } : () => undefined });
    }
  }
  return { ...real, Map: FakeMap };
});
const settle = () => new Promise((r) => setTimeout(r, 20));
const opts = (onGlFail: () => void) => ({ container: {} as HTMLElement, styleUrl: null, lang: 'uk' as const, interactive: false, onGlFail });

describe('isMapGlFailure (A-182 (1): ONE predicate)', () => {
  it('the exact iOS 15 text, a GL family word, a stack in the map chunk = yes; an ordinary error = no', async () => {
    const { isMapGlFailure } = await import('@/app/mapGlFailure');
    expect(isMapGlFailure(new Error(GL))).toBe(true);
    expect(isMapGlFailure(new Error('WebGL context lost'))).toBe(true);
    expect(isMapGlFailure(Object.assign(new Error('t is null'), { stack: 'TypeError: t is null\n at a (inokMap-Bq1x2.js:815:1)' }))).toBe(true);
    expect(isMapGlFailure(new TypeError('x is not a function'))).toBe(false);
    expect(isMapGlFailure(Object.assign(new Error('t is null'), { stack: 'TypeError: t is null\n at a (index-Ab12.js:4:1)' }))).toBe(false);
    // cloud_46 E1: a handled MapLibre error EVENT (its stack is always the map chunk) counts by its words only
    expect(isMapGlFailure(Object.assign(new Error('Style is not done loading'), { stack: 'Error: x\n at a (inokMap-Bq1x2.js:9:1)' }), false)).toBe(false);
    expect(isMapGlFailure(new Error(GL), false)).toBe(true);
  });
});

describe('InokMap.open + fail (A-182 (1) (2) (6))', () => {
  it('a GL failure at construction: no map, the fallback asked once, the flag kept, ONE auto report with the real code / line / where', async () => {
    fake.throwAt = 'create';
    const { InokMap } = await import('@/data/map/inokMap');
    const { mapGlFailed } = await import('@/app/mapGlFailure');
    const onGlFail = vi.fn();
    expect(InokMap.open(opts(onGlFail))).toBeNull();
    await settle();
    expect(onGlFail).toHaveBeenCalledTimes(1);
    expect(stopScreens).toBe(0);
    expect(await mapGlFailed()).toBe(true); // the next opening: the list at once
    expect(sent).toHaveLength(1);
    expect(sent[0].url).toMatch(/\/api\/app\/v1\/error-report$/);
    expect(sent[0].body).toMatchObject({ kind: 'auto', code: expect.stringMatching(/^E-Error-[0-9a-f]{4}$/), line: GL, where: 'inokMap-Bq1x2.js:815:2211', platform: 'android', os_version: '15.8', model: 'iPhone9,3', gl: 'none' }); // A-183 (6): the GL of the device
    // the second failure of the same code today: no second report
    expect(InokMap.open(opts(vi.fn()))).toBeNull();
    await settle();
    expect(sent).toHaveLength(1);
  });
  it('a GL failure from a LATER frame (window.error, stack in the map chunk): the mounted map falls back, no stop screen, the flag, one report', async () => {
    fake.throwAt = 'none'; fake.removed = 0;
    const { installCrashGuard } = await import('@/app/crash');
    installCrashGuard();
    const { InokMap } = await import('@/data/map/inokMap');
    const { mapGlFailed } = await import('@/app/mapGlFailure');
    const onGlFail = vi.fn();
    const m = InokMap.open(opts(onGlFail));
    expect(m).not.toBeNull();
    for (const f of listeners.error) f({ error: glError(), message: GL });
    await settle();
    expect(onGlFail).toHaveBeenCalledTimes(1);
    expect(fake.removed).toBe(1);
    expect(stopScreens).toBe(0);
    expect(await mapGlFailed()).toBe(true);
    expect(sent.map((s) => s.body.line)).toEqual([GL]);
    // the map is gone: the same error now (no map mounted) is an ordinary crash again - the containment is only while a map exists
    expect(() => { for (const f of listeners.error) f({ error: glError(), message: GL }); }).toThrow('the stop screen was drawn');
  });
  it('the flag: another OS or app version = cleared (an update tries the map again); the retry clears it', async () => {
    const { mapGlFailed, markMapGlFailed, clearMapGlFailed } = await import('@/app/mapGlFailure');
    await markMapGlFailed();
    expect(await mapGlFailed()).toBe(true);
    await clearMapGlFailed(); // «Спробувати показати карту»
    expect(await mapGlFailed()).toBe(false);
    store.set('CapacitorStorage.map_gl_failed', JSON.stringify({ app_version: '1.0.0', os_version: '15.8' }));
    expect(await mapGlFailed()).toBe(false);
    expect(store.has('CapacitorStorage.map_gl_failed')).toBe(false);
  });
  it('a 1.0.18 crash kept for this GL failure is not shown again at launch', async () => {
    store.set('inok.crash', JSON.stringify({ code: 'E-Error-5691', line: GL, where: 'inokMap-x.js:815:1', at: '2026-11-24T01:41:00Z' }));
    const { installCrashGuard } = await import('@/app/crash');
    installCrashGuard();
    expect(stopScreens).toBe(0);
    expect(store.has('inok.crash')).toBe(false);
  });
});

describe('hasWebGL (A-182 (3): the pre-flight)', () => {
  it('no webgl2 and no webgl context = false', async () => {
    vi.stubGlobal('document', { createElement: () => ({ getContext: () => null }) });
    const { hasWebGL } = await import('@/data/map/webgl');
    expect(hasWebGL()).toBe(false);
    vi.stubGlobal('document', { createElement: () => ({ getContext: (k: string) => (k === 'webgl' ? {} : null) }) });
    expect(hasWebGL()).toBe(true);
  });
});
