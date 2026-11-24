import { describe, expect, it, vi } from 'vitest';
import { AppleMapView, appleHouses, mapMode, type AppleMapPlugin } from '@/native/appleMap';
import type { MapPoint } from '@/data/repo/types';

// A-183 (cloud_46): Apple's map on an iPhone whose WebGL cannot draw ours; Android and any native failure = A-182's list
const pt = (code: number, lat: number | null, object_type = 1): MapPoint => ({ code, lat, lon: lat == null ? null : 30.5, object_type, name_uk: `Обитель ${code}`, name_ru: `Обитель ${code} ru`, name_en: null } as unknown as MapPoint);
const fakePlugin = () => {
  const calls: [string, unknown][] = [];
  let opener: ((d: { code: number }) => void) | null = null;
  const p: AppleMapPlugin & { calls: typeof calls; tap: (code: number) => void; failShow?: boolean } = {
    calls,
    tap: (code) => opener?.({ code }),
    show: async (o) => { calls.push(['show', o]); if (p.failShow) throw new Error('MKMapView refused'); return { count: o.houses.length }; },
    setRect: async (o) => { calls.push(['setRect', o]); },
    setVisible: async (o) => { calls.push(['setVisible', o]); },
    setHouses: async (o) => { calls.push(['setHouses', o]); return { count: o.houses.length }; },
    destroy: async () => { calls.push(['destroy', null]); },
    addListener: async (_e, f) => { opener = f; return { remove: async () => { opener = null; } }; },
  };
  return p;
};
const RECT = { x: 0, y: 56, width: 390, height: 700 };

describe('mapMode (A-183 (1))', () => {
  it('our map when it draws; iPhone + the A-182 trigger = Apple; Android = the list; Apple failed = the list', () => {
    expect(mapMode({ glOk: true, ios: true, appleFailed: false })).toBe('webgl');
    expect(mapMode({ glOk: false, ios: true, appleFailed: false })).toBe('apple');
    expect(mapMode({ glOk: false, ios: false, appleFailed: false })).toBe('list');
    expect(mapMode({ glOk: false, ios: true, appleFailed: true })).toBe('list');
  });
});

describe('AppleMapView (A-183 (2) (3) (8))', () => {
  it('show with exactly the houses our map draws (the filtered set; no coordinates = none), the lavras marked, names in the language', async () => {
    const p = fakePlugin();
    const rows = [pt(1, 50.1), pt(2, null), pt(242, 50.43, 5), pt(7, 49.9)];
    const v = new AppleMapView(p, () => RECT, vi.fn(), vi.fn(), () => false);
    await v.start(appleHouses(rows, 'ru'), 'Открыть карточку');
    const show = p.calls.find(([k]) => k === 'show')![1] as { houses: { code: number; lavra: boolean; title: string }[]; rect: unknown; open: string };
    expect(show.houses.map((h) => h.code)).toEqual([1, 242, 7]);
    expect(show.houses.filter((h) => h.lavra).map((h) => h.code)).toEqual([242]);
    expect(show.houses[0].title).toBe('Обитель 1 ru');
    expect(show).toMatchObject({ rect: RECT, open: 'Открыть карточку' });
  });
  it('a web overlay opened -> hidden; closed -> shown again; the page left -> hidden', async () => {
    const p = fakePlugin(); let overlay = false;
    const v = new AppleMapView(p, () => RECT, vi.fn(), vi.fn(), () => overlay);
    await v.start(appleHouses([pt(1, 50.1)], 'uk'), 'Відкрити картку');
    overlay = true; await v.sync();
    overlay = false; await v.sync();
    await v.page(false);
    expect(p.calls.filter(([k]) => k === 'setVisible').map(([, o]) => (o as { visible: boolean }).visible)).toEqual([false, true, false]);
  });
  it('a pin\'s «›» opens that house (the card route); changed houses replace the annotations', async () => {
    const p = fakePlugin(); const open = vi.fn();
    const v = new AppleMapView(p, () => RECT, open, vi.fn(), () => false);
    await v.start(appleHouses([pt(1, 50.1)], 'uk'), 'Відкрити картку');
    p.tap(242);
    expect(open).toHaveBeenCalledWith(242);
    await v.setHouses(appleHouses([pt(5, 48), pt(6, 47)], 'uk'));
    expect((p.calls.at(-1)![1] as { houses: unknown[] }).houses).toHaveLength(2);
  });
  it('the native map failing = onFail (the list), never a throw', async () => {
    const p = fakePlugin(); p.failShow = true; const fail = vi.fn();
    const v = new AppleMapView(p, () => RECT, vi.fn(), fail, () => false);
    await expect(v.start(appleHouses([pt(1, 50.1)], 'uk'), 'x')).resolves.toBeUndefined();
    expect(fail).toHaveBeenCalledTimes(1);
    expect(p.calls.some(([k]) => k === 'destroy')).toBe(true);
  });
});

describe('AppleMapView waits for a size (cloud_46 E2: ring 45328638031 iPad - the houses came while the area was 0 x 0)', () => {
  it('no rect yet -> nothing shown; the first sync with a rect shows the kept houses (once)', async () => {
    const p = fakePlugin(); let rect: typeof RECT | null = null;
    const v = new AppleMapView(p, () => rect, vi.fn(), vi.fn(), () => false);
    await v.start(appleHouses([pt(1, 50.1), pt(2, 49)], 'uk'), 'Відкрити картку');
    expect(p.calls.filter(([k]) => k === 'show')).toHaveLength(0);
    rect = RECT; await v.sync(); await v.sync();
    const shows = p.calls.filter(([k]) => k === 'show');
    expect(shows).toHaveLength(1);
    expect((shows[0][1] as { houses: unknown[] }).houses).toHaveLength(2);
  });
});

describe('Apple\'s map area has a size (cloud_46 E6, ring 45340172761: `exists:false` - the div was 0 px tall)', () => {
  it('the reserved area fills its pane by its OWN class (MapLibre\'s absolute fill is `.maplibregl-map` only)', async () => {
    const { readFileSync } = await import('node:fs');
    expect(readFileSync('src/theme/app.css', 'utf8')).toMatch(/\n\.apple-map \{ position: absolute; inset: 0; \}/);
    expect(readFileSync('src/components/AppleMapPane.tsx', 'utf8')).toMatch(/className="map-canvas apple-map"/);
  });
});
