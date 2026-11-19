import { describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { articleItems, hintDue, HINT_GAP_MS, monasteryItems, LONG_MS } from '@/state/quickSheet';
import type { Place } from '@/data/repo/reading';

const place = (o: Partial<Place>): Place => ({ id: 1, kind: 'publication', snap: { id: 1 } as Place['snap'], anchor: 0, frac: 0, pct: 42, started: true, finished: false, dismissed: false, opened_at: 0, ...o });

describe('A-142 the sheets\' items (the owner\'s lists; no «Відкрити на сайті»)', () => {
  it('monastery: page, fav, visited, route + map only with a place, call only with a number, stream only with a channel, share', () => {
    expect(monasteryItems({ hasGeo: true, dial: '+380', hasChannel: true })).toEqual(['page', 'fav', 'visited', 'route', 'map', 'call', 'stream', 'share']);
    expect(monasteryItems({ hasGeo: false, dial: null, hasChannel: false })).toEqual(['page', 'fav', 'visited', 'share']);
  });
  it('article: started -> continue + restart; else open; a video has no «прочитане»; never a site item', () => {
    expect(articleItems('publication', place({}))).toEqual(['continue', 'restart', 'fav', 'read', 'share']);
    expect(articleItems('publication', undefined)).toEqual(['open', 'fav', 'read', 'share']);
    expect(articleItems('publication', place({ finished: true }))).toEqual(['open', 'fav', 'read', 'share']);
    expect(articleItems('video', place({}))).toEqual(['open', 'fav', 'share']);
    const src = readFileSync('src/components/QuickSheet.tsx', 'utf8');
    expect(src).not.toMatch(/open_site|openOnSite|card\.open_site/);
  });
});

describe('A-142 (4) the hint: <= 3 times, >= 7 days apart, until the first use, per kind', () => {
  it('the rule', () => {
    expect(hintDue({ shown: 0, last: 0, used: false }, 1000)).toBe(true);
    expect(hintDue({ shown: 1, last: 1000, used: false }, 1000 + HINT_GAP_MS - 1)).toBe(false);
    expect(hintDue({ shown: 1, last: 1000, used: false }, 1000 + HINT_GAP_MS)).toBe(true);
    expect(hintDue({ shown: 3, last: 0, used: false }, 10 * HINT_GAP_MS)).toBe(false);
    expect(hintDue({ shown: 1, last: 0, used: true }, 10 * HINT_GAP_MS)).toBe(false);
  });
  it('the store / ring scripts retire it (no hint in a frame); the settings keep the kinds', () => {
    for (const f of ['scripts/emu_store.sh', 'scripts/ios_sim_tour.sh']) expect(readFileSync(f, 'utf8')).toMatch(/'hint_monastery', 'hint_article'/);
    expect(readFileSync('src/state/settings.ts', 'utf8')).toMatch(/ASK_KINDS: AskKind\[\] = \['articles', 'streams', 'hint_monastery', 'hint_article'\]/);
  });
});

describe('P4 the long press (fake timers): a scroll never opens it, a tap passes, a hold opens it and swallows ONE click', () => {
  // the hook's logic driven by hand (the same timers and thresholds, React-free): useLongPress's handlers are plain functions of a ref
  it('timing constants: Android\'s ~0.5 s', () => { expect(LONG_MS).toBe(500); });
  it('behaviour', async () => {
    vi.useFakeTimers();
    const g = globalThis as unknown as { window: unknown };
    const listeners: Record<string, (() => void)[]> = {};
    g.window = { setTimeout, clearTimeout, addEventListener: (k: string, f: () => void) => { (listeners[k] ??= []).push(f); }, removeEventListener: (k: string, f: () => void) => { listeners[k] = (listeners[k] ?? []).filter((x) => x !== f); } };
    vi.doMock('react', () => ({ useRef: (v: unknown) => ({ current: v }), useEffect: () => {}, useCallback: (f: unknown) => f }));
    vi.resetModules();
    const { useLongPress } = await import('@/state/quickSheet');
    let n = 0;
    const h = useLongPress(() => { n++; });
    const ev = (x = 0, y = 0) => ({ button: 0, clientX: x, clientY: y }) as unknown as React.PointerEvent;
    const click = () => { const e = { prevented: false, preventDefault() { this.prevented = true; }, stopPropagation() {} }; h.onClickCapture(e as unknown as React.MouseEvent); return e.prevented; };
    // a short tap: no sheet, the click passes
    h.onPointerDown(ev()); vi.advanceTimersByTime(200); h.onPointerUp();
    expect(n).toBe(0); expect(click()).toBe(false);
    // a scroll (finger moved 30 px) inside the 0.5 s: nothing
    h.onPointerDown(ev()); h.onPointerMove(ev(0, 30)); vi.advanceTimersByTime(800);
    expect(n).toBe(0);
    // the list scrolled under a still finger: nothing
    h.onPointerDown(ev()); listeners.scroll?.forEach((f) => f()); vi.advanceTimersByTime(800);
    expect(n).toBe(0);
    // a hold: the sheet, the following click swallowed once, the next passes
    h.onPointerDown(ev()); h.onPointerMove(ev(3, 4)); vi.advanceTimersByTime(LONG_MS);
    expect(n).toBe(1);
    h.onPointerUp();
    expect(click()).toBe(true);
    expect(click()).toBe(false);
    vi.useRealTimers(); vi.doUnmock('react');
  });
});
