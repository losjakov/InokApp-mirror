import { describe, expect, it } from 'vitest';
import { decide, modeFromLegacy, PHOTO_MODES, type NetState, type PhotoMode, type PhotoSize } from '@/data/photos/policy';

/** A-20: the decision table network × setting × Data Saver (× manual tap), every cell. */
const NETS: Record<string, NetState> = {
  none: { connected: false, metered: false, dataSaver: false },
  wifi: { connected: true, metered: false, dataSaver: false },
  mobile: { connected: true, metered: true, dataSaver: false }, // also: hotspot Wi-Fi, roaming
  wifiSaver: { connected: true, metered: false, dataSaver: true },
  mobileSaver: { connected: true, metered: true, dataSaver: true },
};
const show = (n: NetState, m: PhotoMode, manual = false, size: PhotoSize = 'large') => { const d = decide(n, m, manual, size); return d.load ? 'load' : `${d.why}${d.canLoad ? '+btn' : ''}`; };

describe('photo auto-download decision table (A-20)', () => {
  it('automatic', () => {
    const table = Object.fromEntries(Object.entries(NETS).map(([k, n]) => [k, PHOTO_MODES.map((m) => show(n, m))]));
    expect(table).toEqual({ //            unmetered (default)   any             manual
      none: /*        */ ['offline', 'offline', 'offline'],
      wifi: /*        */ ['load', 'load', 'manual+btn'],
      mobile: /*      */ ['wifi+btn', 'load', 'manual+btn'],
      wifiSaver: /*   */ ['saver+btn', 'saver+btn', 'saver+btn'],
      mobileSaver: /* */ ['saver+btn', 'saver+btn', 'saver+btn'],
    });
  });
  it('a manual tap loads on any network, whatever the setting and Data Saver; offline it cannot', () => {
    for (const [k, n] of Object.entries(NETS)) for (const m of PHOTO_MODES) expect(show(n, m, true)).toBe(k === 'none' ? 'offline' : 'load');
  });
  it('owner 03.11.2026: a SMALL picture (list thumbnail, avatar) loads on ANY network - Wi-Fi or mobile, every setting, Data Saver aside; offline it cannot', () => {
    for (const [k, n] of Object.entries(NETS)) for (const m of PHOTO_MODES) expect(show(n, m, false, 'small'), `${k} × ${m}`).toBe(k === 'none' ? 'offline' : 'load');
  });
  it('the old «Wi-Fi only» switch maps onto the mode', () => {
    expect([modeFromLegacy(true), modeFromLegacy(false), modeFromLegacy(undefined)]).toEqual(['unmetered', 'any', 'unmetered']);
  });
});
