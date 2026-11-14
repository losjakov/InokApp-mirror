import { useEffect, useRef } from 'react';
import { APP_VERSION } from '@/app/version';
import { checkUpdate, completeUpdate, flexibleUpdate, immediateUpdate } from '@/native/play';
import { useApp } from '@/state/AppContext';
import { startupOffer } from '@/state/updateOffer';
import { useBanner } from './toast';

/** An open dialog (Ionic keeps closed overlays in the DOM with `overlay-hidden`): the banner never comes over it (A-80 ADDENDUM 1, A-73). */
export const overlayOpen = (doc: Document = document): boolean =>
  Array.from(doc.querySelectorAll('ion-alert, ion-modal, ion-action-sheet, ion-popover, ion-loading'))
    .some((e) => !e.classList.contains('overlay-hidden') && e.getBoundingClientRect().width > 0);
const CLEAR_POLL_MS = 1000;
const CLEAR_WAIT_TRIES = 300; // ~5 min of dialogs, then the banner waits for the next day's check

/**
 * A-80 ADDENDUM 1: the start-up update offer (the rule: src/state/updateOffer.ts). IMMEDIATE = Google's own screen; FLEXIBLE = a non-modal
 * banner above the tab bar (Material snackbar, the D73 anchor) «Доступна нова версія — Оновити» with a close «×»; «Оновити» = Play's
 * consent and the background download, then «Нову версію завантажено — Перезапустити». Not from Play / nothing new = nothing.
 */
export function UpdateOffer() {
  const { t, config } = useApp();
  const show = useBanner();
  const ran = useRef(false);
  useEffect(() => {
    if (!config || ran.current) return;
    ran.current = true;
    const banner = async (message: string, action: string, onAction: () => void, testId: string) => {
      for (let i = 0; i < CLEAR_WAIT_TRIES && overlayOpen(); i++) await new Promise((r) => setTimeout(r, CLEAR_POLL_MS));
      if (!overlayOpen()) await show({ message, action, onAction, close: t('common.close'), testId });
    };
    const restart = () => banner(t('update.ready'), t('update.restart'), () => void completeUpdate(), 'update-restart');
    void (async () => {
      const { offer, check } = await startupOffer(checkUpdate, { installed: APP_VERSION, minVersion: config.min_app_version });
      if (offer === 'immediate' && check?.state === 'available') await immediateUpdate(check.info, config);
      else if (offer === 'flexible') await banner(t('update.available'), t('update.do'), () => void flexibleUpdate(() => void restart()), 'update-offer');
      else if (offer === 'restart') await restart();
    })();
  }, [config, show, t]);
  return null;
}
