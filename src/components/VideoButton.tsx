import { IonButton, IonIcon } from '@ionic/react';
import { logoFacebook, logoYoutube, videocamOutline } from 'ionicons/icons';
import type { VideoLink } from '@/data/api/types';
import { openVideo } from '@/native/intents';
import { useApp } from '@/state/AppContext';

/** R-47 (A-101): the host's icon and words of the ONE video button (TalkBack: the name = the words, the icon is hidden). */
export const VIDEO_FACE = {
  youtube: { icon: logoYoutube, label: 'articles.watch' },
  facebook: { icon: logoFacebook, label: 'articles.watch_facebook' },
  other: { icon: videocamOutline, label: 'articles.watch_other' },
} as const;
export const videoFace = (v: VideoLink) => VIDEO_FACE[v.host === 'youtube' || v.host === 'facebook' ? v.host : 'other'];

/** The video of an item, any kind, above the lead; opens the video's own page in the phone's handler app (`openVideo`). */
export function VideoButton({ video }: { video: VideoLink }) {
  const { t } = useApp();
  const f = videoFace(video);
  return (
    <IonButton expand="block" onClick={() => void openVideo(video.url)} data-testid="article-video" data-host={video.host}>
      <IonIcon slot="start" icon={f.icon} aria-hidden="true" />{t(f.label)}
    </IonButton>
  );
}
