import { IonContent, IonIcon, IonItem, IonLabel, IonList, IonPage, IonSegment, IonSegmentButton, IonSelect, IonSelectOption, IonToggle, useIonViewDidEnter } from '@ionic/react';
import { Busy } from '@/components/Busy';
import { SavedPhotos } from '@/components/SavedPhotos';
import { useRef } from 'react';
import { takePhotoChooser } from '@/state/photoChooser';
import { PHOTO_MODES, type PhotoMode } from '@/data/photos/policy';
import { THEMES, type Theme } from '@/state/settings';
import { checkmarkCircleOutline, callOutline, contrastOutline, mapOutline, imagesOutline, heartOutline, homeOutline, informationCircleOutline, languageOutline, notificationsOutline, peopleOutline, refreshOutline, starOutline, eyeOffOutline } from 'ionicons/icons';
import { useNavigate } from 'react-router-dom';
import { PageHeader } from '@/components/PageHeader';
import { useDataRefresh } from '@/components/Refresh';
import { checkedLabel } from '@/data/refresh';
import { openLink } from '@/native/intents';
import { useApp } from '@/state/AppContext';
import { EPARCHIES_PATH } from '@/app/nav';

/** Spec §2 (owner 31.10: Статті is a tab of its own): Обрані, Мова, Про Комісію, Підтримати (external /donate/), Сповіщення, Про застосунок. */
export function MorePage() {
  const { t, lang, config, refreshing, lastCheck, exportVersion, settings, setSettings } = useApp();
  // A-52: the last check under «Оновити дані», the directory's own date (D9: «Дані від 31.10.2026 19:36») under it in small text
  const dataDate = exportVersion ? new Intl.DateTimeFormat(lang, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(exportVersion)) : null;
  const navigate = useNavigate();
  // A-20: a photo placeholder links here: the choice opens at once - cloud_40 (A2): ONCE per that entry (a one-shot intent consumed here,
  // never in the URL), so Back from an inner item of «Ще» never opens it again
  const photosSel = useRef<HTMLIonSelectElement>(null);
  useIonViewDidEnter(() => { if (takePhotoChooser()) window.setTimeout(() => void photosSel.current?.open(), 300); });
  const rows = [
    { k: 'eparchies', icon: mapOutline, to: EPARCHIES_PATH }, // A-22: «Єпархії УПЦ» first, «Головна» second
    { k: 'home', icon: homeOutline, to: '/home' }, // the owner's word 01.11: an explicit way home besides the toolbar icon
    { k: 'favourites', icon: starOutline, to: '/more/favourites' },
    { k: 'visited', icon: checkmarkCircleOutline, to: '/more/visited' }, // A-133 (07:08): right under «Обрані», the same kind of item
    { k: 'language', icon: languageOutline, to: '/more/language' },
    { k: 'commission', icon: peopleOutline, to: '/more/commission' },
    { k: 'contacts', icon: callOutline, to: '/more/contacts' }, // A-23 #2: right after «Про Комісію»
    ...(config?.donate_url ? [{ k: 'donate', icon: heartOutline, ext: config.donate_url }] : []), // A-8: URL from config only
    { k: 'notifications', icon: notificationsOutline, to: '/more/notifications' },
    { k: 'about', icon: informationCircleOutline, to: '/more/about' },
  ];
  const doRefresh = useDataRefresh(); // A-52: the same full refresh as the Home screen's
  return (
    <IonPage>
      <PageHeader title={t('more.title')} />
      <IonContent>
        <IonList data-testid="more-list">
          {rows.map((r: { k: string; icon: string; to?: string; ext?: string }) => (
            <IonItem key={r.k} button detail={!r.ext} onClick={() => (r.ext ? openLink(r.ext, lang) : navigate(r.to!))} data-testid={`more-${r.k}`}>
              <IonIcon slot="start" icon={r.icon} aria-hidden="true" />
              <IonLabel>{t(`more.${r.k}`)}</IonLabel>
            </IonItem>
          ))}
          {/* A-16: the theme in place (three choices fit one row; a page of its own would stand two-thirds empty) — applied at once */}
          <IonItem data-testid="more-theme">
            <IonIcon slot="start" icon={contrastOutline} aria-hidden="true" />
            <div className="more__theme-box">
            <div className="more__theme-label">{t('theme.title')}</div>
            <IonSegment value={settings.theme} onIonChange={(e) => void setSettings({ theme: e.detail.value as Theme })} className="more__theme" aria-label={t('theme.title')}>
              {THEMES.map((v) => <IonSegmentButton key={v} value={v} data-testid={`theme-${v}`}><IonLabel>{t(`theme.${v}`)}</IonLabel></IonSegmentButton>)}
            </IonSegment>
            </div>
          </IonItem>
          {/* A-20: «Автозавантаження фото» in place (one select; the hint says what «Wi-Fi» means) */}
          <IonItem lines="none" data-testid="more-photos">
            <IonIcon slot="start" icon={imagesOutline} aria-hidden="true" />
            <IonSelect ref={photosSel} value={settings.photos} interface="alert" cancelText={t('common.cancel')} onIonChange={(e) => void setSettings({ photos: e.detail.value as PhotoMode })}
              label={t('photos.title')} labelPlacement="stacked" interfaceOptions={{ header: t('photos.title'), message: t('photos.hint'), cssClass: 'inok-dialog' }} data-testid="photos-mode">
              {PHOTO_MODES.map((m) => <IonSelectOption key={m} value={m}>{t(`photos.mode_${m}`)}</IonSelectOption>)}
            </IonSelect>
          </IonItem>
          {/* A-111: «Очистити збережені фото» inside the same block, under the choice (the line under the select is this row's) */}
          <SavedPhotos />
          {/* A-96 W-7 (replaces A-36): «Режим інкогніто» — OFF at first (collection as before); ON stops it at once and is remembered */}
          <IonItem data-testid="more-incognito">
            <IonIcon slot="start" icon={eyeOffOutline} aria-hidden="true" />
            <IonToggle checked={settings.incognito} onIonChange={(e) => void setSettings({ incognito: e.detail.checked })} data-testid="incognito-toggle" data-on={settings.incognito ? '1' : '0'}>
              <IonLabel className="ion-text-wrap">{t('more.incognito')}<p>{t('more.incognito_hint')}</p></IonLabel>
            </IonToggle>
          </IonItem>
          <IonItem button detail={false} onClick={() => void doRefresh()} disabled={refreshing} data-testid="more-update">
            <IonIcon slot="start" icon={refreshOutline} aria-hidden="true" />
            <IonLabel className="ion-text-wrap">
              {t('more.update')}
              {lastCheck && <p data-testid="more-checked">{checkedLabel(t, lang, lastCheck)}</p>}
              <p className="more__dir-date" data-testid="data-date">{dataDate ? t('more.data_from', { date: dataDate }) : t('about.data_none')}</p>
            </IonLabel>
            {refreshing && <Busy slot="end" />}
          </IonItem>
        </IonList>
      </IonContent>
    </IonPage>
  );
}
