import { Preferences } from '@capacitor/preferences';
import { DEFAULT_LANG, LANGS, langFromTag, type Lang } from '@/i18n';
import { DEFAULT_PHOTO_MODE, PHOTO_MODES, modeFromLegacy, type PhotoMode } from '@/data/photos/policy';

export interface Settings {
  /** null = follow the device language */
  lang: Lang | null;
  /** A-20: «Ще → Автозавантаження фото» (replaces the old «Wi-Fi only» switch) */
  photos: PhotoMode;
  /** FCM topics the user wants (spec §5: one switch for articles, one per channel `ch_<id>`); applied once push is registered */
  topics: string[];
  /** A-16: «Ще → Тема»; default = as the system */
  theme: Theme;
  /** A-23 #8: the article text size, an index into ARTICLE_SCALES (default 100 %) */
  articleScale: number;
  /** A-96 W-7 (replaces A-36's «Статистика використання»): «Ще → Режим інкогніто» - OFF by default = today's collection (Firebase
   *  Analytics screen names + the eye's one view a day); ON stops both at once. Stored as `incognito`; 1.0.5's `analytics: false` -> ON. */
  incognito: boolean;
  /** A-64 / A-67: the soft questions already answered (each is asked ONCE, src/state/softAsk.ts) */
  asked: AskKind[];
  /** A-65: «own device» - its views are never sent (7 taps on the version line in «Ще» toggle it; local only, nothing sent) */
  ownDevice: boolean;
}
/** A-64 / A-67: the two soft notification questions - after the first opened article, on the first open of «Трансляції» */
export type AskKind = 'articles' | 'streams' | 'hint_monastery' | 'hint_article';
/** + A-142 (4): `hint_<kind>` = that long-press hint is retired on this install (the store / ring scripts set it: no hint in a frame) */
const ASK_KINDS: AskKind[] = ['articles', 'streams', 'hint_monastery', 'hint_article'];
/** A-23 #8: five steps of the article text, on top of the system font scale */
export const ARTICLE_SCALES = [0.85, 1, 1.15, 1.3, 1.5];
const DEFAULT_SCALE = 1;
export type Theme = 'system' | 'light' | 'dark';
export const THEMES: Theme[] = ['system', 'light', 'dark'];

const KEY = 'settings';
/** A-64: a NEW install listens to nothing until the user says yes (the soft question); 1.0.0's default is kept by an existing install */
export const DEFAULTS: Settings = { lang: null, photos: DEFAULT_PHOTO_MODE, topics: [], theme: 'system', articleScale: DEFAULT_SCALE, incognito: false, asked: [], ownDevice: false };
/** 1.0.0's default topics: an install that ran 1.0.0 and never saved a setting keeps them (A-64 «an existing install keeps what it has») */
export const LEGACY_TOPICS = ['articles'];

/** A-96 W-7 MIGRATION: the new switch once saved wins; else 1.0.5's «Статистика використання» OFF (`analytics: false`) = incognito ON - a person
 *  who refused collection never starts being counted by the update; anything else (on, absent, a fresh install) = OFF. */
export const incognitoOf = (incognito: unknown, analytics: unknown): boolean => (typeof incognito === 'boolean' ? incognito : analytics === false);

export async function loadSettings(): Promise<Settings> {
  try {
    const { value } = await Preferences.get({ key: KEY });
    if (!value) return { ...DEFAULTS };
    const { analytics, ...s } = JSON.parse(value) as Partial<Settings> & { wifiOnly?: boolean; analytics?: boolean };
    return { ...DEFAULTS, ...s, lang: s.lang && (LANGS as readonly string[]).includes(s.lang) ? s.lang : null, topics: Array.isArray(s.topics) ? s.topics : DEFAULTS.topics,
      theme: THEMES.includes(s.theme as Theme) ? (s.theme as Theme) : DEFAULTS.theme, incognito: incognitoOf(s.incognito, analytics),
      ownDevice: s.ownDevice === true,
      asked: Array.isArray(s.asked) ? s.asked.filter((k) => ASK_KINDS.includes(k)) : [],
      articleScale: Number.isInteger(s.articleScale) && s.articleScale! >= 0 && s.articleScale! < ARTICLE_SCALES.length ? s.articleScale! : DEFAULT_SCALE,
      photos: PHOTO_MODES.includes(s.photos as PhotoMode) ? (s.photos as PhotoMode) : modeFromLegacy(s.wifiOnly) };
  } catch {
    return { ...DEFAULTS };
  }
}

/** A-64: true when settings were ever saved on this device (an install without them that already holds the directory ran 1.0.0). */
export async function settingsStored(): Promise<boolean> {
  try { return !!(await Preferences.get({ key: KEY })).value; } catch { return false; }
}

export const saveSettings = (s: Settings): Promise<void> => Preferences.set({ key: KEY, value: JSON.stringify(s) });

/** Effective interface language: the user's choice, else the device language if it is one of the three, else uk. */
export const effectiveLang = (s: Settings): Lang =>
  s.lang ?? (typeof navigator !== 'undefined' ? langFromTag(navigator.language) : DEFAULT_LANG);
