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

/** the tab route of a quick action's address, or null (any other address: the link router's other rules) */
export function quickRoute(url: string | null | undefined): string | null {
  if (!url || !url.toLowerCase().startsWith(QUICK_PREFIX)) return null;
  const id = url.slice(QUICK_PREFIX.length).replace(/[/?#].*$/, '');
  return QUICK_ACTIONS.find((a) => a.id === id)?.to ?? null;
}
