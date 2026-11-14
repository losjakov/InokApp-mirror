import { IonButton, IonIcon } from '@ionic/react';
import { shareSocialOutline } from 'ionicons/icons';
import { useT } from '@/state/AppContext';
import { shareUrl } from '@/native/intents';

/**
 * A-43: THE «Поділитися» of a list or item screen - one full-width button with the share icon at the END of the screen's content
 * (after its last block), the system share sheet with the address of the same page on inok.info (`url` from src/data/links/sitePages.ts
 * or the item's own `site_url` through `siteUrl`). The card keeps its own share action.
 */
export function ShareFooter({ title, url }: { title: string; url: string }) {
  const { t } = useT();
  return (
    <div className="share-footer" data-testid="share-footer" data-url={url}>
      <IonButton expand="block" fill="outline" onClick={() => void shareUrl(title, url)}>
        <IonIcon slot="start" icon={shareSocialOutline} aria-hidden="true" />
        {t('common.share')}
      </IonButton>
    </div>
  );
}
