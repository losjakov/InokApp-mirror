import { IonButton, IonButtons, IonIcon, IonContent, IonHeader, IonItem, IonLabel, IonList, IonModal, IonRange, IonSelect, IonSelectOption, IonTitle, IonToggle, IonToolbar } from '@ionic/react';
import { useEffect, useState } from 'react';
import type { FacetValue, Facets, Filters, NamedRow } from '@/data/repo/types';
import { getFacets } from '@/data/repo/monasteries';
import { field } from '@/data/repo/types';
import { useApp } from '@/state/AppContext';
import { EMPTY_FILTERS, clearOne, countFor, type FilterKey, type FilterState, type ListContext } from '@/data/repo/filterState';
import { closeCircle } from 'ionicons/icons';
import { tCount } from '@/i18n';

interface Props {
  open: boolean;
  onClose: () => void;
  value: FilterState;
  onApply: (v: FilterState) => void;
  hasPosition: boolean;
  /** the list's context (search text, language, position): the button's count = what the list will show (D19) */
  ctx: ListContext;
}

const RADII = [5, 10, 25, 50, 100, 200];

/** Filters = the site's /map/ facet set (values from the export, labels from the dictionary) + «has stream» + «near me».
 *  DEPENDENT as /monasteries/ (A-13): after every change the other lists are recounted from the DB for the draft; a value
 *  with no house is not offered, every value shows its count, so an impossible combination cannot be chosen. */
export function FilterSheet(props: Props) {
  // D33: no focusable drag handle — Ionic's modal sends its own focus to the handle (onModalFocus) while a select's popover,
  // still dismissing, traps focus back: the two recursed (RangeError ×25). The sheet still drags by its header.
  return (
    <IonModal isOpen={props.open} onDidDismiss={props.onClose} initialBreakpoint={0.9} breakpoints={[0, 0.9, 1]} handle={false} data-testid="filter-sheet">
      {props.open && <SheetBody {...props} />}
    </IonModal>
  );
}

