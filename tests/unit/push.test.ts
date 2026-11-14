import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { pushTitle, routeForPush } from '@/data/live/pushRoute';
import { loadLiveStatus } from '@/data/sync';
import { cacheSet } from '@/data/repo/cache';
import type { LiveStatus } from '@/data/api/types';
import { freshDb } from './helpers';

/** Contract §4: FCM data values are strings; `title` is a JSON string of the three languages. */
describe('push payload → route', () => {
  const stream = { type: 'stream_live', data: { type: 'stream_live', channel_id: '1686', video_id: 'DWCj8tI47q4', title: '{"uk":"Літургія","ru":"Литургия","en":"Liturgy"}' } };
  const article = { type: 'article', data: { type: 'article', id: '2869', kind: 'news', title: '{"uk":"Новина","ru":"","en":null}' } };
  it('a stream opens the video in the YouTube app (A-4.2); without a video id — the streams tab', () => {
    expect(routeForPush(stream)).toEqual({ kind: 'youtube', url: 'https://www.youtube.com/watch?v=DWCj8tI47q4' });
    expect(routeForPush({ type: 'stream_live', data: {} })).toEqual({ kind: 'navigate', to: '/streams' });
  });
  it('an article opens the article; unknown types do nothing', () => {
    expect(routeForPush(article)).toEqual({ kind: 'navigate', to: '/articles?id=2869' });
    expect(routeForPush({ type: 'weird', data: {} })).toBeNull();
  });
  it('the title follows the app language with the uk → ru → en fallback', () => {
    expect(pushTitle(stream, 'ru')).toBe('Литургия');
    expect(pushTitle(article, 'en')).toBe('Новина');
    expect(pushTitle({ type: 'x', data: { title: 'plain' } }, 'uk')).toBe('plain');
  });
});

/** Stage 3: live-status is polled every 120 s; offline the last cached answer is shown as stale. */
describe('live-status cache', () => {
  it('falls back to the cached status (stale: true) when the source is unreachable, null when nothing is cached', async () => {
    const { db } = await freshDb();
    expect(await loadLiveStatus(db)).toBeNull(); // Node: the fixtures source has no server → throws → no cache
    const status: LiveStatus = JSON.parse(readFileSync(new URL('../../fixtures/live-status.json', import.meta.url), 'utf8'));
    await cacheSet(db, 'live-status', status);
    const r = await loadLiveStatus(db);
    expect(r?.stale).toBe(true);
    expect(r?.status.live.map((l) => l.channel_id)).toContain(1686);
    expect(r?.status.calendar?.date).toBe('2026-11-02');
  });
});

import { ARTICLE_KINDS, articleKinds, withArticleKinds } from '@/native/push';
/** A-11 / contract §4: `articles` OR the kind topics, never both; channel topics untouched. */
describe('article topics by kind', () => {
  it('all three → articles alone; some → their kind topics; none → nothing; never both', () => {
    const base = ['ch_1686', 'articles'];
    expect(withArticleKinds(base, ARTICLE_KINDS)).toEqual(['articles', 'ch_1686']);
    expect(withArticleKinds(base, ['video', 'news'])).toEqual(['articles_video', 'articles_news', 'ch_1686']);
    expect(withArticleKinds(['articles_video', 'ch_3'], [])).toEqual(['ch_3']);
    expect(withArticleKinds(['articles_video', 'articles_news'], ['video', 'news', 'publication'])).toEqual(['articles']);
    for (const ks of [[], ['news'], ['video', 'publication'], [...ARTICLE_KINDS]] as const) {
      const t = withArticleKinds(['articles', 'articles_news', 'ch_1'], ks);
      expect(t.includes('articles') && t.some((x) => x.startsWith('articles_'))).toBe(false);
      expect(articleKinds(t).sort()).toEqual([...ks].sort());
    }
  });
  it('the default (articles) reads as all three kinds', () => {
    expect(articleKinds(['articles'])).toEqual(['publication', 'video', 'news']);
    expect(articleKinds([])).toEqual([]);
  });
});
