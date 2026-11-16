import { beforeEach, describe, expect, it, vi } from 'vitest';

// cloud_38 (REVIEW cloud_37 NOTE 6): a LIGHT status bar above the app's DARK «Головна» - the system bars follow the APP's theme
const calls = vi.hoisted(() => ({ style: [] as unknown[], colours: [] as unknown[], native: true, platform: 'android' }));
vi.mock('@capacitor/core', async (orig) => {
  const real = await orig<typeof import('@capacitor/core')>();
  return {
    ...real,
    Capacitor: { ...real.Capacitor, isNativePlatform: () => calls.native, getPlatform: () => calls.platform },
    SystemBars: { setStyle: async (o: unknown) => { calls.style.push(o); } },
    registerPlugin: (name: string) => (name === 'WindowColors' ? { set: async (o: unknown) => { calls.colours.push(o); } } : real.registerPlugin(name)),
  };
});
import { applySystemBars, hexOf } from '@/native/systemBars';
import { applyTheme } from '@/state/theme';

beforeEach(() => { calls.style = []; calls.colours = []; calls.native = true; calls.platform = 'android'; });

describe('system bars follow the app theme (NOTE 6)', () => {
  it('dark app: light icons over the teal header and the dark tab bar; the window strips = header / tab bar', async () => {
    await applySystemBars(true, 'rgb(31, 31, 31)');
    expect(calls.style).toEqual([{ style: 'DARK', bar: 'StatusBar' }, { style: 'DARK', bar: 'NavigationBar' }]);
    expect(calls.colours).toEqual([{ top: '#0c6486', bottom: '#1f1f1f' }]);
  });
  it('light app: the navigation bar icons dark; the status bar stays light-on-teal', async () => {
    await applySystemBars(false, 'rgb(255, 255, 255)');
    expect(calls.style).toEqual([{ style: 'DARK', bar: 'StatusBar' }, { style: 'LIGHT', bar: 'NavigationBar' }]);
    expect(calls.colours).toEqual([{ top: '#0c6486', bottom: '#ffffff' }]);
  });
  it('iOS: the styles only (no Android window); the web: nothing', async () => {
    calls.platform = 'ios';
    await applySystemBars(true);
    expect(calls.style).toHaveLength(2);
    expect(calls.colours).toEqual([]);
    calls.native = false; calls.style = [];
    await applySystemBars(true);
    expect(calls.style).toEqual([]);
  });
  it('the theme switch itself styles the bars (applyTheme)', async () => {
    const cls = new Set<string>();
    const g = globalThis as Record<string, unknown>;
    g.document = { documentElement: { classList: { toggle: (c: string, on: boolean) => (on ? cls.add(c) : cls.delete(c)) } }, querySelector: () => null };
    g.window = { matchMedia: () => ({ matches: false, addEventListener: () => {}, removeEventListener: () => {} }) };
    applyTheme('dark');
    await new Promise((r) => setTimeout(r, 0));
    expect(cls.has('ion-palette-dark')).toBe(true);
    expect(calls.colours).toEqual([{ top: '#0c6486', bottom: '#1f1f1f' }]);
    delete g.document; delete g.window;
  });
  it('hexOf reads computed colours', () => {
    expect(hexOf('rgb(12, 100, 134)')).toBe('#0c6486');
    expect(hexOf('rgba(0, 0, 0, 0.5)')).toBe('#000000');
    expect(hexOf('#FFFFFF')).toBe('#ffffff');
    expect(hexOf('transparent')).toBeNull();
  });
});
