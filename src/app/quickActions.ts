/**
 * cloud_41 (A-133 C1): THE quick actions on the app icon - Android static shortcuts (android/app/src/main/res/xml/shortcuts.xml) and iOS
 * Home Screen quick actions (ios/App/App/Info.plist + SceneDelegate) - FOUR, in the owner's order. The system hands each to the app as an
 * in-app address `inokapp://tab/<id>` through the SAME path as a link (the launch URL on a cold start, `appUrlOpen` from the background),
 * and the app's ONE link router (src/app/links.ts `linkRoute`) turns it into the tab's route. Unit `quickActions` pins the three lists.
 */
export const QUICK_PREFIX = 'inokapp://tab/';
export const QUICK_ACTIONS = [
  { id: 'streams', to: '/streams' },
  { id: 'monasteries', to: '/monasteries' },
  { id: 'map', to: '/map' },
  { id: 'articles', to: '/articles' },
] as const;

/** cloud_43 (T11): the system's other ways in that name a screen by the same address form - Siri / Shortcuts «Обителі поруч» (Home with
 *  «Поруч»); not an icon quick action (the four above stay the owner's list) */
export const SYSTEM_ROUTES = [{ id: 'home', to: '/home' }] as const;

/** the tab route of a quick action's address, or null (any other address: the link router's other rules) */
export function quickRoute(url: string | null | undefined): string | null {
  if (!url || !url.toLowerCase().startsWith(QUICK_PREFIX)) return null;
  const id = url.slice(QUICK_PREFIX.length).replace(/[/?#].*$/, '');
  return [...QUICK_ACTIONS, ...SYSTEM_ROUTES].find((a) => a.id === id)?.to ?? null;
}

/** A-174 (cloud_46): the Android countdown's «Скасувати» - `inokapp://tab/streams?cancel=<channel id>.<video id>`: «Трансляції» + that
 *  reminder cancelled by the app's own path (its countdown goes with it); null for every other address */
export function quickCancel(url: string | null | undefined): { channel_id: number; video_id: string } | null {
  if (quickRoute(url) !== '/streams') return null;
  const m = /[?&]cancel=(\d{1,9})\.([A-Za-z0-9_-]{6,20})(?:[&#]|$)/.exec(url!);
  return m ? { channel_id: Number(m[1]), video_id: m[2] } : null;
}
/** the app's event that carries such a cancel to the reminders (src/state/reminders.tsx) */
export const CANCEL_EVENT = 'inok-reminder-cancel';

/** A-161 (3) (cloud_44): the widget's live row `inokapp://tab/streams?play=<video id>` - the stream to open ON TOP of «Трансляції» (a YouTube
 *  video id only: letters, digits, «_», «-»; anything else = «Трансляції» alone); null for every other address */
export function quickPlay(url: string | null | undefined): string | null {
  if (quickRoute(url) !== '/streams') return null;
  const v = /[?&]play=([^&#]*)/.exec(url!)?.[1] ?? '';
  return /^[A-Za-z0-9_-]{6,20}$/.test(v) ? v : null;
}
