import { UpdateOffer } from '@/components/UpdateOffer';
import { IonApp, IonIcon, IonLabel, IonRouterOutlet, IonTabBar, IonTabs } from '@ionic/react';
import { Busy } from '@/components/Busy';
import { IonReactRouter } from '@ionic/react-router';
import { Navigate, Route, useLocation, useNavigate } from 'react-router-dom';
import { ellipsisHorizontalOutline, mapOutline, newspaperOutline, videocamOutline } from 'ionicons/icons';
import { churchOutline } from '@/components/icons';
import { lazy, Suspense, useEffect, useState } from 'react';
import { routeForPush } from '@/data/live/pushRoute';
import { EPARCHIES_PATH, TabButton, useHardwareBack } from './nav';
import { StartRoute, useAppLinks } from './links';
import { openVideo } from '@/native/intents';
import { logScreen, screenName, setAnalytics } from '@/native/analytics';
import { AppProvider, useApp } from '@/state/AppContext';
import { HomePage } from '@/pages/Home';
import { MonasteriesPage } from '@/pages/Monasteries';

import { StreamsPage } from '@/pages/Streams';
import { MorePage } from '@/pages/More';
import { FavouritesPage } from '@/pages/Favourites';
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

function Tabs() {
  const { t, liveChannelIds, pushTap, clearPushTap, live } = useApp();
  const navigate = useNavigate();
  useHardwareBack();
  useAppLinks(); // A-76: an inok.info article / card link from Telegram, mail… opens here (a cold start's: StartRoute, A-78 1)
  // a tapped notification (contract §4): stream → the YouTube app (A-4.2) + the streams tab; article → the article
  useEffect(() => {
    if (!pushTap) return;
    const r = routeForPush(pushTap, live?.status);
    clearPushTap();
    if (r?.kind === 'youtube') { navigate('/streams'); void openVideo(r.url); } else if (r?.kind === 'navigate') navigate(r.to);
  }, [pushTap, clearPushTap, navigate, live]);
  return (
    <>
    <UpdateOffer />
    <IonTabs>
      <IonRouterOutlet>
        <Route path="/home" element={<HomePage />} />
        <Route path="/monasteries/:code?" element={<MonasteriesPage />} />
        <Route path="/map" element={<Suspense fallback={<Splash />}><MapPage /></Suspense>} />
        <Route path="/streams" element={<StreamsPage />} />
        <Route path="/more" element={<MorePage />} />
        <Route path="/articles" element={<ArticlesPage />} />
        <Route path="/more/articles" element={<Navigate to="/articles" replace />} />
        <Route path="/more/favourites" element={<FavouritesPage />} />
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
        <IonReactRouter>
          <IonRouterOutlet>
            <Route path="/*" element={<><ScreenAnalytics /><Tabs /></>} />
          </IonRouterOutlet>
        </IonReactRouter>
      </AppProvider>
    </IonApp>
  );
}
