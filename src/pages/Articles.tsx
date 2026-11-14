import { IonButton, IonContent, IonIcon, IonLabel, IonList, IonPage, IonSearchbar, IonSegment, IonSegmentButton, useIonActionSheet } from '@ionic/react';
import { checkmark, searchOutline, swapVerticalOutline } from 'ionicons/icons';
import { Busy } from '@/components/Busy';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
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
import { SplitContent } from '@/components/SplitContent';
import { StatusNote } from '@/components/StatusNote';
import { sitePageUrl } from '@/data/links/sitePages';
import { useWide } from '@/state/useWide';

/** A-97: the order chosen for ALL tabs, kept while the app runs (the page may be rebuilt), the default after a restart («Не запоминать») */
let sessionSort: ArticleSort = 'published';
/** A-97: the server is asked ~400 ms after typing stops (one request per pause, never per letter; R-44 allows 240 per 10 min) */
export const QUERY_DEBOUNCE_MS = 400;

/**
 * Stage 4 (spec §6, A-19): the site's feed — publications, video, news — the newest 30 in the device cache (offline, with covers),
 * a kind tab pages the server's section list (R-19: `articles?kind=`; the cached items of that kind show first and offline); «Показати більше» pages further while online, not cached.
 * `?id=` opens an article (push tap, contract §4; the home «Нове на сайті»); on ≥600 dp list and article side by side.
 */
