import { IonContent } from '@ionic/react';
import { useCallback, useEffect, useLayoutEffect, useRef, type ReactNode } from 'react';
import { useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom';

/**
 * THE list-detail page body (A-15) of «Статті», the monasteries list + card and «Єпархії УПЦ».
 * F2 / A-79 2 (Material list-detail): on >= 600 dp the list and the detail are TWO scrollers - scrolling one never moves the other;
 * opening another item shows the detail's TOP; the list keeps its place. The list pane is the page's scroll host
 * (`ion-content-scroll-host`), so the pull-to-refresh gesture and «scroll to top» follow the list. A phone: one scroller, as before.
 */
export function SplitContent({ wide, list, detail, detailKey, before, listClassName, detailTestId }: {
  wide: boolean;
  list: ReactNode;
  detail: ReactNode;
  /** the shown item; a change brings the detail pane back to its top */
  detailKey: string | number | null;
  /** what sits outside the panes (the page's `ion-refresher`) */
  before?: ReactNode;
  listClassName?: string;
  detailTestId?: string;
}) {
  const det = useRef<HTMLDivElement>(null);
  const lst = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => { if (det.current) det.current.scrollTop = 0; }, [detailKey]);
  // the list keeps its place: a same-route jump (`/monasteries/37` -> `/242`) hides the page for Ionic's transition, and a hidden box
  // loses its scroll offset - the last offset seen while shown is put back when the pane has a size again
  useEffect(() => {
    const el = lst.current;
    if (!wide || !el || typeof ResizeObserver === 'undefined') return;
    let kept = el.scrollTop;
    const onScroll = () => { if (el.clientHeight > 0) kept = el.scrollTop; };
    const ro = new ResizeObserver(() => { if (el.clientHeight > 0 && el.scrollTop !== kept) el.scrollTop = kept; });
    el.addEventListener('scroll', onScroll, { passive: true });
    ro.observe(el);
    return () => { el.removeEventListener('scroll', onScroll); ro.disconnect(); };
  }, [wide]);
  const listCls = `split__list${wide ? ' split__pane ion-content-scroll-host' : ''}${listClassName ? ` ${listClassName}` : ''}`;
  return (
    <IonContent scrollY={!wide}>
      {before}
      <div className="split">
        <div className={listCls} ref={lst} data-testid="list-pane">{list}</div>
        {wide && <div className="split__detail split__pane" ref={det} data-testid={detailTestId ?? 'detail-pane'}>{detail}</div>}
      </div>
    </IonContent>
  );
}

/** The element an observer of `el` must watch within: its pane when a two-pane page scrolls it, else the viewport (null). */
export const scrollRoot = (el: Element): Element | null => el.closest('.split__pane');

/**
 * THE selection of a list-detail screen (F2, A-79 2). A phone opens the item as its own page (`/monasteries/242`, a page pushed on the
 * stack - Back returns to the list). A tablet keeps ONE page: the item goes into the query of the SAME path (`/monasteries?code=242`) -
 * Ionic gives a new pathname of a `:param` route a NEW page instance, which lost the list's search, filters and place on every tap
 * (1.0.3). Each tablet selection is a history entry (Back = the previous one), as «Статті» (`?id=`) always was.
 */
export function useListDetail(param: 'code' | 'id', wide: boolean, itemPath: (v: number) => string): { selected: number | null; open: (v: number) => void } {
  const params = useParams();
  const [query] = useSearchParams();
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const raw = query.get(param) ?? params[param];
  const selected = raw ? Number(raw) : null;
  const open = useCallback((v: number) => navigate(detailHref(pathname, param, v, wide, itemPath)), [navigate, wide, pathname, param, itemPath]);
  return { selected, open };
}

/** THE address of a list-detail item: a tablet = the list's path + the query (R2, REVIEW cloud_25), a phone = the item's own page. */
export const detailHref = (listPath: string, param: 'code' | 'id', v: number, wide: boolean, itemPath: (v: number) => string): string =>
  wide ? `${listPath}?${param}=${v}` : itemPath(v);
