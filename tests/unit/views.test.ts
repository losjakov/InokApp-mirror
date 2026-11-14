import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { freshDb, serveFixtures } from './helpers';
import { dataSource } from '@/data/source';
import { dwellMet, loadViews, sendView, viewLine, viewsPath } from '@/data/repo/views';

describe('A-65 / R-38 page views', () => {
  beforeEach(() => { serveFixtures(); });
  afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });
  it('the contract paths and the integrity line - the app never builds the site\'s page key', () => {
    expect(viewsPath({ kind: 'article', id: 2869 })).toBe('articles/2869/views');
    expect(viewsPath({ kind: 'monastery', code: 242 })).toBe('monasteries/242/views');
    expect(viewLine({ kind: 'monastery', code: 242 }, 'i')).toEqual(['view', 'monastery', 242, 'i']);
  });
  it('the number: the server\'s (null below 40); offline = the last number kept, and no token (no view)', async () => {
    const { db } = await freshDb();
    expect(await loadViews(db, { kind: 'article', id: 2869 })).toEqual({ views: 42, token: 'fixture.dwell', gi: 10, gn: 30 });
    expect((await loadViews(db, { kind: 'article', id: 2871 })).views).toBeNull();
    vi.spyOn(dataSource(), 'views').mockRejectedValue(new TypeError('Failed to fetch'));
    expect(await loadViews(db, { kind: 'article', id: 2869 })).toEqual({ views: 42, token: null, gi: 10, gn: 30 });
    expect((await loadViews(db, { kind: 'article', id: 1 })).views).toBeNull();
  });
  it('ONE view per install, page and Kyiv day; a failed send is not counted as sent', async () => {
    const { db } = await freshDb();
    const view = vi.spyOn(dataSource(), 'view');
    const t = { kind: 'article', id: 2869 } as const;
    const day1 = new Date('2026-11-08T10:00:00Z');
    expect(await sendView(db, t, 'tok', day1)).toBe(true);
    expect(await sendView(db, t, 'tok', new Date('2026-11-08T21:30:00Z'))).toBe(false); // 23:30 Kyiv - the same day
    expect(await sendView(db, t, 'tok', new Date('2026-11-08T22:30:00Z'))).toBe(true); // 00:30 Kyiv - the next day
    expect(await sendView(db, { kind: 'monastery', code: 242 }, 'tok', day1)).toBe(true); // another page
    expect(view).toHaveBeenCalledTimes(3);
    view.mockRejectedValueOnce(new TypeError('Failed to fetch'));
    expect(await sendView(db, { kind: 'monastery', code: 1 }, 'tok', day1)).toBe(false);
    expect(await sendView(db, { kind: 'monastery', code: 1 }, 'tok', day1)).toBe(true);
  });
  it('the dwell: gi seconds with a touch, gn without (the site\'s rule)', () => {
    const d = { gi: 10, gn: 30 };
    expect(dwellMet(9_000, true, d)).toBe(false);
    expect(dwellMet(10_000, true, d)).toBe(true);
    expect(dwellMet(29_000, false, d)).toBe(false);
    expect(dwellMet(30_000, false, d)).toBe(true);
  });
});
