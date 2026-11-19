import { IonButton, IonIcon, IonLabel, IonList, IonNote, IonPage } from '@ionic/react';
import { SearchField } from '@/components/SearchField';
import { ChipButton } from '@/components/ChipButton';
import { Busy } from '@/components/Busy';
import { closeCircle, mapOutline, optionsOutline } from 'ionicons/icons';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ShareFooter } from '@/components/ShareFooter';
import { scrollRoot, SplitContent, useListDetail } from '@/components/SplitContent';
import { sitePageUrl } from '@/data/links/sitePages';
import { PageHeader } from '@/components/PageHeader';
import { MonasteryRow } from '@/components/MonasteryRow';
import { useQuickHint } from '@/components/QuickSheet';
import { FilterSheet } from '@/components/FilterSheet';
import { EMPTY_FILTERS, clearOne, listQueryOf, type FilterKey, type FilterState } from '@/data/repo/filterState';
import { MonasteryCardView, MonasteryDetail } from '@/pages/MonasteryCard';
import { getFacets, listByCodes, listKeys, listMonasteries, type LeanRow as Row, type ListKey } from '@/data/repo/monasteries';
import { field, type Facets } from '@/data/repo/types';
import { currentPosition, type Position } from '@/native/geolocation';
import { useApp } from '@/state/AppContext';
import { sideRow } from '@/components/sideRow';
import { useWide } from '@/state/useWide';
import { tCount, type Lang } from '@/i18n';
import { EPARCHIES_PATH, useListEntry } from '@/app/nav';

const PAGE = 30;
/** PLAN 6: rows `from`…`from + PAGE` of the ordered keys, lean (one language), with the keys' distances */
async function pageOf(db: Parameters<typeof listByCodes>[0], keys: ListKey[], from: number, lang: Lang): Promise<Row[]> {
  const part = keys.slice(from, from + PAGE);
  const rows = await listByCodes(db, part.map((k) => k.code), lang);
  return rows.map((r, i) => (part[i]?.distance_km != null ? { ...r, distance_km: part[i].distance_km } : r));
}
/** a ref callback: `on` when the element comes within 600 px of the visible area (React 19 runs the returned cleanup) */
const nearEnd = (on: () => void) => (el: HTMLElement | null) => {
  if (!el) return;
  const io = new IntersectionObserver((es) => { if (es.some((e) => e.isIntersecting)) on(); }, { root: scrollRoot(el), rootMargin: '600px 0px' });
  io.observe(el);
  return () => io.disconnect();
};

const cardPath = (c: number) => `/monasteries/${c}`;

