import { IonContent, IonIcon, IonItem, IonLabel, IonList, IonPage, useIonViewDidEnter, useIonViewWillLeave } from '@ionic/react';
import { ListBox, ListHeading } from '@/components/ListHeading';
import { locateOutline, mapOutline, newspaperOutline, refreshOutline, videocamOutline } from 'ionicons/icons';
import { Fragment, useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { HomeBlock } from '@/data/uiConfig';
import { Link, useNavigate } from 'react-router-dom';
import { MAP_NEAR } from '@/app/nav';
import { PageHeader } from '@/components/PageHeader';
import { useDataRefresh, useRefresh } from '@/components/Refresh';
import { checkedLabel } from '@/data/refresh';
import { StreamRow } from '@/components/StreamRow';
import { CalendarStrip } from '@/components/CalendarStrip';
import { MonasteryRow } from '@/components/MonasteryRow';
import { ContinueReading } from '@/components/ContinueReading';
import { churchOutline } from '@/components/icons';
import { listChannels } from '@/data/repo/channels';
import { nearbyMonasteries } from '@/data/repo/monasteries';
import { cachedBlock, fetchBlock, type HomeBlockSort } from '@/data/repo/articles';
import type { ArticleSort } from '@/data/repo/articleOrder';
import { SocialLinks } from '@/components/SocialLinks';
import { NetNotice } from '@/components/NetNotice';
import { Busy } from '@/components/Busy';
import { netFailure, type NetFailure } from '@/data/netFailure';
import { articlesEntry } from './Articles';
import { MoreButton } from '@/components/MoreButton';
import { tileRow } from '@/components/sideRow';
import { ArticleRow } from '@/components/ArticleRow';
import type { Article } from '@/data/api/types';
import { groupChannels, streamTitle } from '@/data/live/streams';
import type { ChannelRow, MonasteryListRow as Row } from '@/data/repo/types';
import { currentPosition, locationGranted, type Position } from '@/native/geolocation';
import { useApp } from '@/state/AppContext';
import { pickLang } from '@/i18n';
import { bootLog } from '@/app/bootLog';
import { consumedArticles } from '@/native/push';
import { whileSeen } from '@/state/seen';

const NEAR_N = 3;
const LIVE_N = 3; // A-25 #2: more than 3 live → «Показати більше» unfolds the whole list here (and «Усі» → the streams tab)
const NEAR_RADIUS_KM = 200;

/**
 * Spec §2 + REVIEW cloud_02 D3: a compact tile row (the four sections), then what changes — the church calendar, «Зараз в
 * ефірі», «Поруч» (the 3 nearest houses when location is already granted, else a one-line invitation), «Нове на сайті»
 * (the newest cached articles, stage 4), and the data's freshness. Everything but the live status comes from SQLite (offline).
 */
export function HomePage() {
  const { db, t, lang, live, refreshing, lastCheck, config, ui } = useApp();
  const navigate = useNavigate();
  useEffect(() => {
    bootLog('home mounted');
    requestAnimationFrame(() => requestAnimationFrame(() => bootLog('home painted')));
  }, []);
  // A-84 (b): Home on screen = its «Нове на сайті» seen -> the article notifications (and the launcher badge) go; streams stay
  const [active, setActive] = useState(false);
  useIonViewDidEnter(() => setActive(true));
  useIonViewWillLeave(() => setActive(false));
  useEffect(() => (active ? whileSeen(() => void consumedArticles()) : undefined), [active]);
  const [channels, setChannels] = useState<ChannelRow[]>([]);
  const [pos, setPos] = useState<Position | null>(null);
  const [posError, setPosError] = useState(false);
  useEffect(() => { listChannels(db, lang).then(setChannels); }, [db, lang]);
  const [allLive, setAllLive] = useState(false);
  const locate = useCallback(async () => {
    try { setPos(await currentPosition()); setPosError(false); } catch { setPosError(true); }
  }, []);
  // no prompt on the home screen: fill «Поруч» by itself only when location is already granted
  useEffect(() => { locationGranted().then((ok) => ok && void locate()); }, [locate]);

  // A-52: the header button, the pull-down and the bottom line = the ONE full refresh (live, articles, directory) with one message;
  // the person's place («Поруч») follows every successful check (also the A-51 return refresh)
  const runRefresh = useDataRefresh();
  const refresh = useRefresh(runRefresh, refreshing);
  useEffect(() => { if (lastCheck) locationGranted().then((ok) => ok && void locate()); }, [lastCheck, locate]);
  const online = useMemo(() => groupChannels(channels, live?.status).online, [channels, live]);
  // D22: only the houses around the person, and only once the position is known — never the whole list on the first screen
  const [near, setNear] = useState<Row[] | null>(null);
  useEffect(() => { if (pos) void nearbyMonasteries(db, pos, NEAR_RADIUS_KM, NEAR_N).then(setNear); }, [db, pos]);
  const tiles = [
    { to: '/monasteries', icon: churchOutline, label: t('home.monasteries'), id: 'monasteries' },
    { to: '/map', icon: mapOutline, label: t('home.map'), id: 'map' },
    { to: '/streams', icon: videocamOutline, label: t('home.streams'), id: 'streams', live: online.length > 0 },
    { to: '/articles', icon: newspaperOutline, label: t('home.articles'), id: 'articles' },
  ];
  const header = (label: string, to: string, testId?: string) => <HomeHeading label={label} to={to} testId={testId} />;
  // A-128: «Нове на сайті» by the date of placing, «Популярне за тиждень» by the week's views - only the orders the server takes (R-44 / R-48)
  const newSort: ArticleSort = config && !config.features.articles_query ? 'published' : 'created';
  const popular = !config || !!config.features.articles_sort_v2;
  const homeBlock: Record<HomeBlock, ReactNode> = {
    live: <>
          {header(online.length ? t('home.live_now_n', { n: online.length }) : t('home.live_now'), '/streams', 'home-live')}
          {online.length === 0 ? <IonItem lines="none"><IonLabel className="home__quiet">{t('home.live_none')}</IonLabel></IonItem> : online.slice(0, allLive ? undefined : LIVE_N).map(({ channel, live: l }) => (
            <StreamRow key={channel.id} channel={channel} second={streamTitle(pickLang(l.title, lang))} live place={false} testId={`home-live-${channel.id}`} />
          ))}
          {/* D42: the number of the hidden rows on the button; «Головна» is a dashboard — the long list folds back (the card's history is one-way) */}
          {online.length > LIVE_N && <ListBox><MoreButton label={allLive ? t('common.collapse') : t('common.more_n', { n: online.length - LIVE_N })}
            onClick={() => setAllLive((v) => !v)} expanded={allLive} testId="home-live-more" /></ListBox>}
          </>,
    near: <>
          {header(t('home.near'), MAP_NEAR, 'home-near')}
          {near ? (near.length === 0 ? <IonItem lines="none"><IonLabel className="home__quiet">{t('map.nearby_empty', { km: NEAR_RADIUS_KM })}</IonLabel></IonItem>
            : near.map((r) => <MonasteryRow key={r.code} row={r} onSelect={(c) => navigate(`/monasteries/${c}`)} />)) : (
            <IonItem button detail={false} onClick={locate} data-testid="home-locate">
              <IonIcon slot="start" icon={locateOutline} aria-hidden="true" />
              <IonLabel className="ion-text-wrap">{posError ? t('monasteries.no_location') : t('home.near_invite')}</IonLabel>
            </IonItem>
          )}
          </>,
    new: <>
          <ArticleBlock sort={newSort} title={t('home.new')} testId="home-new" />
          </>,
    popular: <>
          {popular && <ArticleBlock sort="views_week" title={t('home.popular')} testId="home-popular" />}
          </>,
  };
  return (
    <IonPage>
      <PageHeader title={t('app.name')} end={refresh.button} />
      <IonContent className="home">
        {refresh.puller}
        <nav className="tiles" ref={tileRow} aria-label={t('app.short')} data-testid="tiles">
          {tiles.map((x) => (
            <Link key={x.id} to={x.to} className="tile" data-testid={`tile-${x.id}`}>
              <IonIcon icon={x.icon} aria-hidden="true" />
              <span>{x.label}</span>
              {x.live && <span className="tile__dot" aria-hidden="true" />}
            </Link>
          ))}
        </nav>
        <ContinueReading testId="home-continue" />{/* A-141 (3): under the four buttons, only while something is unfinished */}
        <CalendarStrip />
        <IonList className="home__list">
          {/* A-162 (2) (cloud_44): the order of the blocks from the site's ui-config (a permutation of HOME_BLOCKS; the default = this order) */}
          {ui.home.map((b) => <Fragment key={b}>{homeBlock[b]}</Fragment>)}
        </IonList>
        <SocialLinks />
        <IonList className="home__list home__list--end">
          <IonItem button detail={false} onClick={() => void runRefresh()} disabled={refreshing} lines="none" className="home__fresh" data-testid="home-fresh">
            <IonIcon slot="start" icon={refreshOutline} aria-hidden="true" />
            <IonLabel className="home__quiet" data-testid="home-checked">{lastCheck ? checkedLabel(t, lang, lastCheck) : t('more.update')}</IonLabel>
          </IonItem>
        </IonList>
      </IonContent>
    </IonPage>
  );
}

/** A section head of «Головна» with its «Усі» (A-88: an item of the list whose words are a level-2 heading). */
function HomeHeading({ label, to, testId, state }: { label: string; to: string; testId?: string; state?: unknown }) {
  const { t } = useApp();
  // A-95 (cloud_39): four «Усі» on one screen - each link's name says WHICH list («Усі: Популярне за тиждень»), the visible word first
  // (WCAG 2.5.3 label in name), so TalkBack / VoiceOver's link list tells them apart
  return <ListHeading className="home__h" testId={testId} label={label} end={<Link to={to} state={state} className="home__all" aria-label={`${t('home.all')}: ${label}`}
    data-testid={testId && `${testId}-all`}>{t('home.all')}</Link>} />;
}

/**
 * A-128: ONE block of the site's materials on «Головна» («Нове на сайті», «Популярне за тиждень») - 2 «Статті», a «Відео», a «Новина» in the
 * block's order; the kept list at once (offline too), then the server once the feed was tried this run; nothing to show = the shared
 * A-125 line with «Повторити», never an empty block without a word, never a spinner for ever (the request has its timeout).
 * «Усі» = «Публікації» on «Усі» in THIS block's order, for this entry only (`articlesEntry`).
 */
function ArticleBlock({ sort, title, testId }: { sort: ArticleSort; title: string; testId: string }) {
  const { db, t, lang, articlesVersion } = useApp();
  const navigate = useNavigate();
  const [rows, setRows] = useState<Article[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [fail, setFail] = useState<NetFailure | null>(null);
  const [tries, setTries] = useState(0);
  const [fetched, setFetched] = useState(false); // the server answered (or failed) once this run - the store frames wait for it (cloud_39)
  useEffect(() => {
    let on = true;
    void (async () => {
      const kept = await cachedBlock(db, lang, sort);
      if (!on) return;
      setRows(kept);
      if (articlesVersion === 0 && tries === 0) return; // the feed's own try first (A-25 #3: no second burst at start)
      setBusy(true); setFetched(false); // a new language / a retry: «answered» again only by THIS request
      try { const r = await fetchBlock(db, lang, sort); if (on) { setRows(r); setFail(null); } }
      catch (e) { const f = await netFailure(e); if (on) setFail(f); }
      finally { if (on) { setBusy(false); setFetched(true); } }
    })();
    return () => { on = false; };
  }, [db, lang, sort, articlesVersion, tries]);
  const empty = !rows || rows.length === 0;
  const entry = articlesEntry(sort as HomeBlockSort);
  return (
    <>
      <HomeHeading label={title} to={entry.to} state={entry.state} testId={testId} />
      {!empty ? rows.map((a) => <ArticleRow key={a.id} a={a} onSelect={(id) => navigate(`/articles?id=${id}`)} mixed />)
        : busy ? <ListBox><div className="empty empty--row"><Busy /></div></ListBox>
          : !fail && rows ? <IonItem lines="none"><IonLabel className="home__quiet">{t('articles.empty')}</IonLabel></IonItem> : null}
      <div role="listitem" data-testid={`${testId}-block`} data-fetched={fetched ? '1' : '0'} data-rows={rows?.length ?? 0}>
        <NetNotice failure={empty && !busy ? fail : null} onRetry={() => setTries((n) => n + 1)} testId={`${testId}-net`} />
      </div>
    </>
  );
}
