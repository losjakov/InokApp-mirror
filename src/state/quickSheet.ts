import { useCallback, useEffect, useRef } from 'react';
import type { Place } from '@/data/repo/reading';
import { keepsPlace } from '@/data/repo/reading';

/**
 * A-142 (cloud_42) - the long press on a monastery / article row = ONE bottom sheet of quick actions (the Ionic action sheet: the sort's
 * look, Android AND iPhone). The ITEMS are a pure rule (unit `quickSheet`): few, relevant, each one also in the card / the article (Apple HIG,
 * Material - no command lives only in a menu); NO «Відкрити на сайті» (the owner's word).
 */
export type MonasteryItem = 'page' | 'fav' | 'visited' | 'route' | 'map' | 'call' | 'stream' | 'share';
export function monasteryItems(h: { hasGeo: boolean; dial: string | null; hasChannel: boolean }): MonasteryItem[] {
  return ['page', 'fav', 'visited', ...(h.hasGeo ? ['route', 'map'] as const : []), ...(h.dial ? ['call'] as const : []), ...(h.hasChannel ? ['stream'] as const : []), 'share'];
}
export type ArticleItem = 'continue' | 'restart' | 'open' | 'fav' | 'read' | 'share';
/** a started, unfinished article: «Продовжити читання (N%)» + «Почати спочатку»; any other: «Відкрити»; a video has no place (A-141 (4)) */
export function articleItems(kind: string, place: Place | undefined): ArticleItem[] {
  const started = !!place && keepsPlace(kind) && place.started && !place.finished;
  return [...(started ? ['continue', 'restart'] as const : ['open'] as const), 'fav', ...(keepsPlace(kind) ? ['read'] as const : []), 'share'];
}

/** A-142 (4) the hint «Утримуйте палець на рядку — швидкі дії»: the first time the list is shown; again no earlier than 7 days later and
 *  only while that kind's sheet was never opened; at most 3 times; never after the first use. Counted per kind, kept on the phone. */
export interface HintState { shown: number; last: number; used: boolean }
export const HINT_MAX = 3;
export const HINT_GAP_MS = 7 * 86_400_000;
export const hintDue = (s: HintState, now: number): boolean => !s.used && s.shown < HINT_MAX && (s.shown === 0 || now - s.last >= HINT_GAP_MS);

/** the long-press timing (Android's own ~0.5 s) and the finger's allowed drift before it counts as a scroll */
export const LONG_MS = 500;
export const MOVE_PX = 10;

/**
 * THE long press of a row: 0.5 s still = `onLong` (a light vibration where the system has one); a move > 10 px, the finger lifted, or ANY
 * scroll before that = nothing (P4: a scroll never opens a sheet); after it fired, the click that follows the lifted finger is swallowed ONCE
 * (the row does not open as well), every other tap passes. The system's own long press (`contextmenu`: TalkBack's double-tap-and-hold, a
 * mouse's right button) opens the same sheet.
 */
export function useLongPress(onLong: () => void): {
  onPointerDown: (e: React.PointerEvent) => void; onPointerMove: (e: React.PointerEvent) => void; onPointerUp: () => void; onPointerCancel: () => void;
  onClickCapture: (e: React.MouseEvent) => void; onContextMenu: (e: React.MouseEvent) => void;
} {
  const st = useRef({ timer: 0, x: 0, y: 0, fired: false, swallow: false });
  const latest = useRef(onLong);
  useEffect(() => { latest.current = onLong; });
  const cancel = useCallback(() => { window.clearTimeout(st.current.timer); st.current.timer = 0; window.removeEventListener('scroll', onScroll, true); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  function onScroll() { window.clearTimeout(st.current.timer); st.current.timer = 0; window.removeEventListener('scroll', onScroll, true); }
  useEffect(() => () => cancel(), [cancel]);
  const fire = useCallback(() => {
    const s = st.current; s.timer = 0; s.fired = true; s.swallow = true;
    window.removeEventListener('scroll', onScroll, true);
    // a light haptic where the WebView has one (Android); iOS WebKit has none - feature-tested, never assumed
    try { (navigator as unknown as { vibrate?: (ms: number) => boolean }).vibrate?.(12); } catch { /* no vibration */ }
    latest.current();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  return {
    onPointerDown: (e) => {
      if (e.button !== 0) return;
      const s = st.current; cancel(); s.x = e.clientX; s.y = e.clientY; s.fired = false; s.swallow = false;
      window.addEventListener('scroll', onScroll, true);
      s.timer = window.setTimeout(fire, LONG_MS);
    },
    onPointerMove: (e) => { const s = st.current; if (s.timer && Math.hypot(e.clientX - s.x, e.clientY - s.y) > MOVE_PX) cancel(); },
    onPointerUp: () => { if (st.current.timer) cancel(); },
    onPointerCancel: () => cancel(),
    onClickCapture: (e) => { if (st.current.swallow) { st.current.swallow = false; e.preventDefault(); e.stopPropagation(); } },
    onContextMenu: (e) => { e.preventDefault(); if (st.current.fired) return; cancel(); fire(); window.setTimeout(() => { st.current.swallow = false; }, 1500); }, // a screen reader's release may bring no click
  };
}
