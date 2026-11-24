import { IonIcon } from '@ionic/react';
import { chevronDown, chevronUp } from 'ionicons/icons';
import { useEffect, useRef, useState, type CSSProperties, type RefObject } from 'react';
import { createPortal } from 'react-dom';
import { useApp } from '@/state/AppContext';
import { ARROWS_IDLE_MS, ARROWS_SCROLL_END_MS, NO_ARROWS, arrowTarget, arrowsShown, scrollPlan, type ArrowsShown, type ScrollDir } from '@/state/scrollArrows';
import { scrollRoot } from './SplitContent';
import { overlayOpen } from './overlays';

const REDUCED_MOTION = '(prefers-reduced-motion: reduce)';
/** a press this long shows the arrow's words (the long-press tooltip of an icon-only control) */
const LONG_PRESS_MS = 500;
/** how long the words stay after the finger is lifted */
const TIP_MS = 1500;
const DIRS: { dir: ScrollDir; icon: string; key: string }[] = [{ dir: 'up', icon: chevronUp, key: 'scroll.up' }, { dir: 'down', icon: chevronDown, key: 'scroll.down' }];
const OVERLAY_EVENTS = ['ionModalWillPresent', 'ionAlertWillPresent', 'ionActionSheetWillPresent', 'ionPopoverWillPresent'];
const TOAST_EVENTS = ['ionToastDidPresent', 'ionToastDidDismiss'];

const typing = () => !!document.activeElement?.matches('input, textarea, select, [contenteditable="true"]');
/** D73: a message / the update banner sits above the tab bar, over the page's bottom - the arrows stack above its top */
const liftOver = (host: Element): number => {
  const tops = Array.from(document.querySelectorAll('ion-toast.app-toast:not(.overlay-hidden)'))
    .map((e) => e.shadowRoot?.querySelector('.toast-wrapper')?.getBoundingClientRect())
    .filter((r): r is DOMRect => !!r && r.height > 0).map((r) => r.top);
  return tops.length ? Math.max(0, host.getBoundingClientRect().bottom - Math.min(...tops)) : 0;
};
/** where focus goes after the scroll (TalkBack announces it): the title after «up», the article's / card's last block after «down» */
const focusEnd = (art: HTMLElement, dir: ScrollDir) => {
  const el = dir === 'up' ? art.querySelector<HTMLElement>('h1') : [...art.children].reverse().find((e): e is HTMLElement => !e.matches('ion-modal'));
  if (!el) return;
  el.setAttribute('tabindex', '-1'); el.setAttribute('data-arrow-target', '');
  el.focus({ preventScroll: true });
};

/**
 * A-85 (2): THE smart «up» / «down» arrows of a long article / monastery card (the rule: src/state/scrollArrows.ts). `root` = the article;
 * its scroller = the tablet's detail pane or the phone's `ion-content`; the arrows sit in that `ion-content`'s fixed layer, bottom-right
 * (on a tablet = the detail pane's corner, never over the list). Icon-only: the accessible name, a title and a long-press tooltip.
 */
