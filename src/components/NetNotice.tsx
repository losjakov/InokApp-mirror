import { IonButton } from '@ionic/react';
import { useCallback, useEffect } from 'react';
import { onOfflineOpen, onShareFallback } from '@/native/intents';
import { useToast } from './toast';
import { netFailure, netMessageKey, type NetFailure } from '@/data/netFailure';
import { useT } from '@/state/AppContext';

/**
 * A-125: THE two ways the app says why a network action did not happen (one classification, one message table - src/data/netFailure.ts):
 *  - `NetNotice` - IN PLACE, under the button that was tapped («Показати більше», a card's block, an article that could not open): a polite
 *    live region that is ALWAYS in the page (TalkBack / VoiceOver read the change of its text; a region inserted with its text is often not
 *    read - A-88), the cause in words and «Повторити»;
 *  - `useNetToast` - a tap with no place of its own (an outer link, a video, a star, a refresh): the app's snackbar above the tab bar (Ionic's
 *    toast = role status, aria-live polite) with «Повторити» where repeating makes sense.
 */
export function NetNotice({ failure, onRetry, testId }: { failure: NetFailure | null; onRetry?: () => void; testId: string }) {
  const { t } = useT();
  return (
    <div role="status" aria-live="polite" className="net-notice" data-testid={testId} data-failure={failure ?? ''}>
      {failure && (
        <>
          <p className="net-notice__text">{t(netMessageKey(failure))}</p>
          {onRetry && <IonButton fill="clear" size="small" onClick={onRetry} data-testid={`${testId}-retry`}>{t('net.retry')}</IonButton>}
        </>
      )}
    </div>
  );
}

export function useNetToast(): (e: unknown, retry?: () => void) => Promise<NetFailure> {
  const { t } = useT();
  const toast = useToast();
  return useCallback(async (e, retry) => {
    const f = await netFailure(e);
    toast(t(netMessageKey(f)), { cssClass: 'net-toast', testId: 'net-toast', duration: retry ? 6000 : undefined, action: retry && { text: t('net.retry'), handler: retry } });
    return f;
  }, [t, toast]);
}

/** A-125: wires THE outer-page guard and (T2) the share fallback (src/native/intents.ts) to the app's snackbar - mounted once, inside the tabs. */
export function NetHost(): null {
  const say = useNetToast();
  const { t } = useT();
  const toast = useToast();
  useEffect(() => { onOfflineOpen((retry) => void say(new TypeError('offline'), retry)); return () => onOfflineOpen(null); }, [say]);
  // T2 (cloud_43): the share sheet itself failed -> the link was copied (or not) - ONE snackbar, never a crash
  useEffect(() => { onShareFallback((w) => toast(t(`share.${w}`), { testId: 'share-toast' })); return () => onShareFallback(null); }, [t, toast]);
  return null;
}
