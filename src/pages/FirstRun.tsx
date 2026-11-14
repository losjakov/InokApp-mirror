import { IonButton, IonContent, IonIcon, IonPage, IonText } from '@ionic/react';
import { cloudOfflineOutline, phonePortraitOutline, serverOutline, warningOutline } from 'ionicons/icons';
import { useApp } from '@/state/AppContext';
import { lastSyncFailure, type FailureKind } from '@/data/sync';
import { ENGINE_FLOOR, ENGINE_UPDATE_URLS, chromeMajor } from '@/app/engineFloor';
import { openSystemUrl } from '@/native/intents';

/** A-46 (3): one title + text + icon per cause; `offline` keeps the first-run words it always had. */
const VIEW: Record<FailureKind, { title: string; text: string; icon: string; photo?: true }> = {
  offline: { title: 'data.first_run_title', text: 'data.first_run_text', icon: cloudOfflineOutline },
  network: { title: 'data.fail_network_title', text: 'data.fail_network_text', icon: cloudOfflineOutline },
  server: { title: 'data.fail_server_title', text: 'data.fail_server_text', icon: serverOutline, photo: true },
  import: { title: 'data.fail_import_title', text: 'data.fail_import_text', icon: warningOutline, photo: true },
  engine: { title: 'data.fail_engine_title', text: 'data.fail_engine_text', icon: phonePortraitOutline },
};

/** Shown only when the DB is empty and the first download failed (spec §8: the app survives with no network forever — after once). */
export function FirstRunGate({ retry }: { retry: () => void }) {
  const { t, boot } = useApp();
  const updateApp = boot === 'update_app';
  const failure = updateApp ? null : lastSyncFailure();
  const kind: FailureKind = failure?.kind ?? 'offline';
  const v = VIEW[kind];
  const have = chromeMajor(navigator.userAgent) ?? 0;
  return (
    <IonPage>
      <IonContent className="ion-padding" fullscreen>
        <div className="first-run" data-testid="first-run" data-cause={updateApp ? 'update_app' : kind}>
          <IonIcon icon={v.icon} className="first-run__icon" aria-hidden="true" />
          <h1>{updateApp ? t('data.update_app') : t(v.title)}</h1>
          {!updateApp && <IonText color="medium"><p>{t(v.text, { have, need: ENGINE_FLOOR })}</p></IonText>}
          {kind === 'engine' && (
            <>
              <IonButton expand="block" onClick={() => openSystemUrl(ENGINE_UPDATE_URLS.webview)}>{t('data.update_webview')}</IonButton>
              <IonButton expand="block" fill="outline" onClick={() => openSystemUrl(ENGINE_UPDATE_URLS.chrome)}>{t('data.update_chrome')}</IonButton>
            </>
          )}
          <IonButton onClick={retry} expand="block" fill={kind === 'engine' ? 'clear' : 'solid'}>{t('data.retry')}</IonButton>
          {failure && <IonText color="medium"><p className="first-run__code" data-testid="first-run-code">{t('data.fail_code', { code: failure.code })}</p></IonText>}
          {failure && v.photo && <IonText color="medium"><p data-testid="first-run-photo">{t('data.fail_photo')}</p></IonText>}
        </div>
      </IonContent>
    </IonPage>
  );
}
