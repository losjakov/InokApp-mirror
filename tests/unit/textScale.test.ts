import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { LARGE_TEXT, iosBodyPx, iosRootPercent, isLargeText } from '@/state/textScale';

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

/** cloud_37 (A-121): iOS - the root size follows Dynamic Type (the system body font / 17 px), 80 ... 200 %; no other engine is touched */
describe('iOS Dynamic Type', () => {
  it('body px -> root %: Large 17 = 100, xSmall 14 = 82.4, AX1 28 = 164.7, AX3 40 and AX5 53 = the 200 % ceiling, tiny = 80', () => {
    expect([17, 14, 28, 40, 53, 10, 0].map(iosRootPercent)).toEqual([100, 82.4, 164.7, 200, 200, 80, 100]);
  });
  it('an engine without -apple-system-body (Chromium: the web playing an iPhone): no body size, so the root is never set', () => {
    let probed = false;
    const doc = { defaultView: { CSS: { supports: (p: string, v: string) => p === 'font' && v === '-apple-system-body' && false } }, createElement: () => { probed = true; return {}; } };
    expect(iosBodyPx(doc as unknown as Document)).toBe(0);
    expect(probed).toBe(false);
  });
});

