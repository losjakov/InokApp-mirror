import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { checkedLabel, dueOnReturn, lastCheck, REFRESH_MESSAGE, RETURN_STALE_MS, runRefresh, type RefreshParts } from '@/data/refresh';
import { ApiError, SERVER_BUSY } from '@/data/api/client';
import { makeT } from '@/i18n';
import { freshDb } from './helpers';

afterEach(() => vi.unstubAllGlobals());

const parts = (over: Partial<RefreshParts> = {}) => {
  const calls = { live: 0, articles: 0, directory: 0 };
  const p: RefreshParts = {
    live: async () => { calls.live++; },
    articles: async () => { calls.articles++; return false; },
    directory: async () => { calls.directory++; return 'up_to_date'; },
    ...over,
  };
  return { p, calls };
};
const src = (f: string) => readFileSync(new URL(`../../src/${f}`, import.meta.url), 'utf8');

/** A-51 + A-52: ONE full refresh (live + newest articles + directory check) for the return, the start and the four manual entries. */
describe('one refresh', () => {
  it('the return refresh is due at 15 minutes since the last success, not before; never checked = due', () => {
    expect(RETURN_STALE_MS).toBe(15 * 60_000);
    const last = Date.UTC(2026, 10, 6, 10, 0);
    expect(dueOnReturn(null, last)).toBe(true);
    expect(dueOnReturn(last, last + RETURN_STALE_MS - 1000)).toBe(false);
    expect(dueOnReturn(last, last + RETURN_STALE_MS)).toBe(true);
  });
  it('offline: no request at all, no «checked» time', async () => {
    vi.stubGlobal('navigator', { onLine: false, userAgent: '' });
    const fetchSpy = vi.fn(); vi.stubGlobal('fetch', fetchSpy);
    const { db } = await freshDb();
    const { p, calls } = parts();
    expect(await runRefresh(db, p)).toBe('offline');
    expect(calls).toEqual({ live: 0, articles: 0, directory: 0 });
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(await lastCheck(db)).toBeNull();
  });
  it('asks all three sources once; a second caller during the run gets the SAME run (no double requests)', async () => {
    const { db } = await freshDb();
    let release!: () => void;
    const gate = new Promise<void>((r) => { release = r; });
    const { p, calls } = parts({ live: async () => { calls.live++; await gate; } });
    const a = runRefresh(db, p, () => 1_000);
    const b = runRefresh(db, p, () => 2_000); // e.g. the pull-down while the return refresh runs
    release();
    expect(await a).toBe('up_to_date');
    expect(await b).toBe('up_to_date');
    expect(calls).toEqual({ live: 1, articles: 1, directory: 1 });
    expect(await lastCheck(db)).toBe(1_000);
  });
  it('the result: updated (directory or articles changed), busy (D72), error; the time is kept only after a success', async () => {
    const { db } = await freshDb();
    expect(await runRefresh(db, parts({ directory: async () => 'updated' }).p, () => 5)).toBe('updated');
    expect(await runRefresh(db, parts({ articles: async () => true }).p, () => 6)).toBe('updated');
    expect(await lastCheck(db)).toBe(6);
    expect(await runRefresh(db, parts({ live: async () => { throw new ApiError(200, SERVER_BUSY); } }).p, () => 7)).toBe('busy');
    expect(await runRefresh(db, parts({ articles: async () => { throw new TypeError('Failed to fetch'); } }).p, () => 8)).toBe('error');
    expect(await runRefresh(db, parts({ directory: async () => 'update_app' }).p, () => 9)).toBe('update_app');
    expect(await lastCheck(db)).toBe(6);
    for (const k of Object.values(REFRESH_MESSAGE)) expect(makeT('uk')(k)).not.toBe(k); // every result has its uk words
  });
  it('the four manual entries and the return call the ONE function (source: no screen syncs or fetches on its own)', () => {
    const home = src('pages/Home.tsx'); const more = src('pages/More.tsx'); const ctx = src('state/AppContext.tsx');
    expect(home).toMatch(/const runRefresh = useDataRefresh\(\)/);
    expect(home).toMatch(/useRefresh\(runRefresh, refreshing\)/); // the header button + the pull-down
    expect(home).toMatch(/data-testid="home-fresh"/); expect(home).toMatch(/onClick=\{\(\) => void runRefresh\(\)\}/); // the bottom line
    expect(more).toMatch(/const doRefresh = useDataRefresh\(\)/);
    expect(src('components/Refresh.tsx')).toMatch(/await refreshAll\(\)/);
    for (const s of [home, more]) expect(s).not.toMatch(/syncDirectory|\bsync\(\)|refreshArticles\(\)|refreshLive\(\)/);
    expect(ctx).toMatch(/dueOnReturn\(last, Date\.now\(\)\)\) void refreshRef\.current\(\)/); // the return = refreshAll
    expect(ctx).toMatch(/runRefresh\(db, \{/);
  });
  it('«Перевірено сьогодні о HH:MM» / «вчора о» / a date', () => {
    const t = makeT('uk');
    const now = new Date(2026, 10, 6, 12, 30).getTime();
    expect(checkedLabel(t, 'uk', new Date(2026, 10, 6, 12, 5).getTime(), now)).toBe('Перевірено сьогодні о 12:05');
    expect(checkedLabel(t, 'uk', new Date(2026, 10, 5, 21, 40).getTime(), now)).toBe('Перевірено вчора о 21:40');
    expect(checkedLabel(t, 'uk', new Date(2026, 10, 3, 9, 12).getTime(), now)).toMatch(/^Перевірено 3 листопада 2026.* о 09:12$/);
    expect(checkedLabel(makeT('ru'), 'ru', new Date(2026, 10, 6, 8, 0).getTime(), now)).toBe('Проверено сегодня в 08:00');
  });
});
