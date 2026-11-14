import { afterEach, describe, expect, it, vi } from 'vitest';
import { timeoutSignal } from '@/data/api/timeout';
import { installPolyfills } from '@/app/polyfills';

describe('A-46: timeoutSignal - the one request timeout (no AbortSignal.timeout, Chrome 103+)', () => {
  afterEach(() => vi.useRealTimers());
  it('aborts after the given time, not before', () => {
    vi.useFakeTimers();
    const s = timeoutSignal(30000);
    vi.advanceTimersByTime(29999);
    expect(s.aborted).toBe(false);
    vi.advanceTimersByTime(1);
    expect(s.aborted).toBe(true);
  });
  it('works where AbortSignal.timeout does not exist (Chrome 98)', () => {
    vi.useFakeTimers();
    const orig = AbortSignal.timeout;
    // @ts-expect-error - the reference phone's engine has no AbortSignal.timeout
    delete AbortSignal.timeout;
    try {
      const s = timeoutSignal(10);
      vi.advanceTimersByTime(10);
      expect(s.aborted).toBe(true);
    } finally {
      AbortSignal.timeout = orig;
    }
  });
  it('the request client uses it, never AbortSignal.timeout', async () => {
    const fs = await import('node:fs');
    const src = fs.readFileSync('src/data/api/client.ts', 'utf8');
    expect(src).not.toMatch(/AbortSignal\.timeout/);
    expect(src).toMatch(/timeoutSignal\(TIMEOUT_MS\)/);
  });
});

describe('A-46: the floor polyfills (Array.prototype.at, Object.hasOwn - MapLibre calls them unguarded)', () => {
  it('fill an engine that lacks them, and match the native behaviour', () => {
    class A extends Array {}
    const g = { Array: function () {} as unknown, String: function () {} as unknown, Object: {} as unknown } as unknown as typeof globalThis;
    (g.Array as unknown as { prototype: object }).prototype = Object.create(null);
    (g.String as unknown as { prototype: object }).prototype = Object.create(null);
    installPolyfills(g);
    const at = (g.Array.prototype as unknown as { at: (this: unknown[], i: number) => unknown }).at;
    expect(at.call([1, 2, 3], -1)).toBe(3);
    expect(at.call([1, 2, 3], 0)).toBe(1);
    expect(at.call([1, 2, 3], 3)).toBeUndefined();
    expect(at.call([1, 2, 3], -4)).toBeUndefined();
    expect(at.call(new A(), 0)).toBeUndefined();
    const hasOwn = (g.Object as unknown as { hasOwn: (o: object, k: string) => boolean }).hasOwn;
    expect(hasOwn({ x: 1 }, 'x')).toBe(true);
    expect(hasOwn(Object.create({ x: 1 }), 'x')).toBe(false);
  });
  it('leave a native implementation untouched', () => {
    const before = Array.prototype.at;
    installPolyfills();
    expect(Array.prototype.at).toBe(before);
  });
});
