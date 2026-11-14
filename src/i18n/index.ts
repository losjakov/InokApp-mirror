import uk from './uk.json';
import ru from './ru.json';
import en from './en.json';

export type Lang = 'uk' | 'ru' | 'en';
export const LANGS: readonly Lang[] = ['uk', 'ru', 'en'] as const;
export const DEFAULT_LANG: Lang = 'uk';

type Dict = Record<string, string>;
const dicts: Record<Lang, Dict> = { uk, ru, en };

export type Translate = (key: string, params?: Record<string, string | number>) => string;

/** Picks one of the three app languages from a BCP-47 tag; anything else → uk (spec §1). */
export function langFromTag(tag: string | undefined | null): Lang {
  const base = (tag ?? '').toLowerCase().split(/[-_]/)[0];
  return (LANGS as readonly string[]).includes(base) ? (base as Lang) : DEFAULT_LANG;
}

/** Slavic plural category for integer n: one / few / many (uk, ru); en: one / many. */
export function pluralKey(n: number, lang: Lang): 'one' | 'few' | 'many' {
  const a = Math.abs(n);
  if (lang === 'en') return a === 1 ? 'one' : 'many';
  const m10 = a % 10;
  const m100 = a % 100;
  if (m10 === 1 && m100 !== 11) return 'one';
  if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return 'few';
  return 'many';
}

export function makeT(lang: Lang): Translate {
  const d = dicts[lang];
  const fallback = dicts[DEFAULT_LANG];
  return (key, params) => {
    let s = d[key] ?? fallback[key] ?? key;
    if (params) for (const [k, v] of Object.entries(params)) s = s.split(`{${k}}`).join(String(v));
    return s;
  };
}

/** `t('monasteries.count', n)` with plural variants `<key>_one`, `<key>_few`, `<key>` (= many). */
export function tCount(t: Translate, lang: Lang, key: string, n: number): string {
  const cat = pluralKey(n, lang);
  const k = cat === 'many' ? key : `${key}_${cat}`;
  return t(k, { n });
}

/** Returns the field in the interface language, falling back uk → ru → en (as the site does). */
export function pickLang<T>(obj: Partial<Record<Lang, T>> | null | undefined, lang: Lang): T | null {
  if (!obj) return null;
  for (const l of [lang, 'uk', 'ru', 'en'] as Lang[]) {
    const v = obj[l];
    if (v !== undefined && v !== null && v !== '') return v;
  }
  return null;
}

export const dictKeys = (): string[] => Object.keys(uk);
export const dictFor = (lang: Lang): Dict => dicts[lang];