export function ScrollArrows({ root }: { root: RefObject<HTMLElement | null> }) {
  const { t } = useApp();
  const [host, setHost] = useState<HTMLElement | null>(null);
  const [shown, setShown] = useState<ArrowsShown>(NO_ARROWS);
  const [lift, setLift] = useState(0);
  const [tip, setTip] = useState<ScrollDir | null>(null);
  const api = useRef<{ go: (d: ScrollDir) => void; hold: (on: boolean) => void } | null>(null);
  const press = useRef<{ timer?: number; tipTimer?: number; down: boolean; long: boolean }>({ down: false, long: false });

  useEffect(() => {
    const art = root.current; const content = art?.closest('ion-content') as HTMLIonContentElement | null;
    if (!art || !content) return;
    let el: HTMLElement | null = null; let on = true;
    const st = { top: 0, dir: null as ScrollDir | null, at: -Infinity, shown: NO_ARROWS, held: null as ScrollDir | null, keyboard: false };
    let idle = 0; let end = 0;
    const show = (n: ArrowsShown) => {
      if (n.up === st.shown.up && n.down === st.shown.down) return;
      st.shown = n; setShown(n);
      if (n.up || n.down) setLift(liftOver(content));
    };
    const update = () => {
      if (!el) return;
      show(arrowsShown({ scrollTop: el.scrollTop, scrollHeight: el.scrollHeight, clientHeight: el.clientHeight, direction: st.dir, lastScrollAt: st.at,
        now: Date.now(), prev: st.shown, held: st.held != null, blocked: st.keyboard || overlayOpen() || typing() }));
    };
    const rearm = () => { window.clearTimeout(idle); idle = window.setTimeout(update, ARROWS_IDLE_MS); };
    const finish = () => {
      const dir = st.held; st.held = null; st.at = Date.now();
      update(); rearm();
      if (dir) focusEnd(art, dir);
    };
    const onScroll = () => {
      if (!el) return;
      const top = el.scrollTop;
      if (top !== st.top) { st.dir = top < st.top ? 'up' : 'down'; st.top = top; }
      st.at = Date.now();
      if (st.held) { window.clearTimeout(end); end = window.setTimeout(finish, ARROWS_SCROLL_END_MS); return; }
      update(); rearm();
    };
    const hide = () => { window.clearTimeout(idle); show(NO_ARROWS); };
    const keyboard = (open: boolean) => () => { st.keyboard = open; if (open) hide(); };
    const kbShow = keyboard(true); const kbHide = keyboard(false);
    const relift = () => { if (st.shown.up || st.shown.down) setLift(liftOver(content)); };
    api.current = {
      go: (dir) => {
        if (!el) return;
        const target = arrowTarget(dir, el.scrollHeight, el.clientHeight);
        const plan = scrollPlan(el.scrollTop, target, el.clientHeight, window.matchMedia(REDUCED_MOTION).matches);
        st.held = dir; window.clearTimeout(idle);
        if (plan.jump != null) el.scrollTop = plan.jump;
        if (plan.smooth) el.scrollTo({ top: target, behavior: 'smooth' });
        window.clearTimeout(end); end = window.setTimeout(finish, ARROWS_SCROLL_END_MS);
      },
      // a finger on an arrow (its long press) keeps them; lifting it counts as activity
      hold: (down) => { if (down) window.clearTimeout(idle); else { st.at = Date.now(); rearm(); } },
    };
    const pane = scrollRoot(art) as HTMLElement | null;
    void (pane ? Promise.resolve(pane) : content.getScrollElement()).then((x) => {
      if (!on) return;
      el = x; st.top = x.scrollTop;
      x.addEventListener('scroll', onScroll, { passive: true });
      setHost(content);
    });
    OVERLAY_EVENTS.forEach((e) => document.addEventListener(e, hide));
    TOAST_EVENTS.forEach((e) => document.addEventListener(e, relift));
    window.addEventListener('ionKeyboardDidShow', kbShow); window.addEventListener('ionKeyboardDidHide', kbHide);
    return () => {
      on = false; api.current = null;
      window.clearTimeout(idle); window.clearTimeout(end);
      el?.removeEventListener('scroll', onScroll);
      OVERLAY_EVENTS.forEach((e) => document.removeEventListener(e, hide));
      TOAST_EVENTS.forEach((e) => document.removeEventListener(e, relift));
      window.removeEventListener('ionKeyboardDidShow', kbShow); window.removeEventListener('ionKeyboardDidHide', kbHide);
    };
  }, [root]);

  useEffect(() => () => { window.clearTimeout(press.current.timer); window.clearTimeout(press.current.tipTimer); }, []);
  if (!host) return null;
  const release = () => {
    const p = press.current;
    if (!p.down) return;
    p.down = false; window.clearTimeout(p.timer); api.current?.hold(false);
    if (p.long) { window.clearTimeout(p.tipTimer); p.tipTimer = window.setTimeout(() => setTip(null), TIP_MS); }
  };
  return createPortal(
    <div slot="fixed" className="scroll-arrows" style={{ '--arrows-lift': `${lift}px` } as CSSProperties} data-testid="scroll-arrows">
      {DIRS.map(({ dir, icon, key }) => (
        <button key={dir} type="button" className="scroll-arrows__btn" data-shown={shown[dir] ? '1' : '0'} aria-label={t(key)} title={t(key)} data-testid={`scroll-${dir}`}
          onPointerDown={() => {
            const p = press.current;
            p.down = true; p.long = false; window.clearTimeout(p.timer); api.current?.hold(true);
            p.timer = window.setTimeout(() => { p.long = true; setTip(dir); }, LONG_PRESS_MS);
          }}
          onPointerUp={release} onPointerCancel={release} onPointerLeave={release}
          onContextMenu={(e) => e.preventDefault()}
          onClick={() => { if (press.current.long) { press.current.long = false; return; } setTip(null); api.current?.go(dir); }}>
          <IonIcon icon={icon} aria-hidden="true" />
          {tip === dir && <span className="scroll-arrows__tip" role="tooltip">{t(key)}</span>}
        </button>
      ))}
    </div>,
    host,
  );
}
