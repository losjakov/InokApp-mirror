import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { LARGE_TEXT, isLargeText } from '@/state/textScale';

/** A-56: hyphenation ONLY at a large system text scale (>= 130 %: Android 8's largest step); the normal scale wraps between words as before (A-55). */
describe('text scale (A-56)', () => {
  it('large from 130 %: Android 8 «Huge» 1.3, Android 14 1.5 / 1.8 / 2.0; normal below', () => {
    expect(LARGE_TEXT).toBe(1.3);
    for (const s of [1.3, 1.5, 1.8, 2]) expect(isLargeText(s), String(s)).toBe(true);
    for (const s of [0.85, 1, 1.15, 1.25]) expect(isLargeText(s), String(s)).toBe(false);
  });
  it('the CSS asks for hyphens ONLY under data-text-large="1" (rows + the article text), never unconditionally', () => {
    const css = readFileSync(new URL('../../src/theme/app.css', import.meta.url), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
    const rules = css.split('}').filter((r) => /hyphens:\s*auto/.test(r));
    expect(rules.length).toBe(1);
    const sel = rules[0].split('{')[0].split(',').map((x) => x.replace(/\/\*[\s\S]*?\*\//g, '').trim());
    expect(sel.every((x) => x.startsWith('[data-text-large="1"]')), sel.join(' | ')).toBe(true);
    expect(sel.some((x) => x.endsWith('.mrow ion-label')) && sel.some((x) => x.endsWith('.aview__body'))).toBe(true);
  });
});
