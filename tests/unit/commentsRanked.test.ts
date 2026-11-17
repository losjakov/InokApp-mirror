import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { freshDb, serveFixtures } from './helpers';
import { dataSource } from '@/data/source';
import { loadComments, mergeComments, moreComments } from '@/data/repo/comments';
import { cacheSet } from '@/data/repo/cache';
import type { Db } from '@/data/db/types';
const ranked = (db: Db, on = true) => cacheSet(db, 'config', { features: { comments_ranked: on } });
import type { Comments } from '@/data/api/types';

/** cloud_40 (A-130 3, contract R-55): comments by likes minus dislikes, a tie = the newer first (then the higher id); 5 + «Показати більше». */
describe('R-55: comments by score, five a page', () => {
  beforeEach(() => serveFixtures());
  afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });
  const ids = (c: Comments | null) => c?.items.map((x) => x.id);

  it('the 7 made-up comments of 2868 (equal sums): order, two pages, the end, the replies under their comment', async () => {
    const { db } = await freshDb();
    await ranked(db);
    const r = await loadComments(db, 2868);
    // E 5 | F 2 (11-03, id 9106) B 2 (11-03, id 9102) A 2 (11-01) | D 0 (11-05) C 0 (11-02) | G -1
    expect(ids(r.comments)).toEqual([9105, 9106, 9102, 9101, 9104]);
    expect(r.comments!.next).toBe('5');
    expect(r.comments!.items[0].replies?.map((x) => x.id)).toEqual([9108]);
    const all = await moreComments(db, 2868, r.comments!);
    expect(ids(all)).toEqual([9105, 9106, 9102, 9101, 9104, 9103, 9107]);
    expect(all.next).toBeNull(); // the end: no button
    expect(all.total).toBe(8);
  });

  it('without the flag = the 1.0.13 list (newest first, no paging)', async () => {
    const { db } = await freshDb();
    await ranked(db, false);
    const r = await loadComments(db, 2868);
    expect(ids(r.comments)).toEqual([9107, 9104, 9105, 9106, 9102, 9103, 9101]);
    expect(r.comments!.next).toBeUndefined();
  });

  it('the query: sort=score&limit=5 and the cursor; without the flag byte for byte the old one', () => {
    const src = readFileSync('src/data/source.ts', 'utf8');
    expect(src).toMatch(/`&sort=score&limit=\$\{COMMENTS_PAGE\}\$\{since \? `&since=\$\{encodeURIComponent\(since\)\}` : ''\}`/);
    expect(src).toMatch(/comments\?install_id=\$\{encodeURIComponent\(install\)\}\$\{ranked \? rankedQuery\(ranked\.since\) : ''\}/);
  });

  it('a page that repeats a shown comment (votes moved between pages) adds only new ones - the shown list never jumps', () => {
    const c = (id: number) => ({ id, author: 'x', text: 't', at: '2026-11-01T00:00:00Z', votes: { likes: 0, dislikes: 0, mine: 0 as const }, replies: [] });
    const shown: Comments = { items: [c(1), c(2), c(3)], total: 6, next: '3' };
    expect(ids(mergeComments(shown, { items: [c(3), c(4), c(5)], total: 6, next: null }))).toEqual([1, 2, 3, 4, 5]);
    // the screen never re-sorts: the order is the server's pages (a vote changes only its own counts)
    expect(readFileSync('src/components/CommentsBlock.tsx', 'utf8')).not.toMatch(/\.sort\(/);
  });

  it('offline: «Показати більше» throws (the block says why + «Повторити»); a first read with nothing kept carries the failure', async () => {
    const { db } = await freshDb();
    await ranked(db);
    const r = await loadComments(db, 2868);
    vi.spyOn(dataSource(), 'comments').mockRejectedValue(new TypeError('Failed to fetch'));
    await expect(moreComments(db, 2868, r.comments!)).rejects.toThrow();
    const kept = await loadComments(db, 2868); // offline: the kept first page
    expect(ids(kept.comments)).toEqual([9105, 9106, 9102, 9101, 9104]);
    expect(kept.failure).toBeUndefined();
    const none = await loadComments(db, 2869); // never read: nothing kept
    expect(none.comments).toBeNull();
    expect(none.failure).toBeInstanceOf(TypeError);
  });
});
