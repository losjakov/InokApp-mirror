import { IonIcon } from '@ionic/react';
import { eyeOutline } from 'ionicons/icons';
import { useEffect, useState, type ReactNode, type RefObject } from 'react';
import { dwellMet, loadViews, sendView, viewsPath, type ViewTarget, type ViewsState } from '@/data/repo/views';
import { useApp } from '@/state/AppContext';
import { Spoken } from './Spoken';

const TICK_MS = 1000;

/** A-65: the site's eye of an OPENED article / monastery - an eye and a grey number, no word (spoken «Переглядів: N»); nothing below
 *  40 (null) or before the first answer. The same hook counts ONE view by the site's rules (src/data/repo/views.ts). Returns the
 *  meta-line group, or null. `shown` = the page's own element: the dwell counts only while it is on screen. */
export function useViewsEye(target: ViewTarget, shown: RefObject<HTMLElement | null>): ReactNode {
  const { db, t, settings } = useApp();
  const path = viewsPath(target);
  const [got, setGot] = useState<(ViewsState & { path: string }) | null>(null);
  const st = got?.path === path ? got : null; // another page's answer is never shown
  useEffect(() => {
    let on = true;
    void loadViews(db, target).then((s) => { if (on) setGot({ ...s, path }); });
    return () => { on = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- the page is its path
  }, [db, path]);
  const counting = !!st?.token && !settings.incognito && !settings.ownDevice;
  useEffect(() => {
    if (!counting || !st?.token) return;
    let ms = 0;
    let touched = false;
    let done = false;
    const touch = () => { touched = true; };
    const evs = ['pointerdown', 'touchstart', 'keydown', 'wheel'] as const;
    evs.forEach((e) => document.addEventListener(e, touch, { capture: true, passive: true }));
    document.addEventListener('scroll', touch, { capture: true, passive: true });
    // time counts only while THIS page is on screen (a hidden Ionic page keeps its DOM, `display: none`) and the app is in front
    const id = window.setInterval(() => {
      if (done || document.visibilityState !== 'visible' || !shown.current || shown.current.offsetParent === null) return;
      ms += TICK_MS;
      if (dwellMet(ms, touched, st)) { done = true; void sendView(db, target, st.token!); }
    }, TICK_MS);
    return () => {
      window.clearInterval(id);
      evs.forEach((e) => document.removeEventListener(e, touch, { capture: true }));
      document.removeEventListener('scroll', touch, { capture: true });
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- one dwell per opened page and token
  }, [counting, st?.token, path, db]);
  if (st?.views == null) return null;
  const n = String(st.views);
  return (
    <Spoken className="views" say={t('views.label', { n })} testId="views" data={{ 'data-views': n }}>
      <IonIcon icon={eyeOutline} aria-hidden="true" />{n}
    </Spoken>
  );
}
