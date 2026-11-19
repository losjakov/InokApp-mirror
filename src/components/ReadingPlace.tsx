import { useEffect, useRef, useState, type RefObject } from 'react';
import type { Article } from '@/data/api/types';
import { anchorAt, getPlace, keepsPlace, LAST_SEEN_MS, noteOpened, pctOf, resumeOf, savePlace, STARTED_AFTER_MS, yOfAnchor } from '@/data/repo/reading';
import { scrollRoot } from './SplitContent';
import { useApp } from '@/state/AppContext';
import { readingChanged } from '@/state/reading';

/** the text's blocks in order: the lead's and the body's own children (paragraphs, headings, pictures) - A-141: «N % within the text only» */
const blocksOf = (art: HTMLElement): HTMLElement[] => Array.from(art.querySelectorAll<HTMLElement>('.aview__lead > *, .aview__body > *'));
/** what follows the text: reaching it = the article is finished (A-141 (2): «the ratings / comments below») */
const endOf = (art: HTMLElement): HTMLElement | null => art.querySelector<HTMLElement>('[data-testid="rating"], .card__site');
export const PILL_MS = 6000;
const SAVE_MS = 700;

/**
 * A-141 (2) THE PLACE of the open article - no button: the paragraph at the reading line (the top edge) is kept with the fraction inside it
 * (an anchor, never pixels) while the person reads, at most every 0.7 s and at once when the app goes to the background (closed mid-article).
 * STARTED = open > 20 s AND scrolled past the first screen; FINISHED = the last paragraph on screen >= 2 s, or the ratings / the site link
 * reached. Reopening a started, unfinished article jumps straight to the place and shows the pill «↺ Продовжено… · З початку» (it fades).
 * A−/A+ and a rotation re-place the SAME anchor (the text reflows, the reader stays at his paragraph). A video keeps nothing (4).
 */
