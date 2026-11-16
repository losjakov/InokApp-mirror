import { IonButton, IonContent, IonPage } from '@ionic/react';
import { PageHeader } from '@/components/PageHeader';
import { openLink } from '@/native/intents';
import { SITE_URL } from '@/data/api/client';
import { ShareFooter } from '@/components/ShareFooter';
import { SocialLinks } from '@/components/SocialLinks';
import { sitePageUrl } from '@/data/links/sitePages';
import { useApp } from '@/state/AppContext';

export function CommissionPage() {
  const { t, lang } = useApp();
  return (
    <IonPage>
      <PageHeader title={t('commission.title')} />
      <IonContent>
        <div className="ion-padding">
          <p>{t('commission.text')}</p>
          <IonButton expand="block" fill="outline" onClick={() => openLink(SITE_URL, lang)}>{t('commission.open_site')}</IonButton>
        </div>
        <SocialLinks />
        <ShareFooter title={t('commission.title')} url={sitePageUrl('/more/commission', lang)} />
      </IonContent>
    </IonPage>
  );
}
