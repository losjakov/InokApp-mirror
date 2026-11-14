import { describe, expect, it } from 'vitest';
import { buildBlocks } from '@/data/repo/articles';
import { articlesQuery } from '@/data/source';
import type { Article, ArticlesPage } from '@/data/api/types';
import { readFileSync } from 'node:fs';

const related = JSON.parse(readFileSync(new URL('../../fixtures/related.json', import.meta.url), 'utf8'))['242'] as Record<string, ArticlesPage>;
const a = (id: number): Article => ({ id, kind: 'news', title: `t${id}`, published_at: '2026-10-01T00:00:00Z' } as Article);

/** A-18 / R-17: the card's blocks — the site's order, empty blocks not drawn, «Показати більше» while `next`. */
describe('card related blocks', () => {
  it('order publication → video → news; an empty block is dropped (no heading, no list)', () => {
    const b = buildBlocks({ news: { items: [a(3)], next: null }, video: { items: [], next: null }, publication: { items: [a(1), a(2)], next: 'c1' } });
    expect(b.map((x) => [x.kind, x.items.length, x.next])).toEqual([['publication', 2, 'c1'], ['news', 1, null]]);
    expect(buildBlocks({})).toEqual([]);
  });
  it('the live sample of card 242 (uk): three blocks, 5 + more / 3 / 5 + more; the second publications page ends the list (uk 10)', () => {
    const b = buildBlocks({ publication: related['uk|publication|'], video: related['uk|video|'], news: related['uk|news|'] });
    expect(b.map((x) => [x.kind, x.items.length, !!x.next])).toEqual([['publication', 5, true], ['video', 3, false], ['news', 5, true]]);
    expect(related['uk|publication|by41'].items.length + 5).toBe(10);
    expect(related['uk|publication|by41'].next).toBeNull();
  });
  it('ONE query per block in the interface language, 5 per page, the cursor of the block', () => {
    expect(articlesQuery('ru', null, { monastery: 242, kind: 'video' })).toBe('articles?lang=ru&monastery=242&kind=video&limit=5');
    expect(articlesQuery('uk', 'by41', { monastery: 242, kind: 'publication' })).toBe('articles?lang=uk&monastery=242&kind=publication&limit=5&since=by41');
    expect(articlesQuery('uk')).toBe('articles?lang=uk&limit=30'); // the feed is unchanged
    expect(articlesQuery('uk', null, { kind: 'news' })).toBe('articles?lang=uk&kind=news&limit=30'); // R-19: a section list
    expect(articlesQuery('en', 'c9', { kind: 'video' })).toBe('articles?lang=en&kind=video&limit=30&since=c9');
  });
});
