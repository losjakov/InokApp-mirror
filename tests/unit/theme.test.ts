import { describe, expect, it } from 'vitest';
import { isDark } from '@/state/theme';
import { DEFAULTS, THEMES } from '@/state/settings';

/** A-16: «Ще → Тема». */
describe('theme', () => {
  it('system follows the system; light / dark override it; default = system', () => {
    expect(DEFAULTS.theme).toBe('system');
    expect(THEMES).toEqual(['system', 'light', 'dark']);
    expect([isDark('system', true), isDark('system', false)]).toEqual([true, false]);
    expect([isDark('light', true), isDark('light', false)]).toEqual([false, false]);
    expect([isDark('dark', true), isDark('dark', false)]).toEqual([true, true]);
  });
});
