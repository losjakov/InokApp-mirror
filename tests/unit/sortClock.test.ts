import { readFileSync } from 'node:fs';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// A-172 (cloud_46): 3 hours away from the app = the default order; less = nothing; a cold start = the default anyway
const store = new Map<string, string>();
vi.mock('@capacitor/preferences', () => ({ Preferences: {
  get: async ({ key }: { key: string }) => ({ value: store.get(key) ?? null }),
  set: async ({ key, value }: { key: string; value: string }) => void store.set(key, value),
  remove: async ({ key }: { key: string }) => void store.delete(key) } }));
beforeEach(() => { store.clear(); vi.resetModules(); });
const H = 3_600_000;

describe('sort clock (A-172)', () => {
  it('2 h 59 min away keeps the order; 3 h resets it (every subscriber told once)', async () => {
    const { SORT_RESET_MS, cameForeground, onSortExpired, wentBackground } = await import('@/state/sortClock');
    expect(SORT_RESET_MS).toBe(3 * H);
    const reset = vi.fn(); onSortExpired(reset);
    wentBackground(0); expect(await cameForeground(3 * H - 60_000)).toBe(false); expect(reset).not.toHaveBeenCalled();
    wentBackground(10 * H); expect(await cameForeground(13 * H)).toBe(true); expect(reset).toHaveBeenCalledTimes(1);
    expect(await cameForeground(20 * H), 'used once').toBe(false);
  });
  it('the moment is kept in Preferences too (memory lost, the WebView reloaded): still measured', async () => {
    let m = await import('@/state/sortClock');
    m.wentBackground(1 * H);
    await new Promise((r) => setTimeout(r, 0));
    expect(store.get('sort_bg_at')).toBe(String(1 * H));
    vi.resetModules(); m = await import('@/state/sortClock');
    const reset = vi.fn(); m.onSortExpired(reset);
    expect(await m.cameForeground(5 * H)).toBe(true);
    expect(reset).toHaveBeenCalledTimes(1);
  });
  it('a cold start = the default order (the kept order lives in the process only, A-97); the search text is not part of the reset', () => {
    const src = readFileSync('src/pages/Articles.tsx', 'utf8');
    expect(src).toMatch(/let sessionSort: ArticleSort = 'published';/);
    expect(src).toMatch(/onSortExpired\(\(\) => \{ sessionSort = 'published'; setSortS\('published'\); \}\)/); // no setTyped / setQ in it
  });
});
