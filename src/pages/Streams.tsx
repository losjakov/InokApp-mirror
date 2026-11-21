import { IonContent, IonList, IonPage, useIonViewDidEnter, useIonViewWillLeave } from '@ionic/react';
import { ListHeading } from '@/components/ListHeading';
import { StatusNote } from '@/components/StatusNote';
import { Fragment, useEffect, useMemo, useState } from 'react';
import { RemindPill } from '@/components/RemindPill';
import { field } from '@/data/repo/types';
import { addCircleOutline } from 'ionicons/icons';
import { SiteFormButton } from '@/components/SiteFormButton';
import { openOnSite } from '@/native/intents';
import { ShareFooter } from '@/components/ShareFooter';
import { SoftAsk } from '@/components/SoftAsk';
import { sitePageUrl } from '@/data/links/sitePages';
import { PageHeader } from '@/components/PageHeader';
import { useRefresh } from '@/components/Refresh';
import { StreamRow } from '@/components/StreamRow';
import { listChannels } from '@/data/repo/channels';
import { CalendarStrip } from '@/components/CalendarStrip';
import { groupChannels, streamTitle, timeOf } from '@/data/live/streams';
import type { ChannelRow } from '@/data/repo/types';
import { useApp } from '@/state/AppContext';
import { pickLang } from '@/i18n';

/** A-85 (1): the site's anchor that opens its «add a channel» window on /live/ (data-skm-cta="channel"; R-43 makes the anchor open it). */
export const CHANNEL_FORM = 'skm-cta-channel';

/** Spec §5: channels offline, live status while visible, open in the YouTube app (A-4.2); grouped as the site's /live/ (D7). */
export function StreamsPage() {
  const { db, t, lang, live, refreshLive, config } = useApp();
  const [channels, setChannels] = useState<ChannelRow[]>([]);
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    listChannels(db, lang).then(setChannels);
  }, [db, lang]);
  useIonViewDidEnter(() => setVisible(true));
  useIonViewWillLeave(() => setVisible(false));
  // poll live-status only while the page is visible, at the interval config says (contract §3: 120 s)
  useEffect(() => {
    if (!visible) return;
    void refreshLive();
    const id = window.setInterval(() => void refreshLive(), (config?.live_poll_seconds ?? 120) * 1000);
    return () => window.clearInterval(id);
  }, [visible, config?.live_poll_seconds, refreshLive]);
  const refresh = useRefresh(refreshLive);
  const groups = useMemo(() => groupChannels(channels, live?.status), [channels, live]);

  const header = (key: string, n: number) => (
    <ListHeading className="srow__group" label={`${t(key)} · ${n}`} />
  );

  return (
    <IonPage>
      <PageHeader title={t('streams.title')} end={refresh.button} />
      <IonContent>
        {refresh.puller}
        <CalendarStrip />
        <StatusNote text={!!live?.stale && t('streams.offline_hint')} testId="streams-stale" />
        {channels.length === 0 ? <div className="empty">{t('streams.empty')}</div> : (
          <IonList data-testid="channels">
            {groups.online.length > 0 && header('streams.online', groups.online.length)}
            {groups.online.map(({ channel, live: l }) => <StreamRow key={channel.id} channel={channel} second={streamTitle(pickLang(l.title, lang))} live />)}
            {groups.scheduled.length > 0 && header('streams.scheduled', groups.scheduled.length)}
            {groups.scheduled.map(({ channel, at, title, video_id }) => (
              <Fragment key={channel.id}>
                <StreamRow channel={channel} lines="none" second={[t('streams.starts', { time: timeOf(at, lang) }), streamTitle(pickLang(title, lang))].filter(Boolean).join(' · ')} />
                {/* T8 (A-153 (1)): «Нагадати за 10 хв» under the row */}
                <RemindPill channel_id={channel.id} channel={field(channel, 'title', lang)} video_id={video_id} at={at} title={streamTitle(pickLang(title, lang)) || undefined} />
              </Fragment>
            ))}
            {groups.offline.length > 0 && header('streams.offline', groups.offline.length)}
            {groups.offline.map((c) => <StreamRow key={c.id} channel={c} />)}
          </IonList>
        )}
        {/* A-85 (1): at the END of the content, the site's own words; the site's form «Додати канал» (R-43: /live/ opens it on the anchor) */}
        <div className="streams__add">
          <SiteFormButton icon={addCircleOutline} label={t('streams.add_channel')} offline={t('streams.add_channel_offline')} testId="channel-add"
            offlineTestId="channel-add-offline" onOpen={() => openOnSite(sitePageUrl('/streams', lang), lang, CHANNEL_FORM)} />
        </div>
        <ShareFooter title={t('streams.title')} url={sitePageUrl('/streams', lang)} />
        <SoftAsk kind="streams" active={visible} />
      </IonContent>
    </IonPage>
  );
}
