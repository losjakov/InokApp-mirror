import { ARTICLE_KINDS, articleKinds, withArticleKinds, type PushPermission } from '@/native/push';
import type { AskKind, Settings } from './settings';

/** A-64 / A-67: the ONE rule of the two soft notification questions (the dialog is src/components/SoftAsk.tsx).
 *  - each is asked ONCE (`settings.asked`): the two are INDEPENDENT (A-73) - its own flag, «Ні, дякую» closes only its own question,
 *    no cap per launch (A-67's «one per launch» dropped by the owner's words);
 *  - never where notifications cannot work (the web: 'unsupported') and never when what it offers is already on;
 *  - a switch is ON only while the system permission is there (`shownOn`) - a topic without the permission is not «on». */
export const ASK_DELAY_MS = 2500; // the article / the streams tab is seen first, then the question (never over the first screen)

const isChannel = (t: string) => t.startsWith('ch_');
export const shownOn = (on: boolean, push: PushPermission): boolean => on && (push === 'granted' || push === 'unsupported');
const offered = (kind: AskKind, topics: string[]) => (kind === 'articles' ? articleKinds(topics).length > 0 : topics.some(isChannel));

export function shouldAsk(kind: AskKind, s: Pick<Settings, 'asked' | 'topics'>, push: PushPermission): boolean {
  if (push === 'unsupported' || s.asked.includes(kind)) return false;
  return !shownOn(offered(kind, s.topics), push);
}

/** The settings after an answer. «Так» (articles) = all three kinds on - but only once the permission is granted. */
export function afterAnswer(kind: AskKind, s: Pick<Settings, 'asked' | 'topics'>, yesGranted: boolean): Pick<Settings, 'asked' | 'topics'> {
  const asked = s.asked.includes(kind) ? s.asked : [...s.asked, kind];
  return { asked, topics: kind === 'articles' && yesGranted ? withArticleKinds(s.topics, ARTICLE_KINDS) : s.topics };
}
