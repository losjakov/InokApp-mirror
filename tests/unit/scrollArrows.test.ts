import { describe, expect, it } from 'vitest';
import {
  ARROWS_HIDE_VIEWPORTS, ARROWS_IDLE_MS, ARROWS_JUMP_LEAVE_VIEWPORTS, ARROWS_MIN_PAGE_VIEWPORTS, ARROWS_SHOW_VIEWPORTS, ARROWS_SMOOTH_MAX_VIEWPORTS,
  NO_ARROWS, arrowTarget, arrowsShown, scrollPlan, type ArrowsInput,
} from '@/state/scrollArrows';

const VH = 800;
const NOW = 100_000;
/** a 10-viewport page, scrolled to `vp` viewports, just moved `direction` */
const at = (vp: number, o: Partial<ArrowsInput> = {}): ArrowsInput => ({
  scrollTop: vp * VH, scrollHeight: 10 * VH, clientHeight: VH, direction: 'down', lastScrollAt: NOW, now: NOW, prev: NO_ARROWS, ...o,
});
const lastVp = 9; // the scroll range of a 10-viewport page ends at 9 viewports

describe('A-85 (2): the smart arrows - when they show', () => {
  it('the thresholds as the spec names them', () => {
    expect([ARROWS_MIN_PAGE_VIEWPORTS, ARROWS_SHOW_VIEWPORTS, ARROWS_HIDE_VIEWPORTS, ARROWS_IDLE_MS]).toEqual([3, 1.5, 1, 2500]);
  });
  it('a short page (< 3 viewports): never, whatever the move', () => {
    const short = { scrollHeight: 2.9 * VH };
    expect(arrowsShown(at(1.6, { ...short, direction: 'up', prev: { up: true, down: true } }))).toEqual(NO_ARROWS);
    expect(arrowsShown(at(0.2, { ...short, direction: 'down' }))).toEqual(NO_ARROWS);
    expect(arrowsShown(at(1, { scrollHeight: 3 * VH, scrollTop: 0.2 * VH, direction: 'down' })).down, '3 viewports = long enough').toBe(true);
  });
  it('«up»: after a scroll UP past 1.5 viewports from the top; not on a scroll down; not near the top', () => {
    expect(arrowsShown(at(3, { direction: 'up' })).up).toBe(true);
    expect(arrowsShown(at(3, { direction: 'down' })).up, 'no intent').toBe(false);
    expect(arrowsShown(at(1.4, { direction: 'up' })).up, 'not past 1.5 yet').toBe(false);
    expect(arrowsShown(at(1.2, { direction: 'up', prev: { up: true, down: false } })).up, 'shown stays until 1 viewport').toBe(true);
    expect(arrowsShown(at(0.9, { direction: 'up', prev: { up: true, down: false } })).up, 'within 1 viewport of the top').toBe(false);
  });
  it('«down»: on a scroll DOWN with more than 1.5 viewports left; not in the last viewport', () => {
    expect(arrowsShown(at(2, { direction: 'down' })).down).toBe(true);
    expect(arrowsShown(at(2, { direction: 'up' })).down, 'no intent').toBe(false);
    expect(arrowsShown(at(lastVp - 1.4, { direction: 'down' })).down, 'only 1.4 left').toBe(false);
    expect(arrowsShown(at(lastVp - 1.2, { prev: { up: false, down: true } })).down, 'shown stays until 1 viewport').toBe(true);
    expect(arrowsShown(at(lastVp - 0.9, { prev: { up: true, down: true } })), 'the end zone: stars and «Додати коментар» free').toEqual(NO_ARROWS);
    expect(arrowsShown(at(lastVp, { direction: 'up', prev: { up: true, down: false } })), 'the very end: nothing').toEqual(NO_ARROWS);
  });
  it('both together only when both hold: «up» shown, then a scroll down keeps it and brings «down»', () => {
    expect(arrowsShown(at(4, { direction: 'down', prev: { up: true, down: false } }))).toEqual({ up: true, down: true });
    expect(arrowsShown(at(4, { direction: 'down' }))).toEqual({ up: false, down: true });
  });
  it('they fade after 2.5 s without scrolling', () => {
    const shown = { up: true, down: true };
    expect(arrowsShown(at(4, { prev: shown, now: NOW + ARROWS_IDLE_MS - 1 }))).toEqual(shown);
    expect(arrowsShown(at(4, { prev: shown, now: NOW + ARROWS_IDLE_MS }))).toEqual(NO_ARROWS);
  });
  it('a tap keeps them until its scroll ends (even past the idle time, even at the top)', () => {
    const shown = { up: true, down: false };
    expect(arrowsShown(at(0.3, { prev: shown, held: true, now: NOW + 10 * ARROWS_IDLE_MS }))).toEqual(shown);
  });
  it('a sheet, a dialog, the keyboard or the photo viewer: none', () => {
    expect(arrowsShown(at(4, { direction: 'up', prev: { up: true, down: true }, blocked: true }))).toEqual(NO_ARROWS);
  });
});

describe('A-85 (2): the arrows - how a tap scrolls', () => {
  it('targets: the very top and the very end', () => {
    expect(arrowTarget('up', 10 * VH, VH)).toBe(0);
    expect(arrowTarget('down', 10 * VH, VH)).toBe(9 * VH);
  });
  it('reduced motion: one instant move, no animation', () => {
    expect(scrollPlan(8 * VH, 0, VH, true)).toEqual({ jump: 0, smooth: false });
    expect(scrollPlan(2 * VH, 0, VH, true)).toEqual({ jump: 0, smooth: false });
  });
  it('up to 3 viewports: smooth all the way', () => {
    expect(ARROWS_SMOOTH_MAX_VIEWPORTS).toBe(3);
    expect(scrollPlan(3 * VH, 0, VH, false)).toEqual({ jump: null, smooth: true });
    expect(scrollPlan(6 * VH, 9 * VH, VH, false)).toEqual({ jump: null, smooth: true });
  });
  it('longer: an instant jump to 1 viewport from the target, then a smooth finish (no 10-second glide)', () => {
    expect(ARROWS_JUMP_LEAVE_VIEWPORTS).toBe(1);
    expect(scrollPlan(8 * VH, 0, VH, false)).toEqual({ jump: VH, smooth: true });
    expect(scrollPlan(1 * VH, 9 * VH, VH, false)).toEqual({ jump: 8 * VH, smooth: true });
  });
});
