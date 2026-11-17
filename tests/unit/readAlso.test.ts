import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { serveFixtures } from './helpers';
import { dataSource } from '@/data/source';
import { ApiError } from '@/data/api/client';
import { _clearReadAlso, readAlso } from '@/data/repo/readAlso';

/** cloud_40 (A-130 1, contract R-54): «Читайте також» / «Дивіться також» - the kind, never itself, 3 / 4, the hour, no stored failure. */
describe('R-54: readAlso', () => {
  beforeEach(() => { serveFixtures(); _clearReadAlso(); });
  afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });
  const H = Date.UTC(2026, 10, 17, 9, 0, 0);
  const item = (id: number, kind: 'publication' | 'video' | 'news') => ({ id, kind, title: `t${id}` }) as never;

  it('the fixtures answer like the server: the opened item\'s kind, never itself, 3 (news 4)', async () => {
    const pub = await readAlso({ id: 2869, kind: 'publication' }, 'uk', H);
    expect(pub.map((a) => a.kind)).toEqual(['publication', 'publication', 'publication']);
    expect(pub.map((a) => a.id)).not.toContain(2869);
    expect((await readAlso({ id: 2871, kind: 'news' }, 'uk', H)).map((a) => a.kind)).toEqual(['news', 'news', 'news', 'news']);
    expect((await readAlso({ id: 1892, kind: 'video' }, 'uk', H)).every((a) => a.kind === 'video' && a.id !== 1892)).toBe(true);
  });

  it('asked ONCE within the UTC hour (the site\'s set is the same for the hour), again after it; per language', async () => {
    const spy = vi.spyOn(dataSource(), 'related').mockResolvedValue({ items: [item(2, 'publication'), item(3, 'publication')] });
    await readAlso({ id: 1, kind: 'publication' }, 'uk', H + 5 * 60_000);
    await readAlso({ id: 1, kind: 'publication' }, 'uk', H + 59 * 60_000);
    expect(spy).toHaveBeenCalledTimes(1);
    await readAlso({ id: 1, kind: 'publication' }, 'ru', H + 59 * 60_000);
    expect(spy).toHaveBeenCalledTimes(2);
    await readAlso({ id: 1, kind: 'publication' }, 'uk', H + 60 * 60_000); // the next hour = another set
    expect(spy).toHaveBeenCalledTimes(3);
  });

  it('a failure is not kept (the next opening asks again); the answer is trimmed to the contract (itself, another kind, more than 3)', async () => {
    const spy = vi.spyOn(dataSource(), 'related').mockRejectedValueOnce(new ApiError(503, 'busy'))
      .mockResolvedValueOnce({ items: [item(1, 'publication'), item(5, 'news'), item(2, 'publication'), item(3, 'publication'), item(4, 'publication')] });
    await expect(readAlso({ id: 1, kind: 'publication' }, 'uk', H)).rejects.toThrow();
    expect((await readAlso({ id: 1, kind: 'publication' }, 'uk', H)).map((a) => a.id)).toEqual([2, 3, 4]);
    expect(spy).toHaveBeenCalledTimes(2);
  });

  it('the component: asked after the item is shown, absent offline / on error / empty / without the flag; the stars before it, comments after', () => {
    const view = readFileSync('src/components/ArticleView.tsx', 'utf8');
    const iRate = view.indexOf('data-testid="rating"'); const iAlso = view.indexOf('<ReadAlso a={a} />'); const iComm = view.indexOf('<CommentsBlock');
    expect(iRate).toBeGreaterThan(0); expect(iAlso).toBeGreaterThan(iRate); expect(iComm).toBeGreaterThan(iAlso);
    expect(view.indexOf("{a.kind === 'news' && <ReadAlso a={a} />}")).toBeGreaterThan(view.indexOf('<ShareFooter'));
    const c = readFileSync('src/components/ReadAlso.tsx', 'utf8');
    expect(c).toMatch(/articles_related === true/);
    expect(c).toMatch(/if \(!\(await online\(\)\)\) return;/);
    expect(c).toMatch(/if \(!items\.length\) return null;/);
    expect(c).toMatch(/<ArticleRow /); // a news item's rows = THE list row (A-15)
  });
});
