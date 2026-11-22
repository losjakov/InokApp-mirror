import { UpdateOffer, overlayOpen } from '@/components/UpdateOffer';
import { maybeAskReview, noteStart } from '@/state/reviewAsk';
import { requestStoreReview } from '@/native/inAppReview';
import { checkUpdate } from '@/native/play';
import { isIos } from '@/native/platform';
import { online } from '@/native/network';
import { DoorGate } from '@/components/Door';
import { NetHost } from '@/components/NetNotice';
import { IonApp, IonIcon, IonLabel, IonRouterOutlet, IonTabBar, IonTabs } from '@ionic/react';
import { Busy } from '@/components/Busy';
import { IonReactRouter } from '@ionic/react-router';
import { Navigate, Route, useLocation, useNavigate } from 'react-router-dom';
import { ellipsisHorizontalOutline, mapOutline, newspaperOutline, videocamOutline } from 'ionicons/icons';
import { churchOutline } from '@/components/icons';
import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import { useFitTabLabels } from './tabLabels';
import { routeForPush } from '@/data/live/pushRoute';
import { EPARCHIES_PATH, TabButton, useHardwareBack } from './nav';
import { StartRoute, useAppLinks } from './links';
import { streamsPlay } from './streamsPlay';
import { openVideo } from '@/native/intents';
import { logScreen, screenName, setAnalytics } from '@/native/analytics';
import { AppProvider, useApp } from '@/state/AppContext';
import { HomePage } from '@/pages/Home';
import { MonasteriesPage } from '@/pages/Monasteries';

import { StreamsPage } from '@/pages/Streams';
import { MorePage } from '@/pages/More';
import { FavouritesPage, UnfinishedPage, VisitedPage } from '@/pages/Favourites';
import { ReadingProvider } from '@/state/reading';
import { RemindersProvider } from '@/state/reminders';
import { WidgetsHost } from '@/components/WidgetsHost';
import { SpotlightHost } from '@/components/SpotlightHost';
import { onReminderTap } from '@/native/reminders';
import { channelUrl } from '@/data/live/streams';
import { UNFINISHED_PATH } from '@/components/ContinueReading';
import { LanguagePage } from '@/pages/Language';
import { NotificationsPage } from '@/pages/Notifications';
import { CommissionPage } from '@/pages/Commission';
import { ContactsPage } from '@/pages/Contacts';
import { EparchiesPage } from '@/pages/Eparchies';
import { AboutPage } from '@/pages/About';
import { ArticlesPage } from '@/pages/Articles';

// MapLibre (~800 kB) loads only when the map opens
const MapPage = lazy(() => import('@/pages/Map').then((m) => ({ default: m.MapPage })));

/** A-36: the switch applied at every start and change; then one screen name per page opened (the route only). A LEAF component:
 *  its state never re-renders the tabs' tree (inside Tabs it re-rendered IonTabs right after the first home → D22 blank on API 34). */
function ScreenAnalytics(): null {
  const { settings } = useApp();
  const { pathname, search } = useLocation();
  const on = !settings.incognito; // A-96 W-7: incognito ON = no collection
  const [applied, setApplied] = useState<boolean | null>(null);
  useEffect(() => { let live = true; void setAnalytics(on).then(() => live && setApplied(on)); return () => { live = false; }; }, [on]);
  useEffect(() => { if (applied) logScreen(screenName(pathname, search)); }, [applied, pathname, search]);
  return null;
}

/** cloud_41 (A-133 C2): back on «Головна» from another screen = the one moment the store's rating window may be asked (src/state/reviewAsk.ts).
 *  A LEAF inside the tabs: the first-run screen and the reserve door never mount it. */
function ReviewAsk(): null {
  const { pathname } = useLocation();
  const prev = useRef<string | null>(null);
  useEffect(() => { void noteStart(); }, []);
  useEffect(() => {
    const was = prev.current;
    prev.current = pathname;
    if (pathname !== '/home' || was == null || was === '/home') return;
    void (async () => {
      const play = isIos() ? null : (await checkUpdate()).state;
      const fromStore = isIos() || play === 'available' || play === 'none'; // Android: Play knows this install
      await maybeAskReview({ backOnHome: true, overlay: overlayOpen(), door: false, firstRun: false, online: await online(), fromStore }, requestStoreReview);
    })();
  }, [pathname]);
  return null;
}

