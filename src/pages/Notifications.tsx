import { IonButton, IonContent, IonItem, IonLabel, IonList, IonNote, IonToggle, IonPage } from '@ionic/react';
import { SearchField } from '@/components/SearchField';
import { ListBox, ListHeading } from '@/components/ListHeading';
import { useEffect, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { CHANNELS_ANCHOR } from '@/components/SoftAsk';
import { shownOn } from '@/state/softAsk';
import { PageHeader } from '@/components/PageHeader';
import { ChannelAvatar } from '@/components/StreamRow';
import { listChannels } from '@/data/repo/channels';
import { field, type ChannelRow } from '@/data/repo/types';
import { ARTICLE_KINDS, articleKinds, openNotificationSettings, withArticleKinds, type ArticleKind } from '@/native/push';
import { normalize } from '@/data/search/normalize';

const SEARCH_FROM = 12;
import { useApp } from '@/state/AppContext';
import { useToast } from '@/components/toast';
import { online } from '@/native/network';

/** Spec §5 / A-7: one switch for articles, one per channel; topics live on the device, the server keeps nothing. */
export function NotificationsPage() {
  const { db, t, lang, liveChannelIds, settings, setSettings, push, pushRegistered, enablePush } = useApp();
  const [channels, setChannels] = useState<ChannelRow[]>([]);
  useEffect(() => { listChannels(db, lang).then(setChannels); }, [db, lang]);
  // A-64: a switch is ON only while the system permission is there; turning one on asks the system FIRST (the Android 13+ dialog) -
  // refused = the switch stays off and the status line says why (never a switch that shows on while nothing can arrive)
  const allowed = async () => push === 'granted' || push === 'unsupported' || (await enablePush()) === 'granted';
  const on = (topic: string) => shownOn(settings.topics.includes(topic), push);
  const toggle = async (topic: string, want: boolean) => {
    if (want && !(await allowed())) return;
    const topics = want ? Array.from(new Set([...settings.topics, topic])) : settings.topics.filter((x) => x !== topic);
    await setSettings({ topics });
    await saidLater();
  };
  // A-125 (cloud_38): a switch changed without a network is kept and applied when the network comes back (AppContext re-syncs then) - said
  const toast = useToast();
  const saidLater = async () => { if (!(await online())) toast(t('net.later'), { testId: 'push-later', duration: 4000 }); };
  const kinds = shownOn(true, push) ? articleKinds(settings.topics) : [];
  const setKinds = async (k: readonly ArticleKind[]) => {
    if (k.length && !(await allowed())) return;
    await setSettings({ topics: withArticleKinds(settings.topics, k) });
    await saidLater();
  };
  // A-67: «Обрати канали» opens this screen at the channel list
  const { hash } = useLocation();
  const channelsHead = useRef<HTMLIonListHeaderElement>(null);
  useEffect(() => {
    if (hash === `#${CHANNELS_ANCHOR}` && channels.length) channelsHead.current?.scrollIntoView({ block: 'start' });
  }, [hash, channels.length]);
  const [q, setQ] = useState('');
  const nq = normalize(q);
  const shown = nq ? channels.filter((c) => normalize(['uk', 'ru', 'en'].map((l) => field(c, 'title', l as typeof lang)).join(' ')).includes(nq)) : channels;
  const status = push === 'denied' ? t('notifications.denied') : push === 'unsupported' ? t('notifications.web') : pushRegistered ? t('notifications.ready') : t('notifications.ask');
  return (
    <IonPage>
      <PageHeader title={t('notifications.title')} />
      <IonContent>
        <IonNote className="ion-padding-horizontal notifications__status" data-testid="push-status" role="status">{status}</IonNote>
        {/* cloud_38 (A2): refused in the system = the line above says so AND the way back is one tap (iOS asks only once; Android 13+ too) */}
        {push === 'denied' && (
          <IonButton fill="outline" expand="block" className="ion-margin-horizontal notifications__settings" onClick={() => void openNotificationSettings()} data-testid="push-open-settings">
            {t('ask.open_settings')}
          </IonButton>
        )}
        <IonList data-testid="push-list">
          {/* A-11: «Нові статті» = the master switch; under it the three kinds (all on = `articles`, some = their kind topics) */}
          <IonItem lines="none">
            <IonToggle checked={kinds.length > 0} onIonChange={(e) => void setKinds(e.detail.checked ? ARTICLE_KINDS : [])} data-testid="topic-articles">
              <IonLabel>{t('notifications.articles')}
                <p>{kinds.length === ARTICLE_KINDS.length || kinds.length === 0 ? t('notifications.articles_hint') : kinds.map((k) => t(`kind.${k}`)).join(', ')}</p>
              </IonLabel>
            </IonToggle>
          </IonItem>
          {ARTICLE_KINDS.map((k, i) => (
            <IonItem key={k} className="push__kind" lines={i === ARTICLE_KINDS.length - 1 ? 'full' : 'none'}>
              <IonToggle checked={kinds.includes(k)} onIonChange={(e) => void setKinds(e.detail.checked ? [...kinds, k] : kinds.filter((x) => x !== k))} data-testid={`kind-${k}`}>
                {t(`kind.${k}`)}
              </IonToggle>
            </IonItem>
          ))}
          <ListHeading headRef={channelsHead} testId="push-channels" label={t('notifications.streams')} />
          {/* D17: the channel list under its own header, with a search once it is longer than a screen */}
          {channels.length > SEARCH_FROM && (
            <ListBox><SearchField value={q} onIonInput={(e) => setQ(e.detail.value ?? '')} placeholder={t('notifications.search')} data-testid="channel-search" className="push__search" /></ListBox>
          )}
          {shown.map((c) => (
            <IonItem key={c.id}>
              <ChannelAvatar channel={c} live={liveChannelIds.has(c.id)} />
              <IonToggle checked={on(c.push_topic)} onIonChange={(e) => void toggle(c.push_topic, e.detail.checked)} data-testid={`topic-${c.push_topic}`}>
                <IonLabel className="ion-text-wrap">{field(c, 'title', lang)}</IonLabel>
              </IonToggle>
            </IonItem>
          ))}
        </IonList>
      </IonContent>
    </IonPage>
  );
}
