import { readFileSync } from 'node:fs';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// Capacitor Preferences in node: a Map (the settings' store)
const store = new Map<string, string>();
vi.mock('@capacitor/preferences', () => ({
  Preferences: {
    get: async ({ key }: { key: string }) => ({ value: store.get(key) ?? null }),
    set: async ({ key, value }: { key: string; value: string }) => { store.set(key, value); },
  },
}));

import { DEFAULTS, incognitoOf, loadSettings, saveSettings } from '@/state/settings';

describe('A-96 W-7: «Режим інкогніто» replaces «Статистика використання» - the switch inverted, OFF at first, the 1.0.5 choice migrated', () => {
  beforeEach(() => store.clear());
  it('a fresh install: incognito OFF (collection as before, the owner\'s «изначально ползунок неактивный»)', async () => {
    expect(DEFAULTS.incognito).toBe(false);
    expect((await loadSettings()).incognito).toBe(false);
  });
  it('MIGRATION: 1.0.5 statistics OFF -> incognito ON (never counted without consent after the update)', async () => {
    store.set('settings', JSON.stringify({ lang: 'ru', analytics: false }));
    const s = await loadSettings();
    expect(s.incognito).toBe(true);
    expect('analytics' in s, 'the old key is not carried on').toBe(false);
  });
  it('MIGRATION: 1.0.5 statistics ON (or never touched) -> incognito OFF', async () => {
    store.set('settings', JSON.stringify({ analytics: true }));
    expect((await loadSettings()).incognito).toBe(false);
    store.set('settings', JSON.stringify({ theme: 'dark' }));
    expect((await loadSettings()).incognito).toBe(false);
  });
  it('the new switch, once saved, wins; it survives a save + load both ways', async () => {
    expect(incognitoOf(false, false)).toBe(false);
    expect(incognitoOf(true, true)).toBe(true);
    for (const v of [true, false]) {
      await saveSettings({ ...(await loadSettings()), incognito: v });
      expect(JSON.parse(store.get('settings')!).incognito).toBe(v);
      expect((await loadSettings()).incognito).toBe(v);
    }
  });
  it('ONE setting stops BOTH collectors: Firebase Analytics (App.tsx) and the eye\'s view (ViewsEye.tsx)', () => {
    expect(readFileSync('src/app/App.tsx', 'utf8')).toMatch(/const on = !settings\.incognito/);
    expect(readFileSync('src/components/ViewsEye.tsx', 'utf8')).toMatch(/!settings\.incognito && !settings\.ownDevice/);
    for (const f of ['src/app/App.tsx', 'src/components/ViewsEye.tsx', 'src/pages/More.tsx']) expect(readFileSync(f, 'utf8')).not.toMatch(/settings\.analytics/);
  });
  it.each([
    ['uk', 'Режим інкогніто', 'Ваша активність у застосунку не враховуватиметься в загальній статистиці'],
    ['ru', 'Режим инкогнито', 'Ваша активность в приложении не будет учитываться в общей статистике'],
    ['en', 'Incognito mode', 'Your activity in the app will not be counted in the overall statistics'],
  ])('%s: the words of A-96 W-7', (l, title, hint) => {
    const d = JSON.parse(readFileSync(`src/i18n/${l}.json`, 'utf8')) as Record<string, string>;
    expect(d['more.incognito']).toBe(title);
    expect(d['more.incognito_hint']).toBe(hint);
    expect(d['more.analytics']).toBeUndefined();
  });
});
