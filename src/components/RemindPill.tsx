import { IonIcon } from '@ionic/react';
import { notifications, notificationsOutline } from 'ionicons/icons';
import { useApp } from '@/state/AppContext';
import { useReminders } from '@/state/reminders';
import { canRemind, fireAt } from '@/native/reminders';
import { timeOf } from '@/data/live/streams';
import { useToast } from './toast';
import { openNotificationSettings } from '@/native/push';

/** T8 (A-153 (1), variant B): the pill under a «Заплановані» row - «🔔 Нагадати за 10 хв» / «🔔 Нагадаю о HH:MM · Скасувати»; a native
 *  button (48 dp), its accessible name the whole action, starting with the visible words (WCAG 2.5.3, axe label-content-name-mismatch); none when the start is < 10 min away or the stream has no video id. */
export function RemindPill({ channel_id, channel, video_id, at, title }: { channel_id: number; channel: string; video_id?: string; at: string; title?: string }) {
  const { t, lang } = useApp();
  const rem = useReminders();
  const toast = useToast();
  const on = rem.has(channel_id, video_id);
  if (!on && !canRemind(at, video_id)) return <div className="remind" aria-hidden="true" />; // the row's separator stays (the row above draws none)
  const time = timeOf(new Date(fireAt(at)).toISOString(), lang);
  const name = title || channel;
  const tap = async () => {
    if (on) { await rem.cancel(on); toast(t('remind.cancelled'), { testId: 'remind-toast' }); return; }
    const r = await rem.remind({ channel_id, video_id: video_id!, at, title, channel });
    if (r === 'denied') toast(t('notifications.denied'), { testId: 'remind-toast', duration: 6000, action: { text: t('ask.open_settings'), handler: () => void openNotificationSettings() } });
    else toast(t('remind.toast', { time }), { testId: 'remind-toast' });
  };
  return (
    <div className="remind" role="listitem">
      <button type="button" className={`remind__pill${on ? ' remind__pill--on' : ''}`} onClick={() => void tap()} aria-pressed={!!on}
        aria-label={on ? undefined : t('remind.a11y_off', { title: name })} data-testid={`remind-${channel_id}`} data-on={on ? '1' : '0'}>
        <IonIcon icon={on ? notifications : notificationsOutline} aria-hidden="true" />
        <span>{on ? t('remind.on', { time }) : t('remind.pill')}</span>
      </button>
    </div>
  );
}
