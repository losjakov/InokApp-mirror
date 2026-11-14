import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { fetchArticle, fetchQuery, getArticle, listArticles, parseArticles, readOnSite, storeArticles, videoLink } from '@/data/repo/articles';
import { VIDEO_FACE, videoFace } from '@/components/VideoButton';
import type { Article } from '@/data/api/types';
import uk from '@/i18n/uk.json';
import ru from '@/i18n/ru.json';
import en from '@/i18n/en.json';
import { freshDb, serveFixtures } from './helpers';

afterEach(() => vi.unstubAllGlobals());

const live = JSON.parse(readFileSync(new URL('../../fixtures/articles_video_r47.json', import.meta.url), 'utf8')) as Record<string, { items: Article[] }>;
const item = (id: number, lang = 'uk') => live[lang].items.find((a) => a.id === id)!;
const yt = 'https://www.youtube.com/watch?v=sw6gaWxW-x8';

/** R-47 (A-101): ONE video button from `video`, any kind; the 1.0.6 copy falls back to youtube_video_id; «read in full» only with neither. */
describe('R-47: the video link and the button it makes', () => {
  it('the host decides the button: youtube / facebook / other (unknown host = other); https only', () => {
    expect(videoLink({ video: { url: yt, host: 'youtube' } })).toEqual({ url: yt, host: 'youtube' });
    expect(videoLink(item(1682))).toEqual({ url: 'https://www.facebook.com/inok.info/videos/1226721174137171/', host: 'facebook' });
    expect(videoLink({ video: { url: 'https://vimeo.com/1', host: 'vimeo' } })).toEqual({ url: 'https://vimeo.com/1', host: 'other' });
    expect(videoLink({ video: { url: 'http://x.example/v', host: 'other' } }), 'never a non-https link').toBeNull();
    expect(videoFace({ url: yt, host: 'youtube' }).label).toBe('articles.watch');
    expect(videoFace({ url: 'u', host: 'facebook' }).label).toBe('articles.watch_facebook');
    expect(videoFace({ url: 'u', host: 'zzz' }).label).toBe('articles.watch_other');
  });
  it('ONE link per item: `video` wins over youtube_video_id; the 1.0.6 copy (no `video`) = YouTube as before; video null = none', () => {
    expect(videoLink({ youtube_video_id: 'sw6gaWxW-x8' }), 'an old saved copy').toEqual({ url: yt, host: 'youtube' });
    expect(videoLink({ video: { url: 'https://www.facebook.com/p/videos/1/', host: 'facebook' }, youtube_video_id: 'abc' })?.host).toBe('facebook');
    expect(videoLink({ video: null, youtube_video_id: null })).toBeNull();
    expect(videoLink({})).toBeNull();
  });
  it('«Читати повністю» only when body AND video are both absent (1682 has a body, 1892 a video, an included-file item neither)', () => {
    for (const l of ['uk', 'ru', 'en']) {
      expect(readOnSite(item(1682, l)), `1682 ${l}`).toBe(false);
      expect(item(1892, l).body, `1892 ${l} has no text on the site`).toBeNull();
      expect(readOnSite(item(1892, l)), `1892 ${l}`).toBe(false);
    }
    expect(readOnSite({ body: null, video: null })).toBe(true);
    expect(readOnSite({ body: null, youtube_video_id: 'x' }), 'old copy of a YouTube video').toBe(false);
  });
  it('every face has its words in the three tables', () => {
    for (const t of [uk, ru, en] as Record<string, string>[]) for (const f of Object.values(VIDEO_FACE)) expect(t[f.label], f.label).toBeTruthy();
    expect([uk['articles.watch_facebook'], ru['articles.watch_facebook'], en['articles.watch_facebook']]).toEqual(['Дивитися на Facebook', 'Смотреть на Facebook', 'Watch on Facebook']);
  });
});

describe('P1: a 1.0.6 saved copy is replaced by the server\'s copy on open', () => {
  it('1892 saved without `video` -> opened online = the live copy with `video` in the cache', async () => {
    serveFixtures();
    const { db } = await freshDb();
    const old = { ...item(1892) } as Partial<Article>; delete old.video;
    await storeArticles(db, 'uk', parseArticles({ items: [old] }).items);
    expect((await getArticle(db, 1892, 'uk'))?.video).toBeUndefined();
    await fetchArticle(db, 1892, 'uk');
    expect((await getArticle(db, 1892, 'uk'))?.video).toEqual({ url: yt, host: 'youtube' });
  });
});

describe('P8: a sorted answer writes views_week + rating into the saved copies (the offline sort orders by them)', () => {
  it('the saved item takes the answer\'s numbers; an unsaved one stays unsaved', async () => {
    serveFixtures();
    const { db } = await freshDb();
    const fx = JSON.parse(readFileSync(new URL('../../fixtures/articles.json', import.meta.url), 'utf8'));
    await storeArticles(db, 'uk', parseArticles(fx).items);
    const before = await listArticles(db, 'uk');
    expect(before.every((a) => a.views_week === undefined)).toBe(true);
    const page = await fetchQuery(db, 'uk', null, '', 'views_week', null);
    const saved = await listArticles(db, 'uk');
    expect(saved.some((a) => (a.views_week ?? 0) > 0), 'some saved item took a number').toBe(true);
    for (const a of page.items.filter((x) => saved.some((s) => s.id === x.id))) expect(saved.find((s) => s.id === a.id)!.views_week, `id ${a.id}`).toBe(a.views_week);
    expect(saved.length).toBe(before.length);
  });
});
