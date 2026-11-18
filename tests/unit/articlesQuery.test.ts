import { describe, expect, it } from 'vitest';
import { articlesQuery } from '@/data/source';
import { ARTICLE_SORTS, articleOrder, articleSorts, sortArticles } from '@/data/repo/articleOrder';
import uk from '@/i18n/uk.json';
import ru from '@/i18n/ru.json';
import en from '@/i18n/en.json';
import { localQuery, matchesQuery, mergePage, queryText } from '@/data/repo/articles';
import type { Article } from '@/data/api/types';

const art = (id: number, title: string, o: Partial<Article> = {}): Article => ({ id, kind: 'publication', title, published_at: `2026-11-${String(30 - id).padStart(2, '0')}T10:00:00Z`, site_url: `https://inok.info/articles/publications/${id}/`, ...o });

describe('A-97 / R-44: the ONE query string', () => {
  it('without q / sort the requests are byte for byte 1.0.5\'s (feed, kind, card block, cursor)', () => {
    expect(articlesQuery('uk')).toBe('articles?lang=uk&limit=30');
    expect(articlesQuery('ru', 'c1')).toBe('articles?lang=ru&limit=30&since=c1');
    expect(articlesQuery('uk', null, { kind: 'video' })).toBe('articles?lang=uk&kind=video&limit=30');
    expect(articlesQuery('en', 'x', { monastery: 242, kind: 'news' })).toBe('articles?lang=en&monastery=242&kind=news&limit=5&since=x');
    expect(articlesQuery('uk', null, { sort: 'published' }), 'the default order is never sent').toBe('articles?lang=uk&limit=30');
  });
  it('q is URL-encoded, sort named; the feed has no kind; the cursor rides with the SAME q / sort', () => {
    expect(articlesQuery('uk', null, { q: 'лавра печерська', sort: 'published' })).toBe(`articles?lang=uk&limit=30&q=${encodeURIComponent('лавра печерська')}`);
    expect(articlesQuery('ru', 'n2', { kind: 'publication', q: 'Ж&К', sort: 'views_week' })).toBe('articles?lang=ru&kind=publication&limit=30&since=n2&q=%D0%96%26%D0%9A&sort=views_week');
    expect(articlesQuery('uk', null, { kind: 'video', sort: 'rating' })).toBe('articles?lang=uk&kind=video&limit=30&sort=rating');
    expect(articlesQuery('en', null, { sort: 'created' })).toBe('articles?lang=en&limit=30&sort=created');
    expect(ARTICLE_SORTS).toEqual(['published', 'created', 'views_week', 'rating']);
  });
  it('queryText: trimmed, one space, 2..64 characters; shorter = no search (no request per letter)', () => {
    expect(queryText('')).toBe('');
    expect(queryText(' л ')).toBe('');
    expect(queryText('  ла  ')).toBe('ла');
    expect(queryText('a   b')).toBe('a b');
    expect(queryText('я'.repeat(80))).toHaveLength(64);
  });
  it('«Показати більше»: a page appended never repeats an item (a views order may repeat one between pages)', () => {
    const a = [art(1, 'A'), art(2, 'B')];
    expect(mergePage(a, [art(2, 'B'), art(3, 'C')]).map((x) => x.id)).toEqual([1, 2, 3]);
  });
});

describe('A-97 offline: the saved publications filtered and ordered on the phone', () => {
  const items = [art(1, 'Свято-Успенська лавра', { subtitle: 'Почаїв' }), art(2, 'Ювілей обителі', { views: 10 }), art(3, 'Лаврський хор', { views: 300 }), art(4, 'Новини єпархії')];
  it('title or subtitle, case / apostrophe / і-и folded as the search does', () => {
    expect(matchesQuery(items[0], 'ЛАВРА')).toBe(true);
    expect(matchesQuery(items[0], 'почаив')).toBe(true);
    expect(matchesQuery({ title: 'Обʼєднання', subtitle: null }, "об'єднання")).toBe(true);
    expect(matchesQuery(items[3], 'лавра')).toBe(false);
    expect(localQuery(items, 'лавр', 'published').map((a) => a.id)).toEqual([1, 3]);
  });
  it('the orders: views_week by the saved field (absent = 0), created by created_at else the date; a tie keeps the order', () => {
    const w = [art(1, 'a'), art(2, 'b', { views_week: 10 }), art(3, 'c', { views_week: 300 }), art(4, 'd', { views_week: 10 })];
    expect(localQuery(w, '', 'views_week').map((a) => a.id)).toEqual([3, 2, 4, 1]);
    expect(localQuery([art(1, 'a', { created_at: '2026-01-01T00:00:00Z' }), art(2, 'b')], '', 'created').map((a) => a.id)).toEqual([2, 1]);
    expect(localQuery(items, '', 'published').map((a) => a.id)).toEqual([1, 2, 3, 4]);
  });
});

