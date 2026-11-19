import { IonContent, IonItem, IonLabel, IonList, IonNote, IonPage } from '@ionic/react';
import { SearchField } from '@/components/SearchField';
import { Busy } from '@/components/Busy';
import { bookOutline, globeOutline, peopleOutline, homeOutline } from 'ionicons/icons';
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { PageHeader } from '@/components/PageHeader';
import { MetaLine } from '@/components/MetaLine';
import { CoverImage, PhotoScope } from '@/components/CoverImage';
import { ExternalLinkRow, InfoRow } from '@/components/InfoRow';
import { MonasteryRow } from '@/components/MonasteryRow';
import { eparchyTitle, getEparchy, listEparchies, type EparchyRow } from '@/data/repo/eparchies';
import { listMonasteries } from '@/data/repo/monasteries';
import { field, type MonasteryListRow as Row } from '@/data/repo/types';
import { MiniMap } from '@/components/MiniMap';
import { useApp } from '@/state/AppContext';
import { useWide } from '@/state/useWide';
import { tCount } from '@/i18n';
import { ShareFooter } from '@/components/ShareFooter';
import { SplitContent, useListDetail } from '@/components/SplitContent';
import { sitePageUrl } from '@/data/links/sitePages';
import { siteUrl } from '@/native/intents';
import { EPARCHIES_PATH, eparchyPath, useListEntry } from '@/app/nav';

const hostOf = (url: string): string => { try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return url; } };



/** ONE eparchy row (the list's row classes: picture · title · the site's two counts). */
function EparchyListRow({ e, onSelect, selected }: { e: EparchyRow; onSelect: (id: number) => void; selected?: boolean }) {
  const { t, lang } = useApp();
  return (
    <IonItem button detail={false} onClick={() => onSelect(e.id)} color={selected ? 'light' : undefined} className="mrow" data-testid={`erow-${e.id}`}>
      <CoverImage small keep code={`ep-${e.id}`} url={e.image_url} alt="" className="mrow__cover mrow__cover--map" />
      <IonLabel>
        {/* the owner 01.11 (after A-25 #0): the list prints the bare name — the screen is «Єпархії УПЦ», «єпархія» is said once */}
        <h2 className="mrow__title">{field(e, 'name', lang)}</h2>
        {/* …and «Насельників» on a line of its own */}
        <div data-testid="ep-counts">
          <MetaLine groups={[`${t('eparchies.monasteries')}: ${e.monasteries}`]} />
          {e.residents != null && <MetaLine groups={[`${t('eparchies.residents')}: ${e.residents}`]} />}
        </div>
      </IonLabel>
    </IonItem>
  );
}

/**
 * PLAN 7 «Єпархії УПЦ» (A-14, R-15; A-22: the first item of «Ще», and a button on the monasteries list): the list with a search,
 * «Монастирів: N» (the DB) and «Насельників: N» (the export); the page = the eparchy's map picture (A-20 photo rule), the intro,
 * the counts, its houses on the app's map, its houses as list rows (lavras first), Wikipedia. Two panes on ≥ 600 dp. Offline.
 */
export function EparchiesPage() {
  const { db, t, lang } = useApp();
  const wide = useWide();
  const { selected, open } = useListDetail('id', wide, eparchyPath);
  const [q, setQ] = useState('');
  useListEntry(() => setQ('')); // A-138: the site's `/dioceses/` = the list as if just opened
  const [rows, setRows] = useState<EparchyRow[] | null>(null);
  useEffect(() => { let on = true; void listEparchies(db, lang, q).then((r) => on && setRows(r)); return () => { on = false; }; }, [db, lang, q]);

  if (!wide && selected) return <IonPage><EparchyView id={selected} /></IonPage>;
  const searchbar = <SearchField value={q} placeholder={t('eparchies.search')} debounce={0} onIonInput={(e) => setQ(e.detail.value ?? '')} inputmode="search" data-testid="eparchy-search" />;
  return (
    <IonPage>
      <PageHeader title={t('more.eparchies')} search={searchbar} />
      <SplitContent wide={wide} detailKey={selected} detailTestId="eparchy-pane" list={<>
            <div className="filters__row">
              {rows && <IonNote className="filters__count" data-testid="eparchy-count">{tCount(t, lang, 'eparchies.count', rows.length)}</IonNote>}
            </div>
            {!rows ? <div className="empty"><Busy /></div> : rows.length === 0 ? <div className="empty" data-testid="eparchy-empty">{t('eparchies.empty')}</div> : (
              <IonList data-testid="eparchy-list">
                {rows.map((e) => <EparchyListRow key={e.id} e={e} onSelect={open} selected={wide && e.id === selected} />)}
              </IonList>
            )}
            {rows && <ShareFooter title={t('more.eparchies')} url={sitePageUrl(EPARCHIES_PATH, lang)} />}
          </>}
        detail={selected ? <EparchyDetail id={selected} /> : <div className="split__hint">{t('monasteries.select_hint')}</div>} />
    </IonPage>
  );
}

