import { IonButton, IonContent, IonIcon, IonLabel, IonList, IonPage, IonSegment, IonSegmentButton, useIonActionSheet } from '@ionic/react';
import { SearchField } from '@/components/SearchField';
import { checkmark, searchOutline, star, swapVerticalOutline } from 'ionicons/icons';
import { Busy } from '@/components/Busy';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { MoreButton } from '@/components/MoreButton';
import { TextSizeButtons } from '@/components/TextSize';
import { PageHeader } from '@/components/PageHeader';
import { useRefresh } from '@/components/Refresh';
import { ArticleRow } from '@/components/ArticleRow';
import { ArticleView } from '@/components/ArticleView';
import type { Article } from '@/data/api/types';
import { fetchKind, fetchOlder, fetchQuery, listArticles, localQuery, mergePage, nextCursor, queryText } from '@/data/repo/articles';
import type { ArticleKind } from '@/data/source';
import { articleSorts, type ArticleSort } from '@/data/repo/articleOrder';
import { ARTICLE_KINDS } from '@/native/push';
import { useApp } from '@/state/AppContext';
import { ShareFooter } from '@/components/ShareFooter';
import { NetNotice } from '@/components/NetNotice';
import { netFailure, type NetFailure } from '@/data/netFailure';
import { SplitContent } from '@/components/SplitContent';
import { StatusNote } from '@/components/StatusNote';
import { sitePageUrl } from '@/data/links/sitePages';
import { useWide } from '@/state/useWide';
import { useListEntry } from '@/app/nav';
import { useReading } from '@/state/reading';
import { ContinueReading } from '@/components/ContinueReading';
import { continueOver, SAVED } from '@/data/repo/reading';
import { ArticleStar } from '@/components/FavMark';
import { useQuickHint } from '@/components/QuickSheet';

/** A-141 (1): the 5th segment = the saved articles («★», named «Обрані»), newest-saved first, from the phone only */
export { SAVED };

/** A-97: the order chosen for ALL tabs, kept while the app runs (the page may be rebuilt), the default after a restart («Не запоминать») */
let sessionSort: ArticleSort = 'published';
/** A-97: the server is asked ~400 ms after typing stops (one request per pause, never per letter; R-44 allows 240 per 10 min) */
export const QUERY_DEBOUNCE_MS = 400;

/**
 * Stage 4 (spec §6, A-19): the site's feed — publications, video, news — the newest 30 in the device cache (offline, with covers),
 * a kind tab pages the server's section list (R-19: `articles?kind=`; the cached items of that kind show first and offline); «Показати більше» pages further while online, not cached.
 * `?id=` opens an article (push tap, contract §4; the home «Нове на сайті»); on ≥600 dp list and article side by side.
 */
/** A-117 (2): the section opens on «Статті» (the kind of greatest weight), not «Все»; the tabs' order and «Все» stay. The top screen stays
 *  mounted (A-27), so a kind chosen later is kept as before. InokSite ruling 355 is the site's twin. */
export const ENTRY_KIND: ArticleKind = 'publication';

/**
 * A-128: «Усі» of a home block opens «Публікації» on «Усі» in THAT block's order - for this entry only. The order travels in the ROUTE
 * (`?sort=`), the entry's mark in the location's state (a new tap = a new entry); the person's own tab and order are not touched, so the tab
 * bar's «Публікації» (always the bare `/articles`, A-27) shows them as before. ONE builder of that address (Home uses it).
 */
export const articlesEntry = (sort: ArticleSort): { to: string; state: { entry: number } } => ({ to: `/articles?sort=${sort}`, state: { entry: Date.now() } });
const entrySortOf = (v: string | null, sorts: ArticleSort[]): ArticleSort | null => (v && (sorts as string[]).includes(v) ? (v as ArticleSort) : null);