export function ArticlesPage() {
  const { db, t, lang, articlesVersion, refreshArticles, config } = useApp();
  const wide = useWide();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const id = params.get('id') ? Number(params.get('id')) : null;
  const [kind, setKind] = useState<string>('all');
  const [items, setItems] = useState<Article[] | null>(null);
  const [next, setNext] = useState<string | null>(null);
  const [offline, setOffline] = useState(false);
  const [more, setMore] = useState(false);
  const [older, setOlder] = useState<{ items: Article[]; next: string | null } | null>(null);
  // R-19: a kind tab pages the server's section list; the cache of that kind shows first (and offline)
  const [server, setServer] = useState<{ kind: string; items: Article[]; next: string | null } | null>(null);
  useEffect(() => {
    if (kind === 'all') return;
    let on = true;
    fetchKind(lang, kind as ArticleKind, null).then((p) => on && setServer({ kind, ...p }), () => on && setOffline(true));
    return () => { on = false; };
  }, [lang, kind]);
  useEffect(() => {
    let on = true;
    Promise.all([listArticles(db, lang, kind === 'all' ? null : kind), nextCursor(db, lang)]).then(([i, n]) => { if (on) { setItems(i); setNext(n); } });
    return () => { on = false; };
  }, [db, lang, kind, articlesVersion]);
  const refresh = useRefresh(useCallback(async () => { setOffline(!(await refreshArticles())); }, [refreshArticles]));
  // A-97 (R-44): search + sort in the header - only when the server takes them (`config.features.articles_query`)
  const canQuery = !!config?.features.articles_query;
  const [searching, setSearching] = useState(false);
  const [typed, setTyped] = useState('');
  const [q, setQ] = useState('');
  const sorts = articleSorts(config?.features); // R-48: views_week / rating only when the server takes them (P2)
  const [chosen, setSortS] = useState<ArticleSort>(sessionSort);
  const sort: ArticleSort = sorts.includes(chosen) ? chosen : 'published'; // a kept v2 order on a server without it = the default
  const setSort = (s: ArticleSort) => { sessionSort = s; setSortS(s); };
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
    const k = kind === 'all' ? null : (kind as ArticleKind);
    fetchQuery(db, lang, k, q, sort, null, c.signal)
      .then((p) => { if (on) setFound({ key: qKey, items: p.items, next: p.next, local: false }); })
      .catch(async () => { // offline (or refused): the saved 30 of this tab, filtered and ordered here, with the note
        if (!on) return;
        const base = await listArticles(db, lang, k);
        if (on) setFound({ key: qKey, items: localQuery(base, q, sort), next: null, local: true });
      });
    return () => { on = false; c.abort(); };
  }, [active, qKey, db, lang, kind, q, sort]);
  const [sheet] = useIonActionSheet();
  const openSort = () => void sheet({
    header: t('articles.sort'), cssClass: 'sort-sheet',
    buttons: [...sorts.map((s) => ({ text: t(`articles.sort_${s}`), icon: s === sort ? checkmark : undefined, cssClass: s === sort ? 'sort-sheet__on' : undefined,
      htmlAttributes: { role: 'radio', 'aria-checked': s === sort ? 'true' : 'false', 'data-testid': `sort-${s}` }, handler: () => setSort(s) })),
    { text: t('common.cancel'), role: 'cancel' }],
  });
  const closeSearch = () => { setSearching(false); setTyped(''); setQ(''); };
  const tab = server && server.kind === kind ? server : null;
  const loadMore = async () => {
    setMore(true);
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
    } catch { setOffline(true); } finally { setMore(false); }
  };
  const open = (a: number) => navigate(`/articles?id=${a}`);
  const shown = active ? (fv ? fv.items : null) : tab ? tab.items : items && [...items, ...(older?.items ?? []).filter((a) => (kind === 'all' || a.kind === kind) && !items.some((b) => b.id === a.id))];
  const hasMore = active ? !!fv?.next : tab ? !!tab.next : older ? !!older.next : !!next;
  const list = (
    <>
      <IonSegment value={kind} onIonChange={(e) => setKind(String(e.detail.value))} scrollable className="kinds list-pin" data-testid="kinds" data-query={fv ? qKey : undefined}>
        {['all', ...ARTICLE_KINDS].map((k) => <IonSegmentButton key={k} value={k} data-testid={`kind-tab-${k}`}><IonLabel>{t(k === 'all' ? 'articles.all' : `kind.${k}`)}</IonLabel></IonSegmentButton>)}
      </IonSegment>
      <StatusNote text={fv?.local ? t('articles.query_offline') : offline && !active && t('articles.offline')} testId="articles-offline" />
      {shown === null ? <div className="empty"><Busy /></div> : shown.length === 0
        ? <div className="empty" data-testid="articles-empty" role={active ? 'status' : undefined}>{t(active ? 'articles.nothing' : 'articles.empty')}</div> : (
        <IonList data-testid="articles">
          {shown.map((a) => <ArticleRow key={a.id} a={a} onSelect={open} selected={wide && a.id === id} q={active ? q : undefined} />)}
        </IonList>
      )}
      {shown && shown.length > 0 && hasMore && (
        <MoreButton label={t('articles.more')} busy={more} onClick={loadMore} testId="articles-more" />
      )}
      {shown && <ShareFooter title={t('articles.title')} url={sitePageUrl('/articles', lang, kind as ArticleKind | 'all')} />}
    </>
  );
  if (id != null && !wide)
    return (
      <IonPage>
        <PageHeader title={t('articles.title')} fit end={<TextSizeButtons />} />
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
        <IonSearchbar ref={searchbar} value={typed} placeholder={t('articles.search')} debounce={0} showClearButton="always" inputmode="search"
          onIonInput={(e) => setTyped(e.detail.value ?? '')} onIonClear={closeSearch} data-testid="articles-search" />} />
    : <PageHeader title={t('articles.title')} fit end={<>
        {canQuery && <IonButton onClick={() => setSearching(true)} aria-label={t('articles.search_open')} data-testid="search-open"><IonIcon slot="icon-only" icon={searchOutline} aria-hidden="true" /></IonButton>}
        {sortBtn}{refresh.button}{wide && id != null && <TextSizeButtons />}</>} />;
  return (
    <IonPage>
      {header}
      <SplitContent wide={wide} before={refresh.puller} list={list} detailKey={id}
        detail={id != null ? <ArticleView key={id} id={id} /> : <div className="empty">{t('articles.pick')}</div>} />
    </IonPage>
  );
}