describe('R-48 (A-101) + A-131 (cloud_41): the rating order = the contract §3 table, by THE one comparator', () => {
  // A before B in each row; «unrated» = rating {value:0,count:0}, «news» = rating null (both after every rated item); v = `views` (the eye);
  // A (id 1) is the NEWER by the helper's dates unless a row gives both the same date
  const r = (value: number, count: number) => ({ rating: { value, count } });
  const unrated = { rating: { value: 0, count: 0 } };
  const news = { kind: 'news', rating: null };
  const same = { published_at: '2026-11-01T10:00:00Z' };
  const rows: [string, Partial<Article>, Partial<Article>][] = [
    ['1 the value first', r(4.8, 3), r(4.7, 90)],
    ['2 equal value: more ratings', r(4.6, 12), r(4.6, 5)],
    ['3 the value AS GIVEN is equal: more ratings', r(4.66, 2), r(4.74, 1)],
    ['4 equal value and count: more views (the eye, not views_week)', { ...r(4.6, 5), views: 477, views_week: 0 }, { ...r(4.6, 5), views: 107, views_week: 90 }],
    ['5 equal value, count, views: the NEWER first', { ...r(4.6, 5), views: 10 }, { ...r(4.6, 5), views: 10 }],
    ['6 any rated before every unrated', { ...r(1.0, 1), views: 0 }, { ...unrated, views: 500 }],
    ['7 any rated before every news', { ...r(1.0, 1), views: 0 }, { ...news, views: 900 }],
    ['8 after the rated: views, the kind does not count', { ...unrated, views: 9 }, { ...news, views: 3 }],
    ['9 equal views after the rated: the newer first', { ...news, views: 3 }, { ...unrated, views: 3 }],
    ['10 null views count 0', { ...r(4.6, 5), views: 1 }, { ...r(4.6, 5), views: null }],
    ['11 everything equal, the date too: the list\'s order', { ...r(4.6, 5), views: 3, ...same }, { ...r(4.6, 5), views: 3, ...same }],
  ];
  it.each(rows)('row %s', (_, A, B) => {
    const a = art(1, 'A', A), b = art(2, 'B', B);
    expect(sortArticles([a, b], 'rating').map((x) => x.id), 'A first when listed first').toEqual([1, 2]);
    const tie = _.startsWith('11');
    expect(sortArticles([b, a], 'rating').map((x) => x.id), tie ? 'a tie keeps the list order' : 'A first when listed second').toEqual(tie ? [2, 1] : [1, 2]);
    expect(Math.sign(articleOrder('rating')!(a, b))).toBe(tie ? 0 : -1);
  });
  it('the offline list orders by the same comparator (no network: rating, count, the eye, the newer)', () => {
    const list = [art(1, 'n', { kind: 'news', rating: null, views: 50 }), art(2, 'u', { rating: { value: 0, count: 0 }, views: 60 }), art(3, 'r', { rating: { value: 4.2, count: 1 } }), art(4, 'r2', { rating: { value: 5, count: 7 }, views: 1 })];
    expect(localQuery(list, '', 'rating').map((a) => a.id)).toEqual([4, 3, 2, 1]);
  });
});

describe('R-48: the sheet offers the new orders only when the server takes them; the old keys are gone', () => {
  it('flag absent / false = the two dates; true = all four', () => {
    expect(articleSorts(undefined)).toEqual(['published', 'created']);
    expect(articleSorts({ articles_sort_v2: false })).toEqual(['published', 'created']);
    expect(articleSorts({ articles_sort_v2: true })).toEqual(['published', 'created', 'views_week', 'rating']);
  });
  it('no `views_asc` / `views_desc` key in any table; every order has its label x3', () => {
    for (const t of [uk, ru, en] as Record<string, string>[]) {
      expect(Object.keys(t).filter((k) => /views_(asc|desc)/.test(k))).toEqual([]);
      for (const s of ARTICLE_SORTS) expect(t[`articles.sort_${s}`], s).toBeTruthy();
    }
  });
});
