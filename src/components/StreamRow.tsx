import { IonIcon, IonItem, IonLabel } from '@ionic/react';
import { churchOutline } from '@/components/icons';
import { CoverImage } from '@/components/CoverImage';
import { field, rowSubtitle, type ChannelRow } from '@/data/repo/types';
import { openVideo } from '@/native/intents';
import { useApp } from '@/state/AppContext';
import { channelUrl } from '@/data/live/streams';

/** THE «open a channel» of every screen (A-37, A-15): the broadcast while it is live, else the channel's page — in the YouTube app. */
export function useOpenChannel(): (channel: Pick<ChannelRow, 'id' | 'youtube_url'>) => void {
  const { live } = useApp();
  return (channel) => void openVideo(channelUrl(channel, live?.status));
}

/**
 * The channel's round avatar as YouTube shows a channel (A-17): the site's channel picture (R-16 `avatar`; the church-dome
 * placeholder while it is null or not downloaded yet); live = a red ring + a red dot at its top-right, no text.
 * Cached on the device like the covers (offline, Wi-Fi setting). The ONE avatar of every stream row: streams tab, home «Зараз в ефірі», notifications.
 */
export function ChannelAvatar({ channel, live }: { channel: ChannelRow; live?: boolean }) {
  const { t } = useApp();
  return (
    <span className={`chav${live ? ' chav--live' : ''}`} slot="start" data-testid={live ? 'live-avatar' : undefined}
      role={live ? 'img' : undefined} aria-label={live ? t('home.live_hint') : undefined} aria-hidden={live ? undefined : true}>
      <CoverImage code={`ch${channel.id}`} url={channel.avatar_url ?? null} version={channel.avatar_sha256} small alt="" className="chav__img"
        fallback={<IonIcon icon={churchOutline} aria-hidden="true" />} />
    </span>
  );
}

/** One stream row (D7/D14/A-17): avatar · channel name / the stream's own title / «місто · область · єпархія». */
export function StreamRow({ channel, second, live, place = true, testId }: { channel: ChannelRow; second?: string | null; live?: boolean; place?: boolean; testId?: string }) {
  const { lang, dict } = useApp();
  const open = useOpenChannel();
  const where = place ? rowSubtitle(channel, lang, dict) : '';
  return (
    <IonItem button detail={false} onClick={() => open(channel)} className="srow" data-testid={testId ?? `srow-${channel.id}`}>
      <ChannelAvatar channel={channel} live={live} />
      <IonLabel>
        <h2>{field(channel, 'title', lang)}</h2>
        {second && <p className="srow__second">{second}</p>}
        {where && <p className="srow__place">{where}</p>}
      </IonLabel>
    </IonItem>
  );
}
