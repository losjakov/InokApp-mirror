import { IonButton, IonButtons, IonHeader, IonIcon, IonToolbar } from '@ionic/react';
import { arrowBackSharp, chevronBack } from 'ionicons/icons';
import { useLayoutEffect, useRef, type ReactNode } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useT } from '@/state/AppContext';
import { useGoBack } from '@/app/nav';
import logo from '@/assets/brand/inok.svg?url'; // ONE brand source: the launcher icons are made from it too (scripts/make_icons.mjs)

/**
 * One compact toolbar for every screen (REVIEW cloud_02 D4): no large title; a tab root may put its search field in the
 * toolbar instead of the title (`search`), a detail screen keeps back-arrow + title. One colour in both themes (D11).
 * The brand icon sits left of the title on every screen (A-12) except where the search takes the toolbar (A-13: the list);
 * off the home screen it is the way home (the owner's word 01.11: the common «logo = home» convention; «Ще → Головна» as well).
 * A-25 #6: the back arrow on EVERY screen but «Головна», the SAME handler as the system Back (`useGoBack`, one history).
 */
export function PageHeader({ title, end, search, fit }: { title: string; end?: ReactNode; search?: ReactNode;
  /** A-97: the title's TEXT is dropped (never cut, never wrapped) where it does not fit beside the buttons - the toolbar keeps its name */
  fit?: boolean }) {
  const { t } = useT();
  const h1 = useRef<HTMLHeadingElement>(null);
  useLayoutEffect(() => {
    const el = h1.current;
    if (!fit || !el || typeof ResizeObserver === 'undefined') return;
    const check = () => { el.dataset.dropped = el.scrollWidth > el.clientWidth + 1 ? '1' : '0'; }; // measured with the text laid out (transparent, not removed)
    const ro = new ResizeObserver(check);
    ro.observe(el); check();
    return () => ro.disconnect();
  }, [fit, title]);
  const navigate = useNavigate();
  const goBack = useGoBack();
  const atHome = useLocation().pathname === '/home';
  return (
    <IonHeader>
      <IonToolbar color="primary" className={search ? 'toolbar--search' : undefined} aria-label={title}>
        {(!atHome || !search) && (
          <IonButtons slot="start">
            {!atHome && <IonButton onClick={goBack} aria-label={t('common.back')} data-testid="back"><IonIcon slot="icon-only" ios={chevronBack} md={arrowBackSharp} aria-hidden="true" /></IonButton>}
            {!search && (atHome
              ? <img src={logo} className="toolbar__logo" alt="" aria-hidden="true" data-testid="toolbar-logo" />
              : <button type="button" className="toolbar__home" onClick={() => navigate('/home')} aria-label={t('nav.home')} title={t('nav.home')} data-testid="toolbar-home">
                  <img src={logo} className="toolbar__logo" alt="" data-testid="toolbar-logo" />
                </button>)}
          </IonButtons>
        )}
        {/* A-28: a search's own button (filters) sits right BESIDE the field on every width, not at the far end of a tablet's toolbar */}
        {search ? <div className="toolbar__search">{search}{end && <IonButtons>{end}</IonButtons>}</div> : <h1 ref={h1} className={`toolbar__title${fit ? ' toolbar__title--fit' : ''}`} data-testid="page-title">{title}</h1>}
        {!search && end && <IonButtons slot="end">{end}</IonButtons>}
      </IonToolbar>
    </IonHeader>
  );
}
