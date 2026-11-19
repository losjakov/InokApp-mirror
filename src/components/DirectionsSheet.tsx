import { IonActionSheet } from '@ionic/react';
import { directions, type DirectionsApp } from '@/native/intents';
import { useT } from '@/state/AppContext';
import type { Translate } from '@/i18n';

/** THE three ways to get there - the sheet's buttons, also offered after «Прокласти маршрут» of a row's long press (A-142, A-15) */
export const directionButtons = (t: Translate, lat: number, lon: number, label: string) =>
  (['google', 'waze', 'other'] as DirectionsApp[]).map((app) => ({ text: t(`dirs.${app}`), handler: () => { void directions(lat, lon, label, app); } }));

/** «Як доїхати»: Google Maps / Waze / any maps app (geo: intent). Shared by the card and the map marker card. */
export function DirectionsSheet({ open, onClose, lat, lon, label }: { open: boolean; onClose: () => void; lat: number; lon: number; label: string }) {
  const { t } = useT();
  return (
    <IonActionSheet isOpen={open} onDidDismiss={onClose} header={t('card.directions')}
      buttons={[
        ...directionButtons(t, lat, lon, label),
        { text: t('common.cancel'), role: 'cancel' as const },
      ]} />
  );
}
