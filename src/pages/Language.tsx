import { IonContent, IonItem, IonLabel, IonList, IonPage, IonRadio, IonRadioGroup } from '@ionic/react';
import { PageHeader } from '@/components/PageHeader';
import { useApp } from '@/state/AppContext';
import { LANGS, type Lang } from '@/i18n';

export function LanguagePage() {
  const { t, lang, setSettings } = useApp();
  return (
    <IonPage>
      <PageHeader title={t('language.title')} />
      <IonContent>
        <IonRadioGroup value={lang} onIonChange={(e) => setSettings({ lang: e.detail.value as Lang })}>
          <IonList data-testid="lang-list">
            {LANGS.map((l) => (
              <IonItem key={l}>
                <IonRadio value={l} data-testid={`lang-${l}`}><IonLabel>{t(`language.${l}`)}</IonLabel></IonRadio>
              </IonItem>
            ))}
          </IonList>
        </IonRadioGroup>
      </IonContent>
    </IonPage>
  );
}
