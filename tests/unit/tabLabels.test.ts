import { describe, expect, it } from 'vitest';
import { MIN_TAB_LABEL_PX, tabLabelScale } from '@/app/tabLabels';

// cloud_38 (REVIEW cloud_37 NOTE 3): the five tab labels share ONE size; scaled down exactly until they fit, never cut, never below 9 px
describe('tabLabelScale', () => {
  it('fits = the chrome size as it is', () => expect(tabLabelScale(400, [70, 40, 80, 75, 20], 15)).toBe(1));
  it('320 dp at 200 %: the five shrink together to the room', () => {
    const k = tabLabelScale(300, [96, 54, 112, 108, 28], 15); // «Монастирі» «Карта» «Трансляції» «Публікації» «Ще» at 15 px
    expect(k).toBeLessThan(1);
    expect([96, 54, 112, 108, 28].reduce((a, b) => a + b * k, 0)).toBeLessThanOrEqual(300);
  });
  it('never below 9 px', () => expect(tabLabelScale(50, [96, 54, 112, 108, 28], 15) * 15).toBeCloseTo(MIN_TAB_LABEL_PX));
  it('nothing measured = no change', () => expect(tabLabelScale(300, [], 15)).toBe(1));
});
