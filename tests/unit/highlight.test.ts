import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { highlightRanges } from '@/data/search/highlight';

const marked = (text: string, q: string) => highlightRanges(text, q).map(([a, b]) => text.slice(a, b));

describe('search highlight (A-23 #4: as /monasteries/ marks, case- and apostrophe-insensitive)', () => {
  it('marks every token in the original letters', () => {
    expect(marked('Києво-Печерська Успенська Лавра', 'печерська лавра')).toEqual(['Печерська', 'Лавра']);
    expect(marked('вул. Лаврська, 15, корп. 42, м. Київ', 'ЛАВРСЬК')).toEqual(['Лаврськ']);
  });
  it('apostrophes and confused letters do not stop a match', () => {
    expect(marked("Кам'янська єпархія", 'камянська')).toEqual(["Кам'янська"]);
    expect(marked('Архімандрит Арсеній (Дем’янчук)', "дем'ян")).toEqual(['Дем’ян']);
    expect(marked('Київська єпархія', 'киевская')).toEqual([]); // а ≠ ь: not a fold, no false mark
    expect(marked('Свято-Іллінський', 'иллин')).toEqual(['Іллін']);
  });
  it('one letter marks nothing; overlapping tokens merge', () => {
    expect(marked('Київ', 'к')).toEqual([]);
    expect(highlightRanges('Лаврська', 'лавр авр')).toEqual([[0, 4]]);
  });
});

import { headLine } from '@/data/repo/types';
describe('the list row\'s head line (A-23 #4, as /monasteries/)', () => {
  it('post - person (bold), see', () => {
    expect(headLine({ head_uk: 'Митрополит Павел (Лебідь), Вишгородський і Чорнобильський', head_role_uk: 'намісник (ігумен)' }, 'uk'))
      .toEqual({ role: 'Намісник (ігумен)', person: 'Митрополит Павел (Лебідь)', rest: 'Вишгородський і Чорнобильський', born: '' });
    expect(headLine({ head_uk: "Архімандрит Арсеній (Дем'янчук)", head_role_uk: 'настоятель' }, 'uk'))
      .toEqual({ role: 'Настоятель', person: "Архімандрит Арсеній (Дем'янчук)", rest: '', born: '' });
    // R-22: the date + dictionary label_head_born, per language; none = no tail
    const dict = { label_head_born: 'р. н.' };
    expect(headLine({ head_uk: 'Митрополит Павел (Лебідь), Вишгородський', head_born_uk: '19.04.1961', head_born_en: '19 Apr 1961' }, 'uk', dict)?.born).toBe('19.04.1961 р. н.');
    expect(headLine({ head_uk: 'Paul', head_born_en: '19 Apr 1961' }, 'en', { label_head_born: 'y. b.' })?.born).toBe('19 Apr 1961 y. b.');
    expect(headLine({ head_uk: null }, 'uk')).toBeNull();
  });
  // R-40 (A-79 4): the CARD prints `label_head_born_card` (the site card's word); the list row keeps `label_head_born`; an older export without
  // the card key -> the list's word. Red on 1.0.3 (the card printed «р. н.» / «y. b.»).
  it('R-40: the card\'s word, the list\'s word, the fallback', async () => {
    const { headBorn } = await import('@/data/repo/types');
    const row = { head_born_uk: '19.04.1961', head_born_ru: '19.04.1961', head_born_en: '19 Apr 1961' };
    const dict = (l: 'uk' | 'ru' | 'en') => ({ uk: { label_head_born: 'р. н.', label_head_born_card: 'року народження' },
      ru: { label_head_born: 'г. р.', label_head_born_card: 'года рождения' }, en: { label_head_born: 'y. b.', label_head_born_card: 'year of birth' } })[l];
    expect(headBorn(row, 'uk', dict('uk'), 'card')).toBe('19.04.1961 року народження');
    expect(headBorn(row, 'ru', dict('ru'), 'card')).toBe('19.04.1961 года рождения');
    expect(headBorn(row, 'en', dict('en'), 'card')).toBe('19 Apr 1961 year of birth');
    expect(headBorn(row, 'en', dict('en'))).toBe('19 Apr 1961 y. b.');
    expect(headLine({ head_uk: 'Paul', ...row }, 'uk', dict('uk'))?.born).toBe('19.04.1961 р. н.');
    expect(headBorn(row, 'uk', { label_head_born: 'р. н.' }, 'card')).toBe('19.04.1961 р. н.');
    expect(headBorn({}, 'uk', dict('uk'), 'card')).toBe('');
    const card = readFileSync(new URL('../../src/pages/MonasteryCard.tsx', import.meta.url), 'utf8');
    expect(card).toMatch(/headBorn\(row, lang, dict, 'card'\)/);
  });
});

import { hiddenMatch } from '@/data/search/highlight';
describe('D27: a found row shows why', () => {
  it('names the hidden field that holds the unmarked token, with a snippet', () => {
    const m = hiddenMatch(['Скит Святого Духа', 'Донецька єпархія'], [{ label: 'Офіційна назва', text: 'Скит Святого Духа Свято-Успенської Святогірської Лаври' }], 'лавр');
    expect(m?.label).toBe('Офіційна назва');
    expect(m?.text).toMatch(/Лаври$/);
  });
  it('null when every token is visible, or nothing explains it', () => {
    expect(hiddenMatch(['вул. Лаврська'], [{ label: 'x', text: 'лавра' }], 'лавр')).toBeNull();
    expect(hiddenMatch(['abc'], [{ label: 'x', text: 'def' }], 'лавр')).toBeNull();
  });
});