/** Spec §3: the offline list with search (typos; the list filters itself as one types — no dropdown, A-23 #3), the /map/ filter set + stream + near me, sort by name/distance. */
export function MonasteriesPage() {
  const { db, fts, t, lang, dict, visitedStat } = useApp();
  const wide = useWide();
  const navigate = useNavigate();
  const { selected, open } = useListDetail('code', wide, cardPath);
  const [q, setQ] = useState('');
  // PLAN 6: the ORDER and COUNT of the whole list (keys), the rows shown so far (pages of the interface language)
  const [shown, setList] = useState<{ keys: ListKey[]; rows: Row[] } | null>(null);
  const rows = shown?.rows ?? null;
  const [facets, setFacets] = useState<Facets | null>(null);
  const [fs, setFs] = useState<FilterState>(EMPTY_FILTERS);
  const [sheet, setSheet] = useState(false);
  const [pos, setPos] = useState<Position | null>(null);
  const [posError, setPosError] = useState(false);
  const debounce = useRef<number | undefined>(undefined);
  // A-138: the site's list link (`/monasteries/`) = this tab as if just opened: no search, no filters, the default order, the top
  const listTop = useRef<HTMLDivElement>(null);
  useQuickHint('monastery', !!shown && shown.rows.length > 0); // A-142 (4)
  useListEntry(() => { setQ(''); setFs(EMPTY_FILTERS); setSheet(false); listTop.current?.closest('ion-content')?.scrollToTop?.(0); });

  useEffect(() => {
    getFacets(db, fs.filters).then(setFacets); // the chips' names; the sheet counts its own draft (A-13)
  }, [db, fs.filters]);

  // the user's position only when asked for («near me» or distance sort)
  useEffect(() => {
    if (!(fs.nearMe || fs.sort === 'distance') || pos) return;
    currentPosition().then((p) => { setPos(p); setPosError(false); }).catch(() => setPosError(true));
  }, [fs.nearMe, fs.sort, pos]);

  const ctx = useMemo(() => ({ q, lang, pos }), [q, lang, pos]);
  const load = useCallback(async () => {
    const query = listQueryOf(fs, ctx);
    if (q.trim()) { const full = await listMonasteries(db, fts, query); setList({ keys: full, rows: full }); return; } // ≤ 100 hits, every language
    const keys = await listKeys(db, fts, query);
    setList({ keys, rows: await pageOf(db, keys, 0, lang) });
  }, [db, fts, fs, ctx, q, lang]);
  // the next page when the end of the shown rows comes near (an observer: the list may scroll in its own pane, ≥600 dp)
  const more = useCallback(async () => {
    if (!shown || shown.rows.length >= shown.keys.length) return;
    const next = await pageOf(db, shown.keys, shown.rows.length, lang);
    setList((l) => (l && l.keys === shown.keys && l.rows.length === shown.rows.length ? { keys: l.keys, rows: [...l.rows, ...next] } : l));
  }, [db, shown, lang]);

  useEffect(() => {
    window.clearTimeout(debounce.current);
    debounce.current = window.setTimeout(() => void load(), q ? 150 : 0);
    return () => window.clearTimeout(debounce.current);
  }, [load, q]);


  const activeChips = useMemo(() => {
    const chips: { k: FilterKey; label: string }[] = [];
    const f = fs.filters;
    if (f.type) chips.push({ k: 'type', label: dict[`type_${f.type}`] ?? f.type });
    if (f.object_type != null) chips.push({ k: 'object_type', label: dict[`object_type_${f.object_type}`] ?? '' });
    if (f.subordination != null) chips.push({ k: 'subordination', label: dict[`subordination_${f.subordination}`] ?? '' });
    if (f.eparchy_id != null && facets) chips.push({ k: 'eparchy_id', label: field(facets.eparchies.find((e) => e.id === f.eparchy_id) ?? {}, 'name', lang) });
    if (f.oblast_id != null && facets) chips.push({ k: 'oblast_id', label: field(facets.oblasts.find((o) => o.id === f.oblast_id) ?? {}, 'name', lang) });
    if (f.has_stream) chips.push({ k: 'has_stream', label: t('monasteries.has_stream') });
    if (f.visited) chips.push({ k: 'visited', label: t(f.visited === 'yes' ? 'visited.yes' : 'visited.no') });
    if (fs.nearMe) chips.push({ k: 'near', label: t('monasteries.radius', { km: fs.radiusKm }) });
    return chips;
  }, [fs, facets, dict, lang, t]);

  const searchbar = (
    <SearchField value={q} placeholder={t('monasteries.search')} debounce={0} onIonInput={(e) => setQ(e.detail.value ?? '')} inputmode="search" data-testid="search" />
  );
  const list = (
    <>
      {/* A-96 W-3: the count, «Єпархії» and the active filters = ONE block pinned under the header while only the rows scroll (`.list-pin`,
          the kind tabs' rule). D43: row 1 always «N обителей» … «Єпархії» (never wraps); row 2 only while filters are active: their
          chips, one line, scrolling sideways when they do not fit */}
      <div className="list-pin" data-testid="filters-pin" ref={listTop}>
      <div className="filters__row" data-testid="filters-row">
        <IonNote className="filters__count" data-testid="count" aria-live="polite">{shown ? tCount(t, lang, 'monasteries.count', shown.keys.length) : '\u00a0'}
          {/* A-133 (07:08): «· відвідано {n}» after the count, while anything is marked; the full «Відвідано {n} з {m}» for the screen reader */}
          {shown && visitedStat.n > 0 && <span className="filters__visited" data-testid="visited-count" aria-label={t('visited.count', visitedStat)}> · {t('visited.count_short', visitedStat)}</span>}
        </IonNote>
        {/* PLAN 7 (A-14) + A-96 W-3: «Єпархії» at the right of the filter row - THE filled button of the app (the photo placeholder's
            «Завантажити»: Ionic's solid small button), map icon kept, a 48 dp target */}
        <IonButton size="small" className="filters__end btn-target48" onClick={() => navigate(EPARCHIES_PATH)} data-testid="eparchies-open">
          <IonIcon slot="start" icon={mapOutline} aria-hidden="true" /><IonLabel>{t('eparchies.open')}</IonLabel>
        </IonButton>
      </div>
      {activeChips.length > 0 && (
        <div className="filters__chips" ref={sideRow} data-testid="active-chips">
          {activeChips.map((c) => (
            <ChipButton key={c.k} color="primary" onClick={() => setFs((s) => clearOne(s, c.k))} aria-label={t('monasteries.clear_one', { name: c.label })} data-testid={`chip-${c.k}`}>
              <IonLabel>{c.label}</IonLabel><IonIcon icon={closeCircle} aria-hidden="true" />
            </ChipButton>
          ))}
        </div>
      )}
      {posError && fs.nearMe && <IonNote color="danger" className="ion-padding-horizontal">{t('monasteries.no_location')}</IonNote>}
      </div>
      {!rows ? <div className="empty"><Busy /></div> : rows.length === 0 ? (
        <div className="empty" data-testid="empty">
          <p>{q.trim() ? t('monasteries.empty_q', { q: q.trim() }) : t('monasteries.empty')}</p>
          <p className="empty__hint">{t(activeChips.length ? 'monasteries.empty_hint_filters' : 'monasteries.empty_hint')}</p>
          {activeChips.length > 0 && <IonButton fill="outline" size="small" onClick={() => setFs(EMPTY_FILTERS)} data-testid="empty-reset">{t('monasteries.reset')}</IonButton>}
        </div>
      ) : (
        <IonList data-testid="list">
          {rows.map((r) => <MonasteryRow key={r.code} row={r} onSelect={open} onPage={open} selected={wide && r.code === selected} q={q} />)}
        </IonList>
      )}
      {shown && shown.rows.length < shown.keys.length && (
        <div className="list__more" ref={nearEnd(more)} data-testid="list-more"><Busy name="dots" /></div>
      )}
      {/* A-43: at the end of the list - once its last page is in */}
      {shown && shown.rows.length >= shown.keys.length && <ShareFooter title={t('monasteries.title')} url={sitePageUrl('/monasteries', lang)} />}
      {facets && <FilterSheet open={sheet} onClose={() => setSheet(false)} value={fs} onApply={setFs} hasPosition={!!pos} ctx={ctx} />}
    </>
  );

  // one route for list and card (`/monasteries/:code?`): on a phone the card replaces the list in place and the
  // list's search/filters/scroll survive the back navigation; on ≥600 dp both panes show side by side
  if (!wide && selected) {
    return (
      <IonPage>
        <MonasteryCardView code={selected} />
      </IonPage>
    );
  }
  return (
    <IonPage>
      {/* A-28 (owner 01.11 21:03, withdraws D39): the filter button sits in the toolbar right of the search, with the number of active
          filters; it is the ONE way to the sheet (the row under the search holds only the active chips, the count and «Єпархії») */}
      <PageHeader title={t('monasteries.title')} search={searchbar} end={
        <IonButton onClick={() => setSheet(true)} className="toolbar__filters" data-testid="filters-open"
          aria-label={activeChips.length ? `${t('monasteries.filters')}: ${activeChips.length}` : t('monasteries.filters')}>
          <IonIcon slot="icon-only" icon={optionsOutline} aria-hidden="true" />
          {activeChips.length > 0 && <span className="toolbar__badge" aria-hidden="true" data-testid="filters-count">{activeChips.length}</span>}
        </IonButton>} />
      <SplitContent wide={wide} list={list} listClassName="search-wrap" detailKey={selected}
        detail={selected ? <MonasteryDetail code={selected} /> : <div className="split__hint">{t('monasteries.select_hint')}</div>} />
    </IonPage>
  );
}
