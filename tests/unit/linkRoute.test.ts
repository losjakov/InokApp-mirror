import { beforeAll, describe, expect, it } from 'vitest';
import { linkRoute } from '@/app/linkRoute';
import { importedDb } from './helpers';
import type { Db } from '@/data/db/types';

/** A-138 (+ amendment): THE route of a site link - one rule for the cold start (StartRoute) and the running app (useAppLinks / html-lite taps).
 *  Red before cloud_42: every list page -> null (StartRoute -> «Головна» + the in-app browser), `/dioceses/<id>/` -> null (the browser). */
describe('linkRoute (StartRoute + useAppLinks + the article text)', () => {
  let db: Db;
  let epId = 0;
  beforeAll(async () => {
    db = (await importedDb()).db;
    epId = Number((await db.query('SELECT id FROM eparchy ORDER BY id LIMIT 1'))[0].id);
  });
  const now = () => 1234;
  it('the monasteries LIST -> the «Монастирі» tab, reset (a mark), any ?lang=', async () => {
    for (const h of ['https://inok.info/monasteries/', 'https://inok.info/monasteries/?lang=ru', 'https://inok.info/monasteries/?lang=en', 'https://inok.info/monasteries'])
      expect(await linkRoute(db, h, now), h).toEqual({ to: '/monasteries', entry: { reset: 1234 } });
  });
  it('the article sections -> «Публікації» on their tab (Статті / Відео / Новини), reset', async () => {
    expect(await linkRoute(db, 'https://inok.info/articles/publications/?lang=ru', now)).toEqual({ to: '/articles', entry: { reset: 1234, kind: 'publication' } });
    expect(await linkRoute(db, 'https://inok.info/articles/video/', now)).toEqual({ to: '/articles', entry: { reset: 1234, kind: 'video' } });
    expect(await linkRoute(db, 'https://inok.info/articles/news/?lang=en', now)).toEqual({ to: '/articles', entry: { reset: 1234, kind: 'news' } });
    // T4 (cloud_43): the site's «Публікації» umbrella -> the tab «Усі», reset
    for (const h of ['https://inok.info/articles/', 'https://inok.info/articles/?lang=ru', 'https://inok.info/uk/articles/'])
      expect(await linkRoute(db, h, now), h).toEqual({ to: '/articles', entry: { reset: 1234, kind: 'all' } });
    expect(await linkRoute(db, 'https://inok.info/articles/x/', now)).toBeNull();
  });
  it('/dioceses/ -> the eparchies list (reset); /dioceses/<id>/ in the DB -> the app\'s own eparchy page; unknown id -> the browser', async () => {
    expect(await linkRoute(db, 'https://inok.info/dioceses/', now)).toEqual({ to: '/more/eparchies', entry: { reset: 1234 } });
    expect(await linkRoute(db, `https://inok.info/dioceses/${epId}/?lang=ru`, now)).toEqual({ to: `/more/eparchies/${epId}` });
    expect(await linkRoute(db, 'https://inok.info/dioceses/999999/', now)).toBeNull();
  });
  it('A-143 (5): /live/ (any ?lang=) -> the «Трансляції» tab', async () => {
    for (const h of ['https://inok.info/live/', 'https://inok.info/live/?lang=ru', 'https://inok.info/live?lang=en', 'https://www.inok.info/live/'])
      expect(await linkRoute(db, h, now), h).toEqual({ to: '/streams', entry: { reset: 1234 } });
  });
  it('a new link = a new mark (the list resets again even when it is open)', async () => {
    let n = 0;
    const a = await linkRoute(db, 'https://inok.info/monasteries/', () => ++n);
    const b = await linkRoute(db, 'https://inok.info/monasteries/', () => ++n);
    expect(a?.entry?.reset).not.toBe(b?.entry?.reset);
  });
  it('unchanged: a card, an article, a quick action carry no reset; another page -> null (the browser)', async () => {
    expect(await linkRoute(db, 'https://inok.info/monasteries/242/?lang=ru', now)).toEqual({ to: '/monasteries/242' });
    expect(await linkRoute(db, 'https://inok.info/articles/news/1833/', now)).toEqual({ to: '/articles?id=1833' });
    expect(await linkRoute(db, 'inokapp://tab/map', now)).toEqual({ to: '/map' });
    expect(await linkRoute(db, 'https://inok.info/monasteries/table/', now)).toBeNull();
    expect(await linkRoute(db, 'https://inok.info/live/12/', now)).toBeNull();
  });
});
