import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { ICON_PX, MARK_MIN, PIN_H_MAX, scopePadding } from '@/data/map/inokMap';

/** D35 / D50: ONE fit rule for the main map and every mini-map */
describe('scopePadding', () => {
  it('the main map: the D35 padding (scope chip + zoom buttons + the pins clearance) on a phone view', () => {
    expect(scopePadding({ top: 56, right: 6, bottom: 4, left: 2 }, 360, 600)).toEqual({ top: 128, right: 60, bottom: 48, left: 56 }); // bottom: a cluster's circle + 8 (D53)
  });
  it('a phone mini-map (328 × 164, its label below): the full clearance sideways, the pins height above, the label kept whole', () => {
    const p = scopePadding({ top: 0, right: 0, bottom: 44, left: 0 }, 328, 164);
    expect(p.left).toBe(ICON_PX * 1.5);
    expect(p.right).toBe(ICON_PX * 1.5);
    expect(p.top).toBeGreaterThanOrEqual(ICON_PX + 8); // D53: the pin's DRAWN height + air above its point, never less
    expect(p.bottom).toBeGreaterThanOrEqual(44 + MARK_MIN.bottom); // the label whole + a cluster's circle under its point
  });
  it('D53: however small the view, the padding never drops below the drawn mark (pin height / cluster circle) + 8', () => {
    for (const [w, h] of [[328, 164], [200, 120], [120, 80]]) {
      const p = scopePadding({ top: 0, right: 0, bottom: 44, left: 0 }, w, h);
      expect(p.top).toBeGreaterThanOrEqual(MARK_MIN.top);
      expect(p.left).toBeGreaterThanOrEqual(MARK_MIN.left);
      expect(p.right).toBeGreaterThanOrEqual(MARK_MIN.right);
      expect(p.bottom - 44).toBeGreaterThanOrEqual(MARK_MIN.bottom);
    }
    expect(MARK_MIN.top).toBeGreaterThanOrEqual(PIN_H_MAX + 8);
  });
  it('D53: PIN_H_MAX is the tallest pin of the set (each drawn ICON_PX wide)', () => {
    const dir = new URL('../../src/assets/mapicons/', import.meta.url);
    const hs = readdirSync(dir).map((f) => { const v = readFileSync(new URL(f, dir), 'utf8').match(/viewBox="0 0 ([\d.]+) ([\d.]+)"/)!; return (ICON_PX * Number(v[2])) / Number(v[1]); });
    expect(Math.max(...hs)).toBe(PIN_H_MAX);
  });
});
