import { IonActionSheet } from '@ionic/react';
import { directions, type DirectionsApp } from '@/native/intents';
import { useT } from '@/state/AppContext';

/** «Як доїхати»: Google Maps / Waze / any maps app (geo: intent). Shared by the card and the map marker card. */
export function DirectionsSheet({ open, onClose, lat, lon, label }: { open: boolean; onClose: () => void; lat: number; lon: number; label: string }) {
  const { t } = useT();
  return (
    <IonActionSheet isOpen={open} onDidDismiss={onClose} header={t('card.directions')}
      buttons={[
        ...(['google', 'waze', 'other'] as DirectionsApp[]).map((app) => ({ text: t(`dirs.${app}`), handler: () => { void directions(lat, lon, label, app); } })),
        { text: t('common.cancel'), role: 'cancel' as const },
      ]} />
  );
}