function Tabs() {
  const { t, liveChannelIds, pushTap, clearPushTap, live } = useApp();
  const navigate = useNavigate();
  useFitTabLabels([t]); // NOTE 3 (cloud_38): the five labels whole at any width and text size
  useHardwareBack();
  useAppLinks(); // A-76: an inok.info article / card link from Telegram, mail… opens here (a cold start's: StartRoute, A-78 1)
  // a tapped notification (contract §4): stream → «Трансляції» + the stream on top (A-161 (3), THE rule of streamsPlay); article → the article
  useEffect(() => {
    if (!pushTap) return;
    const r = routeForPush(pushTap, live?.status);
    clearPushTap();
    if (r?.kind === 'streams-play') streamsPlay((p) => navigate(p), r.video); else if (r?.kind === 'navigate') navigate(r.to);
  }, [pushTap, clearPushTap, navigate, live]);
  // T8: a tapped reminder -> «Трансляції»; the stream itself when it is live by then (the row's own action, A-37)
  const liveRef = useRef(live);
  useEffect(() => { liveRef.current = live; }, [live]);
  useEffect(() => onReminderTap((x) => {
    navigate('/streams');
    const st = liveRef.current?.status;
    if (x.channel_id != null && st?.live.some((l) => l.channel_id === x.channel_id)) void openVideo(channelUrl({ id: x.channel_id, youtube_url: '' }, st));
  }), [navigate]);
  return (
    <>
    <UpdateOffer />
    <ReviewAsk />
    <NetHost />
    <WidgetsHost />
    <SpotlightHost />
    <IonTabs>
      <IonRouterOutlet>
        <Route path="/home" element={<HomePage />} />
        <Route path="/monasteries/:code?" element={<MonasteriesPage />} />
        <Route path="/map" element={<Suspense fallback={<Splash />}><MapPage /></Suspense>} />
        <Route path="/streams" element={<StreamsPage />} />
        <Route path="/more" element={<MorePage />} />
        <Route path="/articles" element={<ArticlesPage />} />
        <Route path={UNFINISHED_PATH} element={<UnfinishedPage />} />
        <Route path="/more/articles" element={<Navigate to="/articles" replace />} />
        <Route path="/more/favourites" element={<FavouritesPage />} />
        <Route path="/more/visited" element={<VisitedPage />} />
        <Route path="/more/language" element={<LanguagePage />} />
        <Route path="/more/notifications" element={<NotificationsPage />} />
        <Route path="/more/commission" element={<CommissionPage />} />
        <Route path="/more/contacts" element={<ContactsPage />} />
        <Route path={`${EPARCHIES_PATH}/:id?`} element={<EparchiesPage />} />
        <Route path="/more/about" element={<AboutPage />} />
        <Route path="/" element={<StartRoute />} />
        <Route path="*" element={<Navigate to="/home" replace />} />
      </IonRouterOutlet>
      <IonTabBar slot="bottom">
        <TabButton tab="monasteries">
          <IonIcon icon={churchOutline} aria-hidden="true" />
          <IonLabel>{t('tabs.monasteries')}</IonLabel>
        </TabButton>
        <TabButton tab="map">
          <IonIcon icon={mapOutline} aria-hidden="true" />
          <IonLabel>{t('tabs.map')}</IonLabel>
        </TabButton>
        <TabButton tab="streams">
          <IonIcon icon={videocamOutline} aria-hidden="true" />
          <IonLabel>{t('tabs.streams')}</IonLabel>
          {liveChannelIds.size > 0 && <span className="tab-live-dot" title={t('home.live_hint')} role="img" aria-label={t('home.live_hint')} data-testid="tab-live" />}
        </TabButton>
        <TabButton tab="articles">
          <IonIcon icon={newspaperOutline} aria-hidden="true" />
          <IonLabel>{t('tabs.articles')}</IonLabel>
        </TabButton>
        <TabButton tab="more">
          <IonIcon icon={ellipsisHorizontalOutline} aria-hidden="true" />
          <IonLabel>{t('tabs.more')}</IonLabel>
        </TabButton>
      </IonTabBar>
    </IonTabs>
    {/* A-88: a service starting / ending is said once, politely (the dot above is only seen) */}
    <div role="status" className="sr-only" data-testid="live-status">{liveChannelIds.size > 0 ? t('home.live_hint') : ''}</div>
    </>
  );
}

const Splash = () => (
  <div className="first-run" data-testid="splash">
    <Busy name="crescent" />
  </div>
);

export function App() {
  return (
    <IonApp>
      <AppProvider fallback={<Splash />}>
        {/* A-132: the reserve door renders INSTEAD of the app (never over it) - a hard door leaves no router to reach behind it */}
        <DoorGate fallback={<Splash />}>
          <ReadingProvider>
          <RemindersProvider>
          <IonReactRouter>
            <IonRouterOutlet>
              <Route path="/*" element={<><ScreenAnalytics /><Tabs /></>} />
            </IonRouterOutlet>
          </IonReactRouter>
          </RemindersProvider>
          </ReadingProvider>
        </DoorGate>
      </AppProvider>
    </IonApp>
  );
}
