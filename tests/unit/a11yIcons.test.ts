import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/** A-88 (TalkBack): an icon is either decorative (`aria-hidden`, its control carries the name) or names itself (`aria-label`) - Ionic's
 *  `ion-icon` is a `role="img"` with no name otherwise (axe `role-img-alt`; TalkBack says «image»). Every `<IonIcon …/>` in src/. */
const files = (d: string): string[] => readdirSync(d).flatMap((f) => { const p = join(d, f); return statSync(p).isDirectory() ? files(p) : p.endsWith('.tsx') ? [p] : []; });

/** each `<IonIcon … />` tag whole: up to the `/>` outside any `{…}` (an expression may hold `>`) */
const iconTags = (src: string): string[] => {
  const out: string[] = [];
  for (let i = src.indexOf('<IonIcon'); i >= 0; i = src.indexOf('<IonIcon', i + 1)) {
    let depth = 0; let j = i;
    for (; j < src.length; j++) { const c = src[j]; if (c === '{') depth++; else if (c === '}') depth--; else if (depth === 0 && c === '/' && src[j + 1] === '>') break; }
    out.push(src.slice(i, j + 2));
  }
  return out;
};

describe('A-88 icons', () => {
  it('every IonIcon is aria-hidden or named', () => {
    const bad = files('src').flatMap((f) => iconTags(readFileSync(f, 'utf8'))
      .filter((tag) => !/aria-hidden=|aria-label=/.test(tag)).map((tag) => `${f}: ${tag.replace(/\s+/g, ' ').slice(0, 90)}`));
    expect(bad).toEqual([]);
  });
});