/** The phone's page: its own toolbar (back = the list, «Інші єпархії»). */
function EparchyView({ id }: { id: number }) {
  const { t } = useApp();
  return (
    <>
      <PageHeader title={t('more.eparchies')} />
      <IonContent><EparchyDetail id={id} /></IonContent>
    </>
  );
}

function EparchyDetail({ id }: { id: number }) {
  const { db, fts, t, lang, dict } = useApp();
  const navigate = useNavigate();
  const [data, setData] = useState<{ e: EparchyRow | null; houses: Row[] } | undefined>(undefined);
  useEffect(() => {
    let on = true;
    void (async () => {
      const e = await getEparchy(db, id);
      const houses = e ? await listMonasteries(db, fts, { lang, filters: { eparchy_id: id } }) : [];
      if (on) setData({ e, houses });
    })();
    return () => { on = false; };
  }, [db, fts, id, lang]);
  if (data === undefined) return <div className="empty"><Busy /></div>;
  const { e, houses } = data;
  if (!e) return <div className="empty">{t('eparchies.not_found')}</div>;
  const credit = e.credit_json ? (JSON.parse(e.credit_json) as Record<string, string | null>) : null;
  const creditUrl = credit ? credit[lang] ?? credit.uk ?? null : null;
  const about = field(e, 'about', lang);
  const title = eparchyTitle(e, lang, dict);
  return (
    <PhotoScope>
      <article data-testid="eparchy">
        {e.image_url && (
          <CoverImage keep code={`ep-${e.id}`} url={e.image_url} alt={title} className="eparchy__map" full
            ratio={e.image_w && e.image_h ? e.image_w / e.image_h : undefined} openable />
        )}
        <h1 className="card__title" data-testid="eparchy-title">{title}</h1>
        {about && <p className="card__sub">{about}</p>}
        <section className="infos">
          <InfoRow label={t('eparchies.monasteries')} icon={homeOutline} testId="eparchy-monasteries">{houses.length}</InfoRow>
          {e.residents != null && <InfoRow label={t('eparchies.residents')} icon={peopleOutline} testId="eparchy-residents">{e.residents}</InfoRow>}
          {/* A-25 #4 (R-23): the eparchy's own site before Wikipedia, as /dioceses/<id>/ prints it; its host under the title */}
          {e.own_site_url && <ExternalLinkRow lead={globeOutline} url={e.own_site_url} title={t('eparchies.own_site')} caption={hostOf(e.own_site_url)} testId="eparchy-site" />}
          {e.wiki_url && <ExternalLinkRow lead={bookOutline} url={e.wiki_url} title={t('eparchies.wiki')} testId="eparchy-wiki" />}
        </section>
        {/* PLAN 5: the eparchy's houses on THE map set-up, framed as `/map?eparchy=` frames them; a tap opens that map */}
        {houses.some((h) => h.lat != null) && (
          <MiniMap key={`${e.id}-${lang}`} houses={houses} label={t('eparchies.on_map')} onOpen={() => navigate(`/map?eparchy=${e.id}`)} testId="eparchy-map" />
        )}
        <section className="units" data-testid="eparchy-houses">
          <h2 className="inok-heading">{t('eparchies.houses')}</h2>
          {houses.map((h) => <MonasteryRow key={h.code} row={h} onSelect={(c) => navigate(`/monasteries/${c}`)} />)}
        </section>
        {creditUrl && <ExternalLinkRow url={creditUrl} title={t('eparchies.credit')} testId="eparchy-credit" />}
      </article>
      {e.site_url && <ShareFooter title={title} url={siteUrl(e.site_url, lang)} />}
    </PhotoScope>
  );
}
