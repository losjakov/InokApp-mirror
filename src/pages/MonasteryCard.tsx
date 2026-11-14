import { IonButton, IonContent, IonIcon } from '@ionic/react';
import { Busy } from '@/components/Busy';
import { FLASH_MS, useToast } from '@/components/toast';
import { callOutline, copyOutline, globeOutline, imagesOutline, linkOutline, openOutline, mailOutline, mapOutline, navigateOutline, shareSocialOutline, star, starOutline, videocamOutline } from 'ionicons/icons';
import { useEffect, useRef, useState } from 'react';
import { useViewsEye } from '@/components/ViewsEye';
import { Link, useNavigate } from 'react-router-dom';
import { PageHeader } from '@/components/PageHeader';
import { DirectionsSheet } from '@/components/DirectionsSheet';
import { CoverImage, LoadAllPhotos, PhotoScope } from '@/components/CoverImage';
import { onePhoto, PhotoViewer, viewerPhotos, type ViewerSet } from '@/components/PhotoViewer';
import { cardGallery, galleryInApp } from '@/data/photos/gallery';
import { HtmlLite } from '@/components/HtmlLite';
import { Collapsible } from '@/components/Collapsible';
import { ExternalLinkRow, InfoRow } from '@/components/InfoRow';
import { RelatedBlocks } from '@/components/RelatedBlocks';
import { ScrollArrows } from '@/components/ScrollArrows';
import { longDate } from '@/i18n/date';
import { getMonastery, getUnits } from '@/data/repo/monasteries';
import { MonasteryRow as HouseRow } from '@/components/MonasteryRow';
import { phoneGroups } from '@/data/repo/phones';
import { getChannelOfMonastery } from '@/data/repo/channels';
import { field, headBorn, revivalLabel, rowParts, rowSubtitle, type ChannelRow, type MonasteryListRow, type MonasteryRow } from '@/data/repo/types';
import { EPARCHIES_PATH, eparchyPath } from '@/app/nav';
import { detailHref } from '@/components/SplitContent';
import { callPhone, mailTo, openLink, shareUrl, siteUrl } from '@/native/intents';
import { useOpenChannel } from '@/components/StreamRow';
import { useApp } from '@/state/AppContext';
import { churchOutline } from '@/components/icons';
import { useWide } from '@/state/useWide';
import { sideRow } from '@/components/sideRow';
import { LANGS, type Lang } from '@/i18n';

/** The favourite star: in the toolbar on a phone, at the end of the title row on ≥600 dp (REVIEW cloud_02 D6; D49: not over the cover). */
function FavButton({ code }: { code: number }) {
  const { t, favourites, toggleFavourite } = useApp();
  const fav = favourites.has(code);
  const toast = useToast();
  // A-96 W-6: ~2 s above the tab bar, a new one replaces the old; read by TalkBack (role status)
  const tap = async () => { await toggleFavourite(code); toast(t(fav ? 'card.favourite_removed' : 'card.favourite_added'), { duration: FLASH_MS, testId: 'fav-toast' }); };
  return (
    <IonButton fill="clear" onClick={() => void tap()} data-on={fav ? "1" : "0"} aria-pressed={fav} aria-label={fav ? t('card.favourite_remove') : t('card.favourite_add')} data-testid="fav">
      <IonIcon slot="icon-only" icon={fav ? star : starOutline} color={fav ? 'secondary' : undefined} aria-hidden="true" />
    </IonButton>
  );
}

/** The card as the phone shows it (the list page renders this when a code is in the URL and the screen is narrow). */
export function MonasteryCardView({ code }: { code: number }) {
  const { t } = useApp();
  return (
    <>
      <PageHeader title={t('monasteries.title')} end={<FavButton code={code} />} />
      <IonContent>
        <MonasteryDetail code={code} />
      </IonContent>
    </>
  );
}

/** Keyed by code and language so every state below starts fresh for a new card. */
export function MonasteryDetail({ code }: { code: number }) {
  const { lang } = useApp();
  return <Detail key={`${code}-${lang}`} code={code} />;
}

