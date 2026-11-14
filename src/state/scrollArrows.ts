/**
 * A-85 (2): THE rule of the smart «up» / «down» arrows of an article and a monastery card (pure; the component: ScrollArrows).
 * NN/g «Back-to-Top» + Material's FAB: only on a long page, shown on the reader's intent (the direction he scrolls), gone while he reads.
 * Every threshold is ONE named constant, in viewports (the scroller's own height) or milliseconds.
 */

/** the page's scrollable height must reach this many viewports, else no arrow ever */
export const ARROWS_MIN_PAGE_VIEWPORTS = 3;
/** an arrow APPEARS when more than this remains on its side (above for «up», below for «down») */
export const ARROWS_SHOW_VIEWPORTS = 1.5;
/** a shown arrow is hidden within this of its own end (the title / the end); the END zone also frees the stars, the comments and the
 *  «Додати коментар» button of BOTH arrows (spec: never over a button the reader is about to press) */
export const ARROWS_HIDE_VIEWPORTS = 1;
/** both fade out after this long without scrolling (they never sit over the text he reads) */
export const ARROWS_IDLE_MS = 2500;
/** a tap's scroll is over when no scroll event came for this long */
export const ARROWS_SCROLL_END_MS = 150;
/** up to this distance (viewports) a tap scrolls smoothly; farther = an instant jump, then a smooth finish */
export const ARROWS_SMOOTH_MAX_VIEWPORTS = 3;
/** where the long jump lands: this far before the target, the rest smooth (no 10-second glide) */
export const ARROWS_JUMP_LEAVE_VIEWPORTS = 1;

export type ScrollDir = 'up' | 'down';
export interface ArrowsShown { up: boolean; down: boolean }
export const NO_ARROWS: ArrowsShown = { up: false, down: false };

export interface ArrowsInput {
  scrollTop: number;
  scrollHeight: number;
  clientHeight: number;
  /** the last move's direction (null: no move yet) */
  direction: ScrollDir | null;
  lastScrollAt: number;
  now: number;
  /** what is shown now: a shown arrow stays (stationary) until its own end zone or the idle fade */
  prev: ArrowsShown;
  /** a tap's scroll is running: the arrows stay as they are until it ends */
  held?: boolean;
  /** the keyboard, a sheet, a dialog or the photo viewer is open */
  blocked?: boolean;
}

/** Which arrows show. */
export function arrowsShown(i: ArrowsInput): ArrowsShown {
  if (i.blocked) return NO_ARROWS;
  if (i.held) return i.prev;
  const vh = i.clientHeight;
  if (vh <= 0 || i.scrollHeight < ARROWS_MIN_PAGE_VIEWPORTS * vh) return NO_ARROWS;
  if (i.now - i.lastScrollAt >= ARROWS_IDLE_MS) return NO_ARROWS;
  const above = i.scrollTop;
  const below = i.scrollHeight - vh - i.scrollTop;
  if (below <= ARROWS_HIDE_VIEWPORTS * vh) return NO_ARROWS; // the end zone: the stars, the comments, «Додати коментар» stay free
  const up = above > ARROWS_HIDE_VIEWPORTS * vh && (i.prev.up || (i.direction === 'up' && above > ARROWS_SHOW_VIEWPORTS * vh));
  const down = i.prev.down || (i.direction === 'down' && below > ARROWS_SHOW_VIEWPORTS * vh);
  return { up, down };
}

/** The scroll target of an arrow: the very top / the very end. */
export const arrowTarget = (dir: ScrollDir, scrollHeight: number, clientHeight: number): number =>
  dir === 'up' ? 0 : Math.max(0, scrollHeight - clientHeight);

/**
 * How a tap scrolls from `from` to `target`: `jump` = an instant move first (null: none), then `smooth` to the target (false: none).
 * Reduced motion = one instant move, no animation; up to ARROWS_SMOOTH_MAX_VIEWPORTS = smooth all the way; farther = a jump to
 * ARROWS_JUMP_LEAVE_VIEWPORTS before the target, then smooth.
 */
export function scrollPlan(from: number, target: number, clientHeight: number, reducedMotion: boolean): { jump: number | null; smooth: boolean } {
  if (reducedMotion) return { jump: target, smooth: false };
  const dist = Math.abs(target - from);
  if (dist <= ARROWS_SMOOTH_MAX_VIEWPORTS * clientHeight) return { jump: null, smooth: true };
  const leave = ARROWS_JUMP_LEAVE_VIEWPORTS * clientHeight;
  return { jump: target > from ? target - leave : target + leave, smooth: true };
}
