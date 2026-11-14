import { describe, expect, it } from 'vitest';
import { ESLint } from 'eslint';
import pkg from '../../package.json';
import { ENGINE_FLOOR, chromeFloor, chromeMajor } from '@/app/engineFloor';
import { uuidV4 } from '@/data/repo/cast';

describe('A-46: uuidV4 without crypto.randomUUID (Chrome 92)', () => {
  it('is a v4 uuid (version and variant bits), from the random bytes given', () => {
    const id = uuidV4((a) => a.fill(0xff));
    expect(id).toBe('ffffffff-ffff-4fff-bfff-ffffffffffff');
    expect(uuidV4()).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  });
});

describe('A-46 / A-47: the ONE engine floor', () => {
  it('is written once in package.json browserslist and is not above Chrome 98 (the reference phone)', () => {
    expect(pkg.browserslist).toEqual([`chrome >= ${ENGINE_FLOOR}`]);
    expect(ENGINE_FLOOR).toBeLessThanOrEqual(98);
    expect(ENGINE_FLOOR).toBeGreaterThanOrEqual(89); // Ionic 9: Chromium 89+ (its BREAKING.md) - lower is not supported by the stack
    expect(() => chromeFloor(['defaults'])).toThrow();
  });
  it('reads the engine major from a WebView / Chrome user agent', () => {
    expect(chromeMajor('Mozilla/5.0 (Linux; Android 8.0.0; G3412 Build/48.1.A.2.122; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/98.0.4758.87 Mobile Safari/537.36')).toBe(98);
    expect(chromeMajor('Mozilla/5.0 (iPhone) AppleWebKit/605.1.15 Version/16.0 Mobile/15E148 Safari/604.1')).toBeNull();
  });
  it('the build-time check fails on APIs newer than the floor (eslint-plugin-compat + the explicit list)', async () => {
    const eslint = new ESLint({ cwd: process.cwd() });
    const probe = [
      'export const a = AbortSignal.timeout(1000);',
      'export const b = structuredClone({});',
      'export const c = [1, 2].toSorted();',
      'export const d = Object.groupBy([1], (x) => x);',
      'export const e = Promise.withResolvers();',
      'export const f = crypto.randomUUID();',
      "export const g = new Intl.DateTimeFormat('en', { timeZone: 'Europe/Kyiv' });", // A-48: tzdata 2022b - RangeError on Chrome 98
      "export const ok2 = new Intl.DateTimeFormat('en', { timeZone: 'Europe/Kiev' });",
      'export const ok = [1, 2].at(-1) ?? Object.hasOwn({}, "x");', // polyfilled (src/app/polyfills.ts)
    ].join('\n');
    const [r] = await eslint.lintText(probe, { filePath: 'src/app/probe.ts' });
    const lines = new Set(r.messages.filter((m) => m.severity === 2).map((m) => m.line));
    expect([...lines].sort()).toEqual([1, 2, 3, 4, 5, 6, 7]);
  }, 60000);
});