export function ArticlesPage() {
  const { db, t, lang, articlesVersion, refreshArticles, config } = useApp();
  const { saved, savedList } = useReading();
  const wide = useWide();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const loc = useLocation();
  const id = params.get('id') ? Number(params.get('id')) : null;
  const [ownKind, setOwnKind] = useState<string>(ENTRY_KIND);
  // A-97 (R-44): search + sort in the header - only when the server takes them (`config.features.articles_query`)
  const canQuery = !!config?.features.articles_query;
  const sorts = articleSorts(config?.features); // R-48: views_week / rating only when the server takes them (P2)
  const [searching, setSearching] = useState(false);
  const [typed, setTyped] = useState('');
  const [q, setQ] = useState('');
  const [chosen, setSortS] = useState<ArticleSort>(sessionSort);
  // A-128: an entry from a home block («Усі»): its own tab («Усі» first) and order while the route carries `?sort=`; a new entry starts over
  const entrySort = canQuery ? entrySortOf(params.get('sort'), sorts) : null;
  const entryMark = (loc.state as { entry?: number } | null)?.entry ?? 0;
  const [entryView, setEntryView] = useState<{ mark: number; kind: string; sort: ArticleSort } | null>(null);
  const entry = entrySort ? (entryView && entryView.mark === entryMark ? entryView : { mark: entryMark, kind: 'all', sort: entrySort }) : null;
  const kind = entry ? entry.kind : ownKind;
  const setKind = (k: string) => (entry ? setEntryView({ ...entry, kind: k }) : setOwnKind(k));
  const sort: ArticleSort = entry ? entry.sort : sorts.includes(chosen) ? chosen : 'published'; // a kept v2 order on a server without it = the default
  const setSort = (s: ArticleSort) => { if (entry) { setEntryView({ ...entry, sort: s }); return; } sessionSort = s; setSortS(s); };
  const [items, setItems] = useState<Article[] | null>(null);
  const [next, setNext] = useState<string | null>(null);
  const [offline, setOffline] = useState(false);
  const [more, setMore] = useState(false);
  const [moreFail, setMoreFail] = useState<NetFailure | null>(null);
  const [failKey, setFailKey] = useState('');
  const moreFailNow = failKey === `${kind}|${lang}` ? moreFail : null; // another list: its own paging (no stale «why»)
  const [older, setOlder] = useState<{ items: Article[]; next: string | null } | null>(null);
  // R-19: a kind tab pages the server's section list; the cache of that kind shows first (and offline)
  const [server, setServer] = useState<{ kind: string; items: Article[]; next: string | null } | null>(null);
  useEffect(() => {
    if (kind === 'all' || kind === SAVED) return;
    let on = true;
    fetchKind(lang, kind as ArticleKind, null).then((p) => on && setServer({ kind, ...p }), () => on && setOffline(true));
    return () => { on = false; };
  }, [lang, kind]);
  useEffect(() => {
    let on = true;
    if (kind === SAVED) void savedList().then((i) => { if (on) { setItems(i); setNext(null); } });
    else Promise.all([listArticles(db, lang, kind === 'all' ? null : kind), nextCursor(db, lang)]).then(([i, n]) => { if (on) { setItems(i); setNext(n); } });
    return () => { on = false; };
  }, [db, lang, kind, articlesVersion, savedList, saved]);
  const refresh = useRefresh(useCallback(async () => { setOffline(!(await refreshArticles())); }, [refreshArticles]));
  const searchbar = useRef<HTMLIonSearchbarElement>(null);
  useEffect(() => { const h = window.setTimeout(() => setQ(queryText(typed)), typed ? QUERY_DEBOUNCE_MS : 0); return () => window.clearTimeout(h); }, [typed]);
  useEffect(() => { if (searching) window.setTimeout(() => void searchbar.current?.setFocus(), 150); }, [searching]);
  const active = canQuery && (q !== '' || sort !== 'published');
  const qKey = `${lang}|${kind}|${q}|${sort}`;
  const [found, setFound] = useState<{ key: string; items: Article[]; next: string | null; local: boolean } | null>(null);
  const fv = active && found?.key === qKey ? found : null; // another list's answer is never shown; its cursor never reused (R-44: 400)
  useEffect(() => {
    if (!active) return;
    const c = new AbortController(); // a newer query / sort / tab cancels this one
    let on = true;
    if (kind === SAVED) { // the saved ones are searched and ordered on the phone (they are all here)
      void savedList().then((base) => { if (on) setFound({ key: qKey, items: localQuery(base, q, sort), next: null, local: false }); });
      return () => { on = false; };
    }
    const k = kind === 'all' ? null : (kind as ArticleKind);
    fetchQuery(db, lang, k, q, sort, null, c.signal)
      .then((p) => { if (on) setFound({ key: qKey, items: p.items, next: p.next, local: false }); })
      .catch(async () => { // offline (or refused): the saved 30 of this tab, filtered and ordered here, with the note
        if (!on) return;
        const base = await listArticles(db, lang, k);
        if (on) setFound({ key: qKey, items: localQuery(base, q, sort), next: null, local: true });
      });
    return () => { on = false; c.abort(); };
  }, [active, qKey, db, lang, kind, q, sort, savedList]);
  const [sheet] = useIonActionSheet();
  const openSort = () => void sheet({
    header: t('articles.sort'), cssClass: 'sort-sheet',
    buttons: [...sorts.map((s) => ({ text: t(`articles.sort_${s}`), icon: s === sort ? checkmark : undefined, cssClass: s === sort ? 'sort-sheet__on' : undefined,
      htmlAttributes: { role: 'radio', 'aria-checked': s === sort ? 'true' : 'false', 'data-testid': `sort-${s}` }, handler: () => setSort(s) })),
    { text: t('common.cancel'), role: 'cancel' }],
  });
  const closeSearch = () => { setSearching(false); setTyped(''); setQ(''); };
  // A-138 (amendment): a site section link (`/articles/publications|video|news/`) = its kind tab as if just opened: no search, the default
  // order (A-97: the order is kept only while the app runs), no home-block entry, the top of the list
  useListEntry((e) => { closeSearch(); sessionSort = 'published'; setSortS('published'); setEntryView(null); setOwnKind(e.kind ?? ENTRY_KIND); });
  const tab = server && server.kind === kind ? server : null;
  const loadMore = async () => {
    setMore(true);
    setMoreFail(null);
    try {
      if (fv) {
        if (fv.next) { const p = await fetchQuery(db, lang, kind === 'all' ? null : (kind as ArticleKind), q, sort, fv.next); setFound((cur) => (cur?.key === fv.key ? { ...cur, items: mergePage(cur.items, p.items), next: p.next } : cur)); }
        return;
      }
      if (tab) {
        if (tab.next) { const p = await fetchKind(lang, kind as ArticleKind, tab.next); setServer({ kind, items: [...tab.items, ...p.items], next: p.next }); }
        return;
      }
      const cursor = older ? older.next : next;
      if (cursor) { const p = await fetchOlder(lang, cursor); setOlder({ items: [...(older?.items ?? []), ...p.items], next: p.next }); }
    } catch (e) { setMoreFail(await netFailure(e)); setFailKey(`${kind}|${lang}`); } finally { setMore(false); } // A-125: the cause under the button, «Повторити»
  };
  // an article opened inside a block's entry keeps the entry in its address: Back returns to the same list (its tab, its order)
  const open = (a: number) => navigate(entry ? `/articles?sort=${entrySort}&id=${a}` : `/articles?id=${a}`, entry ? { state: { entry: entry.mark } } : undefined);
  const shown = active ? (fv ? fv.items : null) : tab ? tab.items : items && [...items, ...(older?.items ?? []).filter((a) => (kind === 'all' || a.kind === kind) && !items.some((b) => b.id === a.id))];
  useQuickHint('article', !!shown && shown.length > 0); // A-142 (4)
  const hasMore = active ? !!fv?.next : tab ? !!tab.next : older ? !!older.next : !!next;
  const list = (
    <>
      <IonSegment value={kind} onIonChange={(e) => setKind(String(e.detail.value))} scrollable className="kinds list-pin" data-testid="kinds" data-query={fv ? qKey : undefined}>
        {['all', ...ARTICLE_KINDS].map((k) => <IonSegmentButton key={k} value={k} data-testid={`kind-tab-${k}`}><IonLabel>{t(k === 'all' ? 'articles.all' : `kind.${k}`)}</IonLabel></IonSegmentButton>)}
        <IonSegmentButton value={SAVED} data-testid={`kind-tab-${SAVED}`} aria-label={t('articles.saved_tab')} className="kinds__saved">
          <IonIcon icon={star} aria-hidden="true" />
        </IonSegmentButton>
      </IonSegment>
      {continueOver(kind, q) && <ContinueReading />}
      <StatusNote text={fv?.local ? t('articles.query_offline') : offline && !active && t('articles.offline')} testId="articles-offline" />
      {shown === null ? <div className="empty"><Busy /></div> : shown.length === 0
        ? <div className="empty" data-testid="articles-empty" role={active ? 'status' : undefined}>{t(active ? 'articles.nothing' : kind === SAVED ? 'articles.saved_empty' : 'articles.empty')}</div> : (
        <IonList data-testid="articles">
          {shown.map((a) => <ArticleRow key={a.id} a={a} onSelect={open} selected={wide && a.id === id} q={active ? q : undefined} mixed={kind === 'all' || kind === SAVED} />)}
        </IonList>
      )}
      {shown && shown.length > 0 && hasMore && (
        <MoreButton label={t('articles.more')} busy={more} onClick={loadMore} testId="articles-more" />
      )}
      <NetNotice failure={moreFailNow} onRetry={() => void loadMore()} testId="articles-more-net" />
      {shown && <ShareFooter title={t('articles.title')} url={sitePageUrl('/articles', lang, kind === SAVED ? 'all' : (kind as ArticleKind | 'all'))} />}
    </>
  );
  if (id != null && !wide)
    return (
      <IonPage>
        <PageHeader title={t('articles.title')} fit end={<><TextSizeButtons /><ArticleStar id={id} /></>} />
        <IonContent><ArticleView key={id} id={id} /></IonContent>
      </IonPage>
    );
  const sortBtn = canQuery && (
    <IonButton onClick={openSort} className="toolbar__sort" data-testid="sort-open" data-sort={sort}
      aria-label={sort === 'published' ? t('articles.sort') : `${t('articles.sort')}: ${t(`articles.sort_${sort}`)}`}>
      <IonIcon slot="icon-only" icon={swapVerticalOutline} aria-hidden="true" />
      {sort !== 'published' && <span className="toolbar__badge toolbar__badge--dot" aria-hidden="true" data-testid="sort-mark" />}
    </IonButton>
  );
  const header = searching && canQuery
    ? <PageHeader title={t('articles.title')} end={<>{sortBtn}{refresh.button}</>} search={
        <SearchField ref={searchbar} value={typed} placeholder={t('articles.search')} debounce={0} showClearButton="always" inputmode="search"
          onIonInput={(e) => setTyped(e.detail.value ?? '')} onIonClear={closeSearch} data-testid="articles-search" />} />
    : <PageHeader title={t('articles.title')} fit end={<>
        {canQuery && <IonButton onClick={() => setSearching(true)} aria-label={t('articles.search_open')} data-testid="search-open"><IonIcon slot="icon-only" icon={searchOutline} aria-hidden="true" /></IonButton>}
        {sortBtn}{refresh.button}{wide && id != null && <><TextSizeButtons /><ArticleStar id={id} /></>}</>} />;
  return (
    <IonPage>
      {header}
      <SplitContent wide={wide} before={refresh.puller} list={list} detailKey={id}
        detail={id != null ? <ArticleView key={id} id={id} /> : <div className="empty">{t('articles.pick')}</div>} />
    </IonPage>
  );
}
