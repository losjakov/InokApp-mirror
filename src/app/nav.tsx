import { useCallback, useContext, useEffect, useRef, type ReactNode } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { IonTabButton, NavContext } from '@ionic/react';
import { App } from '@capacitor/app';
import { isNative } from '@/native/platform';
import type { ListEntry } from './linkRoute';

/**
 * THE navigation module (A-15): the bottom tabs (A-27) and Back (A-25 #6) — one table of tab roots, one rule each.
 */

/**
 * The Android system Back (owner 01.11, after cloud_05: «на экране "Ще" не работает назад; последнее назад сворачивает»).
 * The platform rule (developer.android.com «Back navigation», Material «Navigation bar»): Back walks the in-app history of a
 * detail screen; from a top-level tab it returns to the START destination (here «Головна»); Back on the start destination leaves
 * the app — since Android 12 a root activity is MOVED TO THE BACK (not finished), so the app comes back as it was: `minimizeApp`.
 * Open overlays (sheets, alerts, the picture viewer) close first: Ionic gives them priority 100, this handler has 10.
 */
export type BackAction = { kind: 'history' } | { kind: 'go'; to: string } | { kind: 'minimize' };

/** The five bottom tabs and their TOP screens (A-27). */
export const TABS = { monasteries: '/monasteries', map: '/map', streams: '/streams', articles: '/articles', more: '/more' } as const;
export type TabId = keyof typeof TABS;
/** owner 02.11.2026: «Поруч → Всі» on «Головна» = the map with «near me» already on — the SAME start as its locate button */
/** PLAN 7: THE eparchies screen and one eparchy's own page (the phone form; a tablet selects it in the list: `detailHref`) */
export const EPARCHIES_PATH = '/more/eparchies';
export const eparchyPath = (id: number): string => `${EPARCHIES_PATH}/${id}`;
export const MAP_NEAR = `${TABS.map}?near=1`;
const TAB_ROOTS = new Set<string>(Object.values(TABS));

/** The tab a path belongs to (the same prefix rule as Ionic's tab bar); «Головна» belongs to none. */
export function tabOf(pathname: string): TabId | undefined {
  const path = pathname.replace(/\/+$/, '') || '/';
  return (Object.keys(TABS) as TabId[]).find((t) => path === TABS[t] || path.startsWith(`${TABS[t]}/`));
}

/**
 * A-27 (owner, his phone, 01.11.2026 20:58 — D44): a tab button ALWAYS opens its tab's TOP screen; tapped on its own top screen it
 * scrolls that screen up. Ionic 9 instead remembers each tab's LAST url (`IonTabBar` `currentHref`) and its button goes there — after
 * «Ще → Єпархії → a page» every «Ще» opened that page. Material «Navigation bar»: on Android a destination tap shows the destination's
 * root; Apple HIG keeps each tab's place (revisit for iOS). The top screen itself stays mounted, so its scroll / search / filters stay.
 */
export type TabTap = { kind: 'go'; to: string } | { kind: 'scrollTop' };
export function tabTap(tab: TabId, pathname: string, search: string): TabTap {
  const path = pathname.replace(/\/+$/, '') || '/';
  if (tabOf(path) === tab && path === TABS[tab] && search === '') return { kind: 'scrollTop' };
  return { kind: 'go', to: TABS[tab] };
}

/** The shown page's scrollers back to the top (both panes of a two-pane screen). */
function scrollShownToTop(): void {
  const pages = Array.from(document.querySelectorAll('ion-tabs .ion-page:not(.ion-page-hidden)'));
  const page = pages[pages.length - 1];
  page?.querySelectorAll('ion-content').forEach((c) => void (c as HTMLIonContentElement).scrollToTop(300));
  page?.querySelectorAll('.split__pane').forEach((p) => p.scrollTo({ top: 0, behavior: 'smooth' })); // F2: a two-pane screen's own scrollers
}

/**
 * The tab bar's button (A-27): Ionic's tab bar clones it with the tab's remembered url and its own click handler — both are
 * replaced here by the tab's top screen and `tabTap`. `isTabButton` lets `IonTabBar` treat it as its own button.
 */
export function TabButton({ tab, children }: { tab: TabId; children: ReactNode; href?: string; onClick?: unknown }) {
  const nav = useContext(NavContext);
  const loc = useLocation();
  const tap = () => {
    const a = tabTap(tab, loc.pathname, loc.search);
    if (a.kind === 'scrollTop') scrollShownToTop();
    // a fresh entry of the top screen in its tab, no slide (a tab switch); the screen opened from another tab stays behind it
    else nav.navigate(a.to, 'none', 'push', undefined, undefined, tab);
  };
  return <IonTabButton tab={tab} href={TABS[tab]} onClick={tap}>{children}</IonTabButton>;
}
TabButton.isTabButton = true;
/** A-25 #1: a screen whose URL changes in place (a scope chip cleared, a marker card closed) keeps this state, so its Back still walks
 *  the history to the screen it was opened from (the eparchy's page, the card) instead of leaving the tab root for «Головна». */
