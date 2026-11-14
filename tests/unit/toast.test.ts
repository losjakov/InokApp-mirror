import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { toastAnchor } from '@/components/toast';

const doc = (bar: { offsetParent: unknown } | null) => ({ querySelector: () => bar }) as unknown as Document;

describe('D73: every result message sits above the tab bar', () => {
  it('anchors to a visible tab bar', () => {
    const bar = { offsetParent: {} };
    expect(toastAnchor(doc(bar))).toBe(bar);
  });
  it('no tab bar, or a hidden one: no anchor (the bottom edge, as before)', () => {
    expect(toastAnchor(doc(null))).toBeUndefined();
    expect(toastAnchor(doc({ offsetParent: null }))).toBeUndefined();
  });
  it('ONE helper (A-15): no component presents a toast of its own', () => {
    const walk = (d: string): string[] => readdirSync(d).flatMap((f) => (statSync(join(d, f)).isDirectory() ? walk(join(d, f)) : [join(d, f)]));
    const own = walk('src').filter((f) => /\.tsx?$/.test(f) && !f.endsWith('components/toast.ts'))
      .filter((f) => /useIonToast|IonToast\b|toastController/.test(readFileSync(f, 'utf8')));
    expect(own).toEqual([]);
  });
});
