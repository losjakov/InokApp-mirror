import { IonButton, IonIcon, IonRefresher, IonRefresherContent } from '@ionic/react';
import { Busy } from '@/components/Busy';
import { useToast } from '@/components/toast';
import { refreshOutline } from 'ionicons/icons';
import { useCallback, useRef, useState, type ReactNode } from 'react';
import { useApp, useT } from '@/state/AppContext';
import { REFRESH_MESSAGE } from '@/data/refresh';
import { useNetToast } from './NetNotice';
import { online } from '@/native/network';

/**
 * ONE refresh rule (owner 02.11.2026 to ИА; A-15): a screen whose content changes while it is open (a live feed, newest first) gets BOTH
 * the pull-down gesture and a «Оновити» button in its header — the same action. Android «Add swipe-to-refresh»: the gesture is hidden and
 * gives no accessibility action, so the app bar carries a refresh action too. Screens of the daily directory, the map and settings get none.
 */
export function useRefresh(run: () => Promise<unknown>, running0 = false): { button: ReactNode; puller: ReactNode } {
  const { t } = useT();
  const [busy1, setBusy] = useState(false);
  const busy = busy1 || running0; // A-52: the same refresh started elsewhere (the Home bottom line, the return) - one spinner, the button off
  const running = useRef<Promise<void> | null>(null);
  const netToast = useNetToast();
  const go = useCallback((): Promise<void> => {
    // one refresh at a time: a pull during a button refresh waits for the same run
    running.current ??= (async () => {
      setBusy(true);
      try {
        // A-125 (cloud_38): without a network the refresh says so at once (1.0.11: the spinner turned and nothing was said)
        if (!(await online())) { void netToast(new TypeError('offline'), () => void go()); return; }
        await run();
      } catch (e) { void netToast(e, () => void go()); } finally { setBusy(false); running.current = null; } // each source keeps its cache
    })();
    return running.current;
  }, [run, netToast]);
  const button = (
    <IonButton onClick={() => void go()} disabled={busy} aria-label={t('common.refresh')} title={t('common.refresh')} data-testid="refresh" data-busy={busy ? '1' : '0'}>
      {busy ? <Busy slot="icon-only" name="crescent" className="refresh__spin" /> : <IonIcon slot="icon-only" icon={refreshOutline} aria-hidden="true" />}
    </IonButton>
  );
  const puller = <IonRefresher slot="fixed" onIonRefresh={(e) => void go().finally(() => e.detail.complete())}><IonRefresherContent /></IonRefresher>;
  return { button, puller };
}

/** A-52: the manual entries (the Home button, its pull-down, the Home bottom line, «Ще → Оновити дані») = the ONE full refresh + ONE result message. */
export function useDataRefresh(): () => Promise<void> {
  const { t, refreshAll } = useApp();
  const toast = useToast();
  return useCallback(async () => {
    const r = await refreshAll();
    toast(t(REFRESH_MESSAGE[r]), { cssClass: 'refresh-toast' });
  }, [refreshAll, t, toast]);
}
