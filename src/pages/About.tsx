import { IonContent, IonIcon, IonItem, IonLabel, IonList, IonNote, IonPage } from '@ionic/react';
import { Busy } from '@/components/Busy';
import { cloudDownloadOutline, eyeOffOutline, shareSocialOutline, starOutline } from 'ionicons/icons';
import { useRef, useState } from 'react';
import { PageHeader } from '@/components/PageHeader';
import { SocialLinks } from '@/components/SocialLinks';
import { AttestCheck } from '@/components/AttestCheck';
import { APP_VERSION } from '@/app/version';
import { openLink } from '@/native/intents';
import { SITE_URL } from '@/data/api/client';
import { VERSIONS_URL } from '@/data/links/sitePages';
import { isIos } from '@/native/platform';
import { netFailure, type NetFailure } from '@/data/netFailure';
import { appStoreLinksShown, checkUpdate, immediateUpdate, openAppStoreUrl, openListing, shareApp, storeLinksShown, type UpdateCheck } from '@/native/play';
import { useApp } from '@/state/AppContext';

const OWN_TAPS = 7;
const OWN_TAPS_MS = 4000;

export function AboutPage() {
  const { t, lang, exportVersion, config, settings, setSettings } = useApp();
  // A-65: the hidden «own device» mark - 7 taps on the version line toggle it (local only, nothing sent); while on, a small badge
  const taps = useRef<number[]>([]);
  const tap = () => {
    const now = Date.now();
    taps.current = [...taps.current.filter((x) => now - x < OWN_TAPS_MS), now];
    if (taps.current.length >= OWN_TAPS) { taps.current = []; void setSettings({ ownDevice: !settings.ownDevice }); }
  };
  const dataDate = exportVersion ? new Intl.DateTimeFormat(lang, { dateStyle: 'long', timeStyle: 'short' }).format(new Date(exportVersion)) : null;
  const privacy = config?.privacy_url; // A-8: only from config, never hard-coded
  // A-80: «Перевірити оновлення» - Play's answer under the row; an update -> Google's own flow; not from Play -> said, nothing opens
  const [check, setCheck] = useState<UpdateCheck | 'busy' | null>(null);
  const [checkWhy, setCheckWhy] = useState<NetFailure | null>(null);
  const runCheck = async () => {
    setCheck('busy');
    const c = await checkUpdate();
    setCheckWhy(c.state === 'error' ? await netFailure(c) : null); // A-125: no network = said so (not «try later»)
    setCheck(c);
    if (c.state === 'available') await immediateUpdate(c.info, config);
  };
  const checkNote = check === 'busy' ? t('about.checking') : check?.state === 'none' ? t('about.latest', { v: APP_VERSION })
    : check?.state === 'not_play' ? t(isIos() ? 'about.not_app_store' : 'about.not_play') : check?.state === 'error' ? (checkWhy === 'offline' ? t('net.offline') : t('about.check_error')) : null;
  return (
    <IonPage>
      <PageHeader title={t('about.title')} />
      <IonContent>
        <IonList>
          <IonItem><IonLabel>{t('app.name')}</IonLabel></IonItem>
          <IonItem onClick={tap} data-testid="version-line"><IonLabel>{t('about.version')}</IonLabel>
            <IonNote slot="end" data-testid="app-version">{APP_VERSION}</IonNote>
            {settings.ownDevice && <IonIcon slot="end" icon={eyeOffOutline} className="own-device" aria-label={t('views.own_device')} data-testid="own-device" />}
          </IonItem>
          {/* A-167 (cloud_44): the app's version history on the site (public versions, each change once), right under the version line -
              the in-app browser like the privacy row; offline = what openLink says */}
          <IonItem button detail onClick={() => openLink(VERSIONS_URL, lang)} data-testid="about-versions"><IonLabel>{t('about.versions')}</IonLabel></IonItem>
          {isIos() && <AttestCheck />}{/* cloud_40 (A1 g): App Attest of THIS iPhone / iPad, under the version */}
          {/* A-131 (R-57, R-60): «Поділитися» shares the smart link /app/get/ - on iOS always, on Android by R-41's switch as before;
              «Оцінити» - each platform by ITS OWN pair (Android: store_links -> Play; iOS: app_store_links + app_store_url -> «write a review») */}
          {(isIos() || storeLinksShown(config)) && (
            <IonItem button detail={false} onClick={() => void shareApp(t('app.name'), t('about.share_text'))} data-testid="about-share">
              <IonIcon slot="start" icon={shareSocialOutline} aria-hidden="true" /><IonLabel>{t('about.share')}</IonLabel>
            </IonItem>
          )}
          {(isIos() ? appStoreLinksShown(config) : storeLinksShown(config)) && (
            <IonItem button detail={false} onClick={() => void (isIos() ? openAppStoreUrl(config, true) : openListing(config))} data-testid="about-rate">
              <IonIcon slot="start" icon={starOutline} aria-hidden="true" /><IonLabel>{t('about.rate')}</IonLabel>
            </IonItem>
          )}
          <IonItem button detail={false} disabled={check === 'busy'} onClick={() => void runCheck()} data-testid="about-update">
            <IonIcon slot="start" icon={cloudDownloadOutline} aria-hidden="true" />
            <IonLabel className="ion-text-wrap">{t('about.check')}{checkNote && <p data-testid="about-update-note" aria-live="polite">{checkNote}</p>}</IonLabel>
            {check === 'busy' && <Busy slot="end" name="dots" />}
          </IonItem>
          <IonItem><IonLabel className="ion-text-wrap">{dataDate ? `${t('about.data')} ${dataDate}` : t('about.data_none')}</IonLabel></IonItem>
          {privacy && (
            <IonItem button detail onClick={() => openLink(privacy, lang)}><IonLabel>{t('about.privacy')}</IonLabel></IonItem>
          )}
          <IonItem button detail onClick={() => openLink(SITE_URL, lang)}><IonLabel>{t('about.site')}</IonLabel></IonItem>
        </IonList>
        <SocialLinks />
      </IonContent>
    </IonPage>
  );
}
