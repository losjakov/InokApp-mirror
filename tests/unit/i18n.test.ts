import { describe, expect, it } from 'vitest';
import { dictFor, dictKeys, langFromTag, makeT, pluralKey, tCount } from '@/i18n';

describe('i18n', () => {
  it('ru and en carry every uk key (no missing strings) and no extra keys', () => {
    const uk = dictKeys();
    for (const l of ['ru', 'en'] as const) {
      const d = dictFor(l);
      expect(uk.filter((k) => !(k in d))).toEqual([]);
      expect(Object.keys(d).filter((k) => !uk.includes(k))).toEqual([]);
    }
  });
  it('device language → one of three, else uk', () => {
    expect(langFromTag('ru-RU')).toBe('ru');
    expect(langFromTag('en-US')).toBe('en');
    expect(langFromTag('uk')).toBe('uk');
    expect(langFromTag('pl-PL')).toBe('uk');
    expect(langFromTag(undefined)).toBe('uk');
  });
  it('plurals', () => {
    expect(pluralKey(1, 'uk')).toBe('one');
    expect(pluralKey(3, 'uk')).toBe('few');
    expect(pluralKey(11, 'uk')).toBe('many');
    expect(pluralKey(21, 'ru')).toBe('one');
    expect(pluralKey(2, 'en')).toBe('many');
    const t = makeT('uk');
    expect(tCount(t, 'uk', 'monasteries.count', 1)).toBe('1 обитель');
    expect(tCount(t, 'uk', 'monasteries.count', 3)).toBe('3 обителі');
    expect(tCount(t, 'uk', 'monasteries.count', 317)).toBe('317 обителей');
  });
  it('D59: no UI string prints a technical zone id; the calendar note says Kyiv time in words', () => {
    for (const l of ['uk', 'ru', 'en'] as const) {
      const d = dictFor(l);
      expect(Object.entries(d).filter(([, v]) => /\b(Europe|UTC|GMT)\b|[A-Z][a-z]+\/[A-Z][a-z]+/.test(v)).map(([k]) => k), l).toEqual([]);
    }
    expect(dictFor('uk')['calendar.tomorrow']).toBe('Після 16:00 за київським часом ви вже бачите календар на наступний день');
    expect(dictFor('ru')['calendar.tomorrow']).toBe('После 16:00 по киевскому времени вы уже видите календарь на следующий день');
    expect(dictFor('en')['calendar.tomorrow']).toBe('After 4 pm Kyiv time you already see the calendar for the next day');
  });
  it('D60: the photo-setting hint is two short lines; the network detail lives in the placeholder\'s reason line', () => {
    for (const l of ['uk', 'ru', 'en'] as const) {
      const d = dictFor(l);
      const lines = d['photos.hint'].split('\n');
      expect(lines, l).toHaveLength(2);
      for (const x of lines) expect(x.length, `${l}: ${x}`).toBeLessThanOrEqual(52);
      expect(d['photos.hint'], `${l}: a dash never starts a line`).not.toMatch(/ —/);
      expect(d['photos.hint'], l).not.toMatch(/роздача|раздача|hotspot|роумінг|роуминг|roaming|Data Saver|економі|экономи/i);
      expect(d['photos.reason_wifi'], `${l}: A-50 #2 - no bracket, no hotspot note (the owner: it confuses)`).not.toMatch(/[()]|роздача|раздача|hotspot/);
      expect(d['photos.reason_saver'], l).toMatch(/економі|экономи|Data Saver/);
    }
    expect(dictFor('uk')['photos.hint']).toBe('Мініатюри в списках\u00a0— завжди.\nВеликі фото (картка, публікації)\u00a0— за цим вибором.');
  });
  it('N4 (CD S284, ruling 72): ONE English term - «diocese» as the site\'s own EN data prints it; never «eparch*» in en', () => {
    const en = dictFor('en');
    expect(Object.entries(en).filter(([, v]) => /eparch/i.test(v)).map(([k]) => k)).toEqual([]);
    expect(en['eparchies.own_site']).toBe('Diocese website');
    expect(en['card.subordination_1']).toBe('diocesan');
  });
  it('cloud_30 terms (InokSite 329): ONE pass - the section = «Публікації», the kind = «Статті»; the two never become one word', () => {
    const want = { uk: ['Публікації', 'Статті', 'Стаття'], ru: ['Публикации', 'Статьи', 'Статья'], en: ['Publications', 'Articles', 'Article'] } as const;
    for (const l of ['uk', 'ru', 'en'] as const) {
      const d = dictFor(l);
      const [section, kind, kind1] = want[l];
      for (const k of ['tabs.articles', 'home.articles', 'articles.title', 'more.articles']) expect(d[k], `${l} ${k}`).toBe(section);
      expect(d['kind.publication'], l).toBe(kind);
      expect(d['kind1.publication'], l).toBe(kind1);
      expect(d['kind.publication']).not.toBe(d['tabs.articles']);
      expect(d['notifications.articles_hint'].startsWith(kind), l).toBe(true);
      expect(d['notifications.articles'], l).toMatch(/публікації|публикации|publications/);
    }
  });
});