const host = (url: string) => url.replace(/^https?:\/\//, '').replace(/\/$/, '');

/**
 * A-81 (3): the card's place line (the list row's words, `rowParts`) with the eparchy name a link to its page in the app, in the link
 * colour (phone: the page pushed; tablet: «Єпархії УПЦ» with it selected - R2's query form). Back = the card.
 * A-96 W-2: «town · oblast» is line 1 with NO separator after it; the eparchy ALWAYS starts line 2 (also where one line would fit - the
 * tablet's pane), the eye at the right of its last line (A-91). No eparchy / an id the export does not know = the plain words, one line.
 */
function PlaceLine({ row, wide }: { row: MonasteryRow; wide: boolean }) {
  const { lang, dict } = useApp();
  const p = rowParts(row, lang, dict);
  if (row.eparchy_id == null || !p.eparchy) return <>{rowSubtitle(row, lang, dict)}</>;
  const before = [p.town, p.oblast].filter(Boolean).join(' · ');
  return (
    <>{before && <span className="card__place1" data-testid="card-place1">{before}</span>}<Link to={detailHref(EPARCHIES_PATH, 'id', row.eparchy_id, wide, eparchyPath)} className="card__eparchy" data-testid="card-eparchy">{p.eparchy}</Link></>
  );
}

/** One label-over-value row of the card's facts (the site's «Офіційна назва: …», «Телефони: …», «GPS …»). */
function Detail({ code }: { code: number }) {
  const { db, t, lang, dict, config } = useApp();
  const wide = useWide();
  const [viewer, setViewer] = useState<ViewerSet | null>(null);
  const asking = useRef(false);
  const [data, setData] = useState<{ row: MonasteryRow | null; channel: ChannelRow | null; parent: MonasteryRow | null; units: MonasteryListRow[] } | undefined>(undefined);
  const [histLang, setHistLang] = useState<Lang | null>(null);
  const [dirs, setDirs] = useState(false);
  const [coverShown, setCoverShown] = useState(false);
  const root = useRef<HTMLElement>(null);
  const eye = useViewsEye({ kind: 'monastery', code }, root); // A-65: the site's eye beside the card's line, one view by its rules
  const toast = useToast();
  const navigate = useNavigate();
  const openChannel = useOpenChannel();

  useEffect(() => {
    let on = true;
    getMonastery(db, code).then(async (row) => {
      const channel = row ? await getChannelOfMonastery(db, code) : null;
      // A-10 (R-11): the parent this house is a canonical unit of, and (on a parent) its units in the site's order
      const parent = row?.parent_code != null ? await getMonastery(db, row.parent_code) : null;
      const units = row ? await getUnits(db, row, lang) : [];
      if (on) setData({ row, channel, parent, units });
    });
    return () => { on = false; };
  }, [db, code, lang]);

  if (data === undefined) return <div className="empty"><Busy /></div>;
  const { row, channel, parent, units } = data;
  if (!row) return <div className="empty">{t('card.not_found')}</div>;

  const name = field(row, 'name', lang);
  const phones: string[] = JSON.parse(row.phones_json || '[]');
  const firstDial = phoneGroups(phones).find((g) => g.dial)?.dial ?? null;
  const r = row as unknown as Record<string, string | null>;
  // the history in the app's language rules; the UK / RU / EN tabs appear ONLY when it is missing in that language (D6)
  const historyLangs = LANGS.filter((l) => r[`history_${l}`]);
  const ownHistory = !!r[`history_${lang}`];
  const shownLang = ownHistory ? lang : (histLang ?? historyLangs[0] ?? null);
  const history = shownLang ? r[`history_${shownLang}`] : null;
  const sources: { n: number; title?: string; publication?: string; year?: string; url?: string }[] = JSON.parse(row.history_sources_json || '[]');
  const pageUrl = siteUrl(row.site_url, lang);
  const langName = (l: Lang) => t(`language.${l}`);
  const hasGeo = row.lat != null && row.lon != null;
  const gps = hasGeo ? `${row.lat}, ${row.lon}` : '';
  const copyGps = async () => {
    try { await navigator.clipboard.writeText(gps); toast(t('card.copied'), { duration: 1500 }); } catch { /* no clipboard (old WebView) */ }
  };
  const typeKey = row.type === 'm' || row.type === 'f' ? row.type : null;
  // R-10 (31.10): the five fields the site's card prints; labels from the export's dictionary, null rows are not printed
  const headRole = field(row, 'head_role', lang);
  const links: { title: Partial<Record<Lang, string | null>>; url: string }[] = JSON.parse(row.links_json || '[]');
  const pick = (o: Partial<Record<Lang, string | null>>) => field(Object.fromEntries(Object.entries(o).map(([k, v]) => [`t_${k}`, v])), 't', lang);

  // A-98 / A-109: the gallery in THE viewer (A-96) when the server answers R-49; the list is asked on THIS tap, never ahead
  const inApp = galleryInApp(config) && row.photo_count > 0;
  const coverUrl = row.cover_large_url ?? row.cover_url;
  const openGallery = async (cover: string | null) => {
    if (asking.current) return; // one request per tap
    asking.current = true;
    const r = await cardGallery(row.code, name, lang).finally(() => { asking.current = false; });
    if (r.kind === 'photos') setViewer({ at: 0, photos: viewerPhotos(r.items, row.code) });
    else if (r.kind === 'offline' && cover === null) toast(t('card.gallery_offline'), { duration: FLASH_MS, testId: 'gallery-offline' }); // A-110, ~2 s as the star's
    else if (coverUrl) setViewer(onePhoto(row.code, coverUrl, cover, name)); // offline cover / the server has none: the cover alone, as 1.0.7
  };

  const actions: { k: string; icon: string; label: string; on: () => void; testId?: string }[] = [
    ...(firstDial ? [{ k: 'call', icon: callOutline, label: t('card.call_short'), on: () => callPhone(firstDial), testId: 'call' }] : []),
    ...(row.website ? [{ k: 'site', icon: globeOutline, label: t('card.site_short'), on: () => openLink(row.website!, lang) }] : []),
    ...(hasGeo ? [{ k: 'route', icon: navigateOutline, label: t('card.route'), on: () => setDirs(true) },
                  { k: 'map', icon: mapOutline, label: t('card.show_on_map'), on: () => navigate(`/map?code=${row.code}`), testId: 'show-on-map' }] : []),
    ...(channel ? [{ k: 'stream', icon: videocamOutline, label: t('card.stream'), on: () => openChannel(channel), testId: 'card-stream' }] : []),
    { k: 'share', icon: shareSocialOutline, label: t('common.share'), on: () => void shareUrl(name, pageUrl) },
  ];

  return (
    <PhotoScope>
    <article data-testid="card" ref={root} className="arrows-host">
      <div className="card__cover-wrap">
        <CoverImage code={row.code} url={coverUrl} alt={name} className="card__cover" full onShown={setCoverShown}
          openable={inApp ? { open: (shown) => void openGallery(shown), label: t('card.gallery_open') } : true} />
        {/* A-23 #6: only over a cover that is really shown. A-109: in the app's viewer (no «opens outside» sign; no thumbnail grid on the
            card - the photos appear only in the viewer); a server without R-49 = 1.0.7's site gallery, the sign kept */}
        {coverShown && row.photo_count > 0 && (inApp || row.gallery_url) && (
          <button type="button" className="over-photo card__photos" onClick={() => (inApp ? void openGallery(null) : openLink(row.gallery_url!, lang))}
            aria-label={t(inApp ? 'card.gallery_open' : 'card.gallery_hint')} data-testid="gallery" data-in-app={inApp ? '1' : '0'}>
            <IonIcon icon={imagesOutline} aria-hidden="true" /><span>{t('card.gallery')}</span>{!inApp && <IonIcon icon={openOutline} aria-hidden="true" />}
          </button>
        )}
        <PhotoViewer set={viewer} onClose={() => setViewer(null)} />
      </div>
      {/* D49: on ≥600 dp (no toolbar of its own) the star sits at the end of the title row — the cover carries only the open sign and «Фотогалерея» */}
      <div className="card__title-row"><h1 className="card__title">{name}</h1>{wide && <FavButton code={row.code} />}</div>
      {/* owner 12.11.2026 (cloud_29): the card's eye stands at the RIGHT edge, on the place line's last line, without the « · » */}
      <div className="card__subrow"><p className="card__sub">{rowSubtitle(row, lang, dict) && <PlaceLine row={row} wide={wide} />}</p>{eye}</div>
      <LoadAllPhotos />
      <nav className="actions" ref={sideRow} aria-label={t('monasteries.title')} data-testid="actions">
        {actions.map((a) => (
          <button key={a.k} type="button" className="actions__btn" onClick={a.on} data-testid={a.testId}>
            <IonIcon icon={a.icon} aria-hidden="true" /><span>{a.label}</span>
          </button>
        ))}
      </nav>
      <section className="infos" data-testid="infos">
        {field(row, 'official', lang) && <InfoRow label={t('card.official')}>{field(row, 'official', lang)}</InfoRow>}
        {typeKey && <InfoRow label={t('card.type_label')}>{t(`card.type_${typeKey}`)}</InfoRow>}
        {row.subordination != null && <InfoRow label={t('card.subordination_label')}>{t(`card.subordination_${row.subordination}`)}</InfoRow>}
        {parent && (
          <InfoRow label={`${dict.label_division ?? ''} (${field(row, 'parent_division', lang)}) ${dict.label_division_of ?? ''}`}
            icon={churchOutline} onClick={() => navigate(`/monasteries/${parent.code}`)} testId="division-of">{field(parent, 'name', lang)}</InfoRow>
        )}
        {/* R-20: the lines as the card prints them — a number line dials, the text lines are plain; the label once */}
        {phoneGroups(phones).map((g, i) => (
          <InfoRow key={i} label={i === 0 ? dict.label_phones ?? '' : undefined} icon={g.dial ? callOutline : undefined} onClick={g.dial ? () => callPhone(g.dial!) : undefined}
            testId={g.dial ? 'phone-line' : 'phone-text'}>
            {g.lines.map((l, j) => <span key={j} className="info__line">{l}</span>)}
          </InfoRow>
        ))}
        {row.email && <InfoRow label={t('card.email')} icon={mailOutline} onClick={() => mailTo(row.email!)}>{row.email}</InfoRow>}
        {row.website && <ExternalLinkRow label={dict.label_website ?? ''} lead={globeOutline} url={row.website} title={host(row.website)} testId="website" />}
        {field(row, 'address', lang) && <InfoRow label={dict.label_address ?? ''}>{field(row, 'address', lang)}</InfoRow>}
        {hasGeo && <InfoRow label={t('card.gps')} icon={copyOutline} onClick={copyGps} testId="gps">{gps}</InfoRow>}
        {field(row, 'founded', lang) && <InfoRow label={dict.label_founded ?? ''}>{field(row, 'founded', lang)}</InfoRow>}
        {field(row, 'revival', lang) && <InfoRow label={revivalLabel(row, lang, dict)}>{field(row, 'revival', lang)}</InfoRow>}
        {field(row, 'head', lang) && (
          <InfoRow label={headRole ? `${dict.label_head ?? ''} — ${headRole}` : dict.label_head ?? ''} testId="card-head">
            {[field(row, 'head', lang), headBorn(row, lang, dict, 'card')].filter(Boolean).join(', ')}
          </InfoRow>
        )}
        {field(row, 'head_document', lang) && <InfoRow label={dict.label_head_document ?? ''}>{field(row, 'head_document', lang)}</InfoRow>}
      </section>
      {units.length > 0 && (
        <section className="units" data-testid="units">
          <h2 className="inok-heading">{dict.label_units ?? ''}</h2>
          {units.map((u) => <HouseRow key={u.code} row={u} onSelect={(c) => navigate(`/monasteries/${c}`)} />)}
        </section>
      )}
      {links.length > 0 && (
        <section className="links" data-testid="links">
          <h2 className="inok-heading">{dict.label_links ?? ''}</h2>
          {links.map((l, i) => <ExternalLinkRow key={i} lead={linkOutline} url={l.url} title={pick(l.title) || host(l.url)} testId={`link-${i}`} />)}
        </section>
      )}
      {history && (
        <>
          <h2 className="inok-heading">
            {dict.label_history ?? ''}
            {!ownHistory && historyLangs.length > 1 && historyLangs.map((l) => (
              <IonButton key={l} size="small" fill={l === shownLang ? 'solid' : 'clear'} onClick={() => setHistLang(l)} aria-label={t('card.history_in', { lang: langName(l) })}>{l.toUpperCase()}</IonButton>
            ))}
          </h2>
          <Collapsible testId="history">
            <HtmlLite html={history} className="history" />
            {sources.length > 0 && (
              <section className="sources" data-testid="sources">
                <h2 className="inok-heading">{t('card.sources')}</h2>
                {sources.map((s) => (
                  <ExternalLinkRow key={s.n} lead={s.n} url={s.url} title={s.title ?? s.url ?? ''} caption={[s.publication, s.year].filter(Boolean).join(', ') || undefined} />
                ))}
              </section>
            )}
          </Collapsible>
        </>
      )}
      <RelatedBlocks code={row.code} />
      {row.updated_at && <p className="card__updated" data-testid="card-updated">{t('card.updated', { date: longDate(row.updated_at, lang) })}</p>}
      {/* D28: every way out of the app is an ExternalLinkRow */}
      <div className="card__site"><ExternalLinkRow lead={globeOutline} url={pageUrl} title={t('card.open_site')} testId="open-site" /></div>
      {hasGeo && <DirectionsSheet open={dirs} onClose={() => setDirs(false)} lat={row.lat!} lon={row.lon!} label={name} />}
    </article>
    <ScrollArrows root={root} />
    </PhotoScope>
  );
}
