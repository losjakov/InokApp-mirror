import { describe, expect, it } from 'vitest';
import { crashOf, whereOf } from '@/app/crash';

// A-48 (a): the code + line a tester photographs must tell the source, the error and the place apart
describe('crashOf', () => {
  it('render / error / promise prefixes, the error name, a 4-hex tag', () => {
    expect(crashOf(new TypeError('x is not a function'), 'render').code).toMatch(/^R-TypeError-[0-9a-f]{4}$/);
    expect(crashOf(new RangeError('bad'), 'error').code).toMatch(/^E-RangeError-[0-9a-f]{4}$/);
    expect(crashOf('just a string', 'promise').code).toMatch(/^P-Value-[0-9a-f]{4}$/);
    expect(crashOf(undefined, 'promise').code).toMatch(/^P-Empty-/);
    expect(crashOf({ status: 500 }, 'promise').line).toBe('{"status":500}');
  });
  it('the first line only, at most 160 chars; two different messages get different tags', () => {
    const c = crashOf(new Error(`first line ${'x'.repeat(300)}\nsecond`), 'error');
    expect(c.line.startsWith('first line')).toBe(true);
    expect(c.line.length).toBe(160);
    expect(crashOf(new Error('a'), 'error').code).not.toBe(crashOf(new Error('b'), 'error').code);
  });
});

describe('whereOf', () => {
  it('Chrome stack -> the chunk basename:line:col', () => {
    expect(whereOf('TypeError: x\n    at Ab (https://localhost/assets/index-pA33e6JP.js:40:1234)\n    at y (…)')).toBe('index-pA33e6JP.js:40:1234');
    expect(whereOf('TypeError: x\n    at https://localhost/assets/index-pA33e6JP.js:1:99')).toBe('index-pA33e6JP.js:1:99');
    expect(whereOf(undefined)).toBe('');
  });
});