export const OPENED_FROM = { opened: true } as const;

/**
 * ONE rule for the header arrow and the system Back (A-25 #6, #1). `inApp` = the app's own history has an entry before this
 * one (react-router's first entry has the key `default`); `opened` = the location carries `OPENED_FROM`.
 * - «Головна»: the app folds (system Back; the header shows no arrow there).
 * - a DETAIL = a nested path (`/monasteries/37`, `/more/…`) or a tab root opened FOR something (`?id=`, `?code=`, `?eparchy=`,
 *   or `opened` - e.g. «Ще» opened by a photo offer, cloud_40 A2): Back = the previous screen; opened first (push tap, deep link) = its parent.
 * - a plain tab root (reached by the tab bar or a home tile): «Головна» (cloud_06, the platform's start destination).
 */
export function backAction(pathname: string, search: string, inApp: boolean, opened = false): BackAction {
  const path = pathname.replace(/\/+$/, '') || '/';
  if (path === '/home' || path === '/') return { kind: 'minimize' };
  const q = new URLSearchParams(search);
  const nested = !TAB_ROOTS.has(path);
  if (!nested && !opened && [...q.keys()].length === 0) return { kind: 'go', to: '/home' };
  if (inApp) return { kind: 'history' };
  return { kind: 'go', to: parentOf(path, q) };
}

/** Where a detail opened first (no history behind it) goes back to. */
function parentOf(path: string, q: URLSearchParams): string {
  if (path === '/map' && q.get('eparchy')) return eparchyPath(Number(q.get('eparchy')));
  if (path === '/map' && q.get('code')) return `/monasteries/${q.get('code')}`;
  if (path === '/map' && q.get('at')) return '/more/contacts'; // PLAN 5: the «Контакти» mini-map's place
  if (path.startsWith(`${EPARCHIES_PATH}/`) || (path === EPARCHIES_PATH && q.get('id'))) return EPARCHIES_PATH; // PLAN 7 (+ F2: the tablet's `?id=`)
  if (path === '/more' || path.startsWith('/more/')) return '/more';
  if (path.startsWith('/monasteries/') || (path === '/monasteries' && q.get('code'))) return '/monasteries'; // F2: the tablet's `?code=`
  if ((path === '/articles' && q.get('id')) || path.startsWith('/articles/')) return '/articles'; // A-141: «Недочитані»
  return '/home';
}

/** The ONE back handler: the header arrow calls it, the system Back calls it (A-25 #6). */
export function useGoBack(): () => void {
  const navigate = useNavigate();
  const loc = useLocation();
  return useCallback(() => {
    const st = loc.state as { opened?: boolean; start?: boolean } | null;
    // the app's first screen has no history behind it: react-router's first entry (key `default`) or the start's own (A-78 1, `START`)
    const a = backAction(loc.pathname, loc.search, loc.key !== 'default' && st?.start !== true, st?.opened === true);
    if (a.kind === 'minimize') { if (isNative()) void App.minimizeApp(); }
    else if (a.kind === 'history') navigate(-1);
    else navigate(a.to, { replace: true });
  }, [navigate, loc.pathname, loc.search, loc.key, loc.state]);
}

/** Wires the system Back once (inside the router). On the web the browser's own Back stays as it is. */
export function useHardwareBack(): void {
  const goBack = useGoBack();
  useEffect(() => {
    if (!isNative()) return;
    // a JS listener on App «backButton» makes Capacitor raise the document `backbutton` event that Ionic turns into
    // `ionBackButton` (overlays first); without it the WebView's own history ran and the tab roots did nothing
    const sub = App.addListener('backButton', () => undefined);
    const onBack = (ev: Event) => (ev as CustomEvent<{ register(p: number, h: (next: () => void) => void): void }>).detail.register(10, goBack);
    document.addEventListener('ionBackButton', onBack);
    return () => { document.removeEventListener('ionBackButton', onBack); void sub.then((s) => s.remove()); };
  }, [goBack]);
}

/**
 * A-138: a site LIST link reached this list (src/app/linkRoute.ts `ListEntry` in the location's state) -> `apply` resets it as if just
 * opened. Ionic keeps a tab's page mounted, so the reset is said by the entry's mark, once per mark (Back to the same entry: nothing again).
 */
export function useListEntry(apply: (e: ListEntry) => void): void {
  const loc = useLocation();
  const e = loc.state as Partial<ListEntry> | null;
  const mark = typeof e?.reset === 'number' ? e.reset : null;
  const seen = useRef<number | null>(null);
  const latest = useRef(apply);
  useEffect(() => { latest.current = apply; });
  useEffect(() => {
    if (mark == null || mark === seen.current) return;
    seen.current = mark;
    latest.current({ reset: mark, kind: e?.kind });
  }, [mark, e?.kind]);
}
