import { useIonAlert } from '@ionic/react';
import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useToast } from './toast';
import { openNotificationSettings } from '@/native/push';
import { isIos } from '@/native/platform';
import { ASK_DELAY_MS, afterAnswer, shouldAsk } from '@/state/softAsk';
import type { AskKind } from '@/state/settings';
import { useApp } from '@/state/AppContext';

/** The notification screen's channel list (A-67 «Обрати канали» lands there). */
export const CHANNELS_ANCHOR = 'channels';

/** A-64 / A-67: THE soft notification question - ONE component, two uses (after the first opened article; the first open of
 *  «Трансляції»). Texts A-70 (uk byte for byte). Asked once each, the two INDEPENDENT (A-73); with the permission refused (Android 13+) it
 *  says so and opens the phone's settings. «Так» (articles) = all three kinds, after the system dialog; refused there = nothing on. */
export function SoftAsk({ kind, active = true }: { kind: AskKind; active?: boolean }) {
  const { t, settings, setSettings, push, enablePush } = useApp();
  const [ask] = useIonAlert();
  const navigate = useNavigate();
  const toast = useToast();
  // cloud_36 (B2): iOS 1.0.11 delivers no notification (no FCM on iOS, REF_ios_state) - nothing invites the person to switch them on there
  const due = active && !isIos() && shouldAsk(kind, settings, push);
  useEffect(() => {
    if (!due) return;
    const timer = window.setTimeout(() => {
      const done = (yesGranted = false) => setSettings(afterAnswer(kind, settings, yesGranted));
      const no = { text: t('ask.no'), role: 'cancel', handler: () => { void done(); } };
      const denied = push === 'denied';
      const main = denied
        ? [{ text: t('ask.open_settings'), handler: () => { void done(); void openNotificationSettings(); } }]
        : kind === 'articles'
          ? [{ text: t('ask.yes'), handler: () => { void (async () => {
                const p = push === 'granted' ? 'granted' : await enablePush();
                await done(p === 'granted');
                if (p !== 'granted') toast(t('notifications.denied'));
              })(); } },
             { text: t('ask.setup'), handler: () => { void done(); navigate('/more/notifications'); } }]
          : [{ text: t('ask.channels'), handler: () => { void done(); navigate(`/more/notifications#${CHANNELS_ANCHOR}`); } }];
      void ask({
        header: t(`ask.${kind}`), message: denied ? t('notifications.denied') : undefined,
        cssClass: `inok-dialog soft-ask soft-ask--${kind}${denied ? '' : ' soft-ask--plain'}`, backdropDismiss: false,
        buttons: [...main, no],
      });
    }, ASK_DELAY_MS);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once per «due»: the answer's own closure reads the settings of that moment
  }, [due, kind]);
  return null;
}
