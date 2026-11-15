import { IonButton, IonItem, useIonAlert, useIonViewWillEnter } from '@ionic/react';
import { useCallback, useEffect, useState } from 'react';
import { Busy } from './Busy';
import { FLASH_MS, useToast } from './toast';
import { canClear, formatUsed } from '@/data/photos/store';
import { dbPictureNames } from '@/data/photos/saved';
import { clearSavedPhotos, savedPhotosBytes } from '@/native/covers';
import { useApp } from '@/state/AppContext';

/**
 * A-111: «Очистити збережені фото» under «Автозавантаження фото» in «Ще» - the space the clearable photos take (read from the files on
 * every entry and after the clear; «0 МБ» = the button is unavailable), a confirmation with the button's own words and «Скасувати», the
 * short message after (the favourite's toast: ~2 s above the tab bar, role status). Kept pictures, the database and settings stay.
 */
export function SavedPhotos() {
  const { t, lang, db } = useApp();
  const [used, setUsed] = useState<number | null>(null); // null = measuring
  const [busy, setBusy] = useState(false);
  const [ask] = useIonAlert();
  const toast = useToast();
  const measure = useCallback(() => savedPhotosBytes(() => (db ? dbPictureNames(db) : Promise.resolve(null))).catch(() => 0), [db]);
  const remeasure = useCallback(() => { void measure().then(setUsed); }, [measure]);
  useEffect(remeasure, [remeasure]);
  useIonViewWillEnter(remeasure); // «Ще» stays mounted between tabs: the number is read again on every entry
  const size = used === null ? '…' : formatUsed(used, lang, t('photos.mb'));
  const clear = async () => {
    setBusy(true);
    await clearSavedPhotos().catch(() => undefined);
    setUsed(await measure());
    setBusy(false);
    toast(t('photos.cleared'), { duration: FLASH_MS, testId: 'photos-cleared' });
  };
  const confirm = () => void ask({
    header: t('photos.clear'), message: t('photos.clear_hint'), cssClass: 'inok-dialog photos-confirm',
    buttons: [
      { text: t('common.cancel'), role: 'cancel', htmlAttributes: { 'data-testid': 'photos-confirm-cancel' } },
      { text: t('photos.clear'), role: 'destructive', handler: () => void clear(), htmlAttributes: { 'data-testid': 'photos-confirm-do' } },
    ],
  });
  return (
    <IonItem className="more__clear" data-testid="more-photos-clear">
      <div className="more__clear-box">
        <div className="more__clear-row">
          <IonButton fill="outline" className="btn-target48" disabled={busy || !canClear(used)} onClick={confirm}
            aria-label={`${t('photos.clear')}, ${size}`} data-testid="photos-clear">{t('photos.clear')}</IonButton>
          <span className="more__used" aria-hidden="true" data-testid="photos-used">{size}</span>
          {busy && <Busy className="more__clear-busy" />}
        </div>
        <p className="more__clear-hint">{t('photos.clear_hint')}</p>
      </div>
    </IonItem>
  );
}
