import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { bodyPictures, isSitePicture } from '@/data/links/router';
import { articleHeader, articleLead, articlePictures } from '@/data/repo/articles';
import type { Article } from '@/data/api/types';

const items = (JSON.parse(readFileSync('fixtures/articles.json', 'utf8')) as { items: Article[] }).items;
const a2869 = items.find((a) => a.id === 2869)!;

/** R-18 / A-19: the body's own <img src> list is THE offline download list (contract §3) — live sample of article 2869. */
describe('article body pictures (R-18)', () => {
  it('2869 carries its four pictures in the order of the text', () => {
    expect(bodyPictures(a2869.body).map((u) => u.split('/').pop())).toEqual(['01t2q80w700.jpg', '03t2q80w700.jpg', '04t2q80w700.jpg', '02t2q80w700.jpg']);
  });
  it('the offline list = the row\'s cover + the header picture (A-30) + body pictures, nothing else', () => {
    const list = articlePictures(a2869);
    expect(list).toHaveLength(1 + 1 + 4);
    expect(list[0]).toBe(a2869.cover!.url);
    expect(list[1]).toBe(a2869.cover_large!.url);
  });
  it('A-30 / R-26: the header = the page\'s large picture, else the feed preview; never built from a pattern', () => {
    expect(articleHeader(a2869)?.url).toBe('https://inok.info/images/articles/2869/00.jpg');
    expect(articleHeader({ ...a2869, cover_large: null })?.url).toBe(a2869.cover!.url);
    expect(articleHeader({ ...a2869, cover_large: null, cover: null })).toBeNull();
    expect(articlePictures({ ...a2869, cover_large: a2869.cover })).toHaveLength(1 + 4); // one file once
  });
  it('only the site\'s own picture files count; links and foreign pictures do not', () => {
    expect(isSitePicture('https://inok.info/images/articles/2869/01.jpg')).toBe(true);
    expect(isSitePicture('https://example.com/a.jpg')).toBe(false);
    expect(isSitePicture('https://inok.info/articles/2869/')).toBe(false);
    expect(bodyPictures('<p>x</p><img src="https://example.com/a.jpg" width="1" height="1">')).toEqual([]);
    expect(bodyPictures(null)).toEqual([]);
  });
  it('A-40: the lead shows when it says anything; empty html / &nbsp; / null = none', () => {
    expect(articleLead(a2869)).toBe(a2869.lead);
    for (const lead of [null, '', '<p></p>', '<p>&nbsp; </p>', undefined]) expect(articleLead({ lead })).toBeNull();
  });
});
