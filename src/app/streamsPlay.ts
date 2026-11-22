import { videoUrl } from '@/data/live/streams';
import { openVideo } from '@/native/intents';

/**
 * A-161 (3) (cloud_44): THE tap on a LIVE stream outside the app - the widget's live row (`inokapp://tab/streams?play=<id>`) and the push
 * «трансляція почалась» - one rule on both platforms: the app on «Трансляції» FIRST, then the stream's own action on top, exactly what a tap on
 * its row in «Трансляції» does (`openVideo`, A-37: Android - the VIEW intent to YouTube started FROM the app's activity, so Back returns to
 * «Трансляції»; iPhone - the in-app sheet over «Трансляції», «Готово» returns there). No video id = «Трансляції» alone.
 */
export function streamsPlay(go: (to: string) => void, video?: string | null): void {
  go('/streams');
  if (video) void openVideo(videoUrl(video));
}