export function useReadingPlace(a: Article | null | undefined, root: RefObject<HTMLElement | null>, scale: number): { resumed: boolean; fromStart: () => void } {
  const { db } = useApp();
  const [resumed, setResumed] = useState(false);
  const st = useRef({ id: 0, el: null as HTMLElement | null, anchor: { anchor: 0, frac: 0 }, opened: 0, scrolledPast: false, started: false, finished: false,
    lastSeenSince: 0, pct: 0, restoring: false });
  const id = a && keepsPlace(a.kind) ? a.id : null;
  const kind = a?.kind;
  const aRef = useRef(a);
  useEffect(() => { aRef.current = a; });

  useEffect(() => {
    const art = root.current;
    if (id == null || !art) return;
    const s = st.current;
    let on = true;
    let saveT = 0; let lastT = 0;
    const content = art.closest('ion-content') as HTMLIonContentElement | null;
    const pane = scrollRoot(art) as HTMLElement | null;
    Object.assign(s, { id, opened: Date.now(), scrolledPast: false, started: false, finished: false, lastSeenSince: 0, pct: 0 });
    const geometry = () => {
      const el = s.el!;
      const base = el.getBoundingClientRect().top - el.scrollTop;
      const blocks = blocksOf(art).map((b): [number, number] => { const r = b.getBoundingClientRect(); return [r.top - base, r.height]; });
      return { blocks, base, line: el.scrollTop + 8 }; // the reading line = the scroller's top edge (under the header)
    };
    const write = () => {
      window.clearTimeout(saveT); saveT = 0;
      if (!on && !s.el) return;
      void savePlace(db, id, { ...s.anchor, pct: s.pct, started: s.started, finished: s.finished }).then(readingChanged);
    };
    const measure = () => {
      const el = s.el; if (!el || s.restoring) return;
      const g = geometry();
      const blocks = blocksOf(art);
      s.anchor = anchorAt(g.blocks, g.line);
      if (blocks.length) {
        const first = g.blocks[0], last = g.blocks[g.blocks.length - 1];
        s.pct = pctOf(first[0], last[0] + last[1] - first[0], el.scrollTop + el.clientHeight);
        const lastBlock = blocks[blocks.length - 1].getBoundingClientRect();
        const view = el.getBoundingClientRect();
        const lastOn = lastBlock.top < view.bottom && lastBlock.bottom > view.top;
        if (lastOn) { if (!s.lastSeenSince) s.lastSeenSince = Date.now(); } else s.lastSeenSince = 0;
        const end = endOf(art)?.getBoundingClientRect();
        if ((end && end.top < view.bottom) || (s.lastSeenSince && Date.now() - s.lastSeenSince >= LAST_SEEN_MS)) { s.finished = true; s.pct = 100; }
      }
      if (el.scrollTop > el.clientHeight) s.scrolledPast = true;
      if (s.scrolledPast && Date.now() - s.opened > STARTED_AFTER_MS) s.started = true;
      if (!saveT) saveT = window.setTimeout(write, SAVE_MS);
    };
    const onScroll = () => { const now = Date.now(); if (now - lastT > 120) { lastT = now; measure(); } else { window.clearTimeout(tail); tail = window.setTimeout(measure, 150); } };
    let tail = 0;
    // the 20 s / 2 s rules also hold for a reader who does not move: re-judged every second while the article is open
    const tick = window.setInterval(() => { if (s.el) { const was = s.started || s.finished; measure(); if (!was && (s.started || s.finished)) write(); } }, 1000);
    const hidden = () => { if (document.visibilityState === 'hidden') write(); };
    const replace = () => { const el = s.el; if (!el) return; const g = geometry(); el.scrollTop = Math.max(0, yOfAnchor(g.blocks, s.anchor) - 8); };
    const onResize = () => { window.clearTimeout(tail); s.restoring = true; requestAnimationFrame(() => { replace(); s.restoring = false; }); };
    void (async () => {
      const el = pane ?? (await content?.getScrollElement()) ?? null;
      if (!on || !el) return;
      s.el = el;
      const cur = aRef.current;
      if (cur) await noteOpened(db, cur);
      const back = resumeOf(await getPlace(db, id));
      if (!on) return;
      if (back) { // straight to the place: twice (the pictures above may settle the layout after the first frame)
        s.anchor = back; s.restoring = true;
        await new Promise((ok) => requestAnimationFrame(() => ok(null)));
        replace();
        await new Promise((ok) => setTimeout(ok, 250));
        if (!on) return;
        replace(); s.restoring = false; s.started = true; setResumed(true);
      }
      el.addEventListener('scroll', onScroll, { passive: true });
      readingChanged();
    })();
    document.addEventListener('visibilitychange', hidden);
    window.addEventListener('resize', onResize);
    return () => {
      on = false; window.clearInterval(tick); window.clearTimeout(tail);
      s.el?.removeEventListener('scroll', onScroll);
      document.removeEventListener('visibilitychange', hidden);
      window.removeEventListener('resize', onResize);
      if (s.el) write(); // leaving the article keeps the last place
      s.el = null; setResumed(false);
    };
  }, [db, id, kind, root]);

  // A−/A+ (the article's own scale): the text reflows - the reader's paragraph goes back to the reading line
  const first = useRef(true);
  useEffect(() => {
    if (first.current) { first.current = false; return; }
    const s = st.current; const el = s.el; const art = root.current;
    if (!el || !art) return;
    s.restoring = true;
    requestAnimationFrame(() => {
      const base = el.getBoundingClientRect().top - el.scrollTop;
      const blocks = blocksOf(art).map((b): [number, number] => { const r = b.getBoundingClientRect(); return [r.top - base, r.height]; });
      el.scrollTop = Math.max(0, yOfAnchor(blocks, s.anchor) - 8);
      s.restoring = false;
    });
  }, [scale, root]);

  const fromStart = () => { const s = st.current; setResumed(false); if (s.el) s.el.scrollTop = 0; };
  return { resumed, fromStart };
}