function SheetBody({ onClose, value, onApply, hasPosition, ctx }: Props) {
  const { db, fts, t, lang, dict } = useApp();
  const [v, setV] = useState<FilterState>(value);
  const [facets, setFacets] = useState<Facets | null>(null);
  const [count, setCount] = useState<number | null>(null);
  useEffect(() => { getFacets(db, v.filters).then(setFacets); }, [db, v.filters]);
  useEffect(() => { let on = true; countFor(db, fts, v, ctx).then((n) => on && setCount(n)); return () => { on = false; }; }, [db, fts, v, ctx]);
  const col = new Intl.Collator(lang, { sensitivity: 'base' });
  const set = (patch: Partial<Filters>) => setV((s) => ({ ...s, filters: { ...s.filters, ...patch } }));
  // A-21(в): a chosen filter gets its own «×» — it clears THAT filter only, the other lists recount at once (A-13)
  const clear = (k: FilterKey, current: unknown, label: string) => current != null && current !== '' && (
    <IonButton slot="end" fill="clear" size="small" className="filter__clear" onClick={() => setV((s) => clearOne(s, k))} aria-label={t('monasteries.clear_one', { name: label })} data-testid={`clear-${k}`}>
      <IonIcon slot="icon-only" icon={closeCircle} aria-hidden="true" />
    </IonButton>
  );
  const named = (rows: (NamedRow & { n: number })[], current: number | null | undefined, key: keyof Filters, label: string) => (
    <IonItem>
      <IonSelect label={label} value={current ?? ''} placeholder={t('common.all')} interface="action-sheet" cancelText={t('common.cancel')}
        onIonChange={(e) => set({ [key]: e.detail.value === '' ? null : Number(e.detail.value) })}>
        <IonSelectOption value="">{t('common.all')}</IonSelectOption>
        {[...rows].sort((a, b) => col.compare(field(a, 'name', lang), field(b, 'name', lang))).map((r) => (
          <IonSelectOption key={r.id} value={r.id}>{`${field(r, 'name', lang)} (${r.n})`}</IonSelectOption>
        ))}
      </IonSelect>
      {clear(key as FilterKey, current, label)}
    </IonItem>
  );
  const coded = (vals: FacetValue<string | number>[], current: string | number | null | undefined, key: keyof Filters, label: string, prefix: string) => (
    <IonItem>
      <IonSelect label={label} value={current ?? ''} placeholder={t('common.all')} interface="popover" cancelText={t('common.cancel')}
        onIonChange={(e) => set({ [key]: e.detail.value === '' ? null : typeof vals[0]?.v === 'number' ? Number(e.detail.value) : e.detail.value })}>
        <IonSelectOption value="">{t('common.all')}</IonSelectOption>
        {vals.map((x) => <IonSelectOption key={x.v} value={x.v}>{`${dict[`${prefix}${x.v}`] ?? String(x.v)} (${x.n})`}</IonSelectOption>)}
      </IonSelect>
      {clear(key as FilterKey, current, label)}
    </IonItem>
  );
  return (
    <>
      <IonHeader>
        <IonToolbar>
          <IonTitle>{t('monasteries.filters')}</IonTitle>
          <IonButtons slot="end">
            <IonButton onClick={() => setV(EMPTY_FILTERS)}>{t('monasteries.reset')}</IonButton>
          </IonButtons>
        </IonToolbar>
      </IonHeader>
      <IonContent>
        {facets && <IonList data-testid="filter-list">
          {coded(facets.types, v.filters.type, 'type', dict.facet_type ?? t('monasteries.filters'), 'type_')}
          {coded(facets.object_types, v.filters.object_type, 'object_type', dict.facet_object_type ?? '', 'object_type_')}
          {coded(facets.subordinations, v.filters.subordination, 'subordination', dict.facet_subordination ?? '', 'subordination_')}
          {named(facets.eparchies, v.filters.eparchy_id, 'eparchy_id', dict.facet_eparchy ?? '')}
          {named(facets.oblasts, v.filters.oblast_id, 'oblast_id', dict.facet_oblast ?? '')}
          {/* A-133: «Я тут був» - three states, with the other filters (the counts under them, A-13) */}
          <IonItem data-testid="filter-visited">
            <IonSelect label={t('visited.filter')} value={v.filters.visited ?? ''} interface="popover" cancelText={t('common.cancel')}
              onIonChange={(e) => set({ visited: e.detail.value === '' ? null : e.detail.value })}>
              <IonSelectOption value="">{t('visited.all')}</IonSelectOption>
              <IonSelectOption value="yes" disabled={facets.visited.yes === 0 && v.filters.visited !== 'yes'}>{`${t('visited.yes')} (${facets.visited.yes})`}</IonSelectOption>
              <IonSelectOption value="no" disabled={facets.visited.no === 0 && v.filters.visited !== 'no'}>{`${t('visited.no')} (${facets.visited.no})`}</IonSelectOption>
            </IonSelect>
            {clear('visited', v.filters.visited, t('visited.filter'))}
          </IonItem>
          <IonItem>
            <IonToggle checked={!!v.filters.has_stream} disabled={!v.filters.has_stream && facets.streams === 0} onIonChange={(e) => set({ has_stream: e.detail.checked })}>{`${t('monasteries.has_stream')} (${facets.streams})`}</IonToggle>
          </IonItem>
          <IonItem>
            <IonToggle checked={v.nearMe} onIonChange={(e) => setV((s) => ({ ...s, nearMe: e.detail.checked, sort: e.detail.checked ? 'distance' : s.sort }))}>
              {t('monasteries.near_me')}
            </IonToggle>
          </IonItem>
          {v.nearMe && (
            <IonItem lines="none">
              <IonRange aria-label={t('monasteries.radius', { km: v.radiusKm })} min={0} max={RADII.length - 1} step={1} snaps pin
                pinFormatter={(i) => t('monasteries.radius_short', { km: RADII[i] })} value={Math.max(0, RADII.indexOf(v.radiusKm))}
                onIonChange={(e) => setV((s) => ({ ...s, radiusKm: RADII[Number(e.detail.value)] }))}>
                <IonLabel slot="start">{t('monasteries.radius', { km: v.radiusKm })}</IonLabel>
              </IonRange>
            </IonItem>
          )}
          {!hasPosition && v.nearMe && <IonItem lines="none"><IonLabel color="medium" className="ion-text-wrap">{t('monasteries.no_location')}</IonLabel></IonItem>}
          <IonItem>
            <IonSelect label={t('monasteries.sort')} value={v.sort} interface="popover" onIonChange={(e) => setV((s) => ({ ...s, sort: e.detail.value }))}>
              <IonSelectOption value="name">{t('monasteries.sort_name')}</IonSelectOption>
              <IonSelectOption value="distance" disabled={!hasPosition && !v.nearMe}>{t('monasteries.sort_distance')}</IonSelectOption>
            </IonSelect>
          </IonItem>
        </IonList>}
        <div className="ion-padding">
          <IonButton expand="block" disabled={count === 0} data-testid="filters-apply" onClick={() => { onApply(v); onClose(); }}>
            {count == null ? t('monasteries.apply') : count === 0 ? t('monasteries.show_none') : tCount(t, lang, 'monasteries.show', count)}
          </IonButton>
        </div>
      </IonContent>
    </>
  );
}
