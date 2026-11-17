import { IonIcon, IonItem, IonLabel } from '@ionic/react';
import { copyOutline, shieldCheckmarkOutline } from 'ionicons/icons';
import { useEffect, useState } from 'react';
import { APP_VERSION } from '@/app/version';
import { attestDiagnostics, type AttestState } from '@/data/repo/attest';
import { useToast } from '@/components/toast';
import { copyText } from '@/native/intents';
import { useApp } from '@/state/AppContext';

/**
 * cloud_40 (A1 g): «Перевірка Apple: …» under the version (iPhone / iPad only) - the App Attest state of THIS device, readable without a
 * cable; «Скопіювати подробиці» copies the diagnostics text (no key, no install id, no signature) and shows it on the screen as well, so a
 * screenshot carries it when the clipboard is refused.
 */
export function AttestCheck() {
  const { db, t, config } = useApp();
  const toast = useToast();
  const [diag, setDiag] = useState<{ state: AttestState; details: string } | null>(null);
  const [shown, setShown] = useState(false);
  useEffect(() => { let on = true; void attestDiagnostics(db, APP_VERSION).then((d) => on && setDiag(d)); return () => { on = false; }; }, [db, config]);
  const copy = async () => {
    const d = await attestDiagnostics(db, APP_VERSION); // fresh: a failed call is asked again
    setDiag(d); setShown(true);
    if (await copyText(d.details)) toast(t('card.copied'), { duration: 1500 });
  };
  return (
    <>
      <IonItem data-testid="attest-check" data-state={diag?.state ?? 'checking'}>
        <IonIcon slot="start" icon={shieldCheckmarkOutline} aria-hidden="true" />
        <IonLabel className="ion-text-wrap" data-testid="attest-state" aria-live="polite">{t('about.attest', { state: t(`about.attest_${diag?.state ?? 'checking'}`) })}</IonLabel>
      </IonItem>
      <IonItem button detail={false} onClick={() => void copy()} data-testid="attest-copy">
        <IonIcon slot="start" icon={copyOutline} aria-hidden="true" />
        <IonLabel className="ion-text-wrap">{t('about.attest_copy')}
          {shown && diag && <pre className="attest-check__details" data-testid="attest-details">{diag.details}</pre>}
        </IonLabel>
      </IonItem>
    </>
  );
}
