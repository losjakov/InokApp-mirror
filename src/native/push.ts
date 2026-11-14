import { PushNotifications, type ActionPerformed, type PushNotificationSchema } from '@capacitor/push-notifications';
import { registerPlugin } from '@capacitor/core';
import { isNative } from './platform';

/** Local plugin (android/app/src/main/java/info/inok/app/FcmTopicsPlugin.java): FCM topics on the device (A-7). */
interface FcmTopicsPlugin {
  subscribe(o: { topic: string }): Promise<void>; unsubscribe(o: { topic: string }): Promise<void>; openSettings(): Promise<void>;
  /** A-84 (b): articles consumed - no ids = all (Home's «Нове на сайті» seen), else the opened ones; the summary follows (Notifier.java). */
  consumedArticles(o: { ids?: string[] }): Promise<void>;
  /** A-84 (c): the channels live NOW (a fresh live-status) - every «ефір» notification of another channel goes. */
  liveChannels(o: { ids: string[] }): Promise<void>;
}
const FcmTopics = registerPlugin<FcmTopicsPlugin>('FcmTopics', {
  web: () => Promise.resolve({ subscribe: async () => {}, unsubscribe: async () => {}, openSettings: async () => {}, consumedArticles: async () => {}, liveChannels: async () => {} }),
});

/** Browser screens only (as `inok.net`, src/native/network.ts): `localStorage['inok.push']` = 'prompt' | 'granted' | 'denied' plays the
 *  phone's permission, so the soft questions (A-64 / A-67) can be shot; without it the web is 'unsupported' and nothing asks. */
const WEB_KEY = 'inok.push';
const webPerm = (): PushPermission | null => {
  try { const v = localStorage.getItem(WEB_KEY); return v === 'prompt' || v === 'granted' || v === 'denied' ? v : null; } catch { return null; }
};

export const TOPIC_ARTICLES = 'articles';
export const TOPIC_TEST = 'test';
/** The site's article kinds (contract §3 `kind`, §4 topics, R-12) — ONE list for the feed tabs and the notification switches. */
export const ARTICLE_KINDS = ['publication', 'video', 'news'] as const;
export type ArticleKind = (typeof ARTICLE_KINDS)[number];
const KIND_TOPIC: Record<ArticleKind, string> = { publication: 'articles_publications', video: 'articles_video', news: 'articles_news' };
const ARTICLE_TOPICS = new Set<string>([TOPIC_ARTICLES, ...Object.values(KIND_TOPIC)]);

/** The kinds a topic set listens to: `articles` = all three; else the kind topics present. */
export const articleKinds = (topics: string[]): ArticleKind[] =>
  topics.includes(TOPIC_ARTICLES) ? [...ARTICLE_KINDS] : ARTICLE_KINDS.filter((k) => topics.includes(KIND_TOPIC[k]));

/** A-11 / contract §4: a device subscribes to `articles` OR to the kind topics it wants, NEVER both (else every item arrives
 *  twice): all three kinds → `articles` alone; some → their kind topics; none → nothing. Channel topics are kept as they are. */
export function withArticleKinds(topics: string[], kinds: readonly ArticleKind[]): string[] {
  const rest = topics.filter((t) => !ARTICLE_TOPICS.has(t));
  const want = new Set(kinds);
  const art = want.size === ARTICLE_KINDS.length ? [TOPIC_ARTICLES] : ARTICLE_KINDS.filter((k) => want.has(k)).map((k) => KIND_TOPIC[k]);
  return [...art, ...rest];
}
/** A-84 (d) / R-42: the end of a broadcast arrives on its OWN topic `chend_<channel id>` - never on `ch_<id>`, which 1.0.4 listens to and
 *  would draw as a bogus «ефір». Only 1.0.5+ subscribes (client-side, FCM); the site sends nothing there until R-42 is done. */
export const END_TOPIC_PREFIX = 'chend_';
const CHANNEL_TOPIC = /^ch_(\d+)$/;
/** The device's FCM topic set for the wanted (settings) topics: each channel topic brings its end topic along. The settings and any
 *  server call keep the contract's topics only (contract §3 POST push-subscriptions validates the contract's topics; the app does not call it in v1). */
export function deviceTopics(wanted: readonly string[]): string[] {
  const out = new Set(wanted);
  for (const t of wanted) { const m = CHANNEL_TOPIC.exec(t); if (m) out.add(`${END_TOPIC_PREFIX}${m[1]}`); }
  return [...out];
}

/** Debug builds (CI: VITE_PUSH_TEST=1) also listen to the site's `test` topic — the owner's phone proof (PHONE_TEST_BACKLOG). */
export const PUSH_TEST = import.meta.env.VITE_PUSH_TEST === '1';
/** cloud_21: the words that exist in the built bundle ONLY when it listens to `test` (the release bundle drops the branch) - build.yml greps them. */
export const PUSH_TEST_MARK = 'InokPush-test-topic-on';

export type PushPermission = 'granted' | 'denied' | 'prompt' | 'unsupported';
export interface PushMessage { type: 'stream_live' | 'article' | string; data: Record<string, string> }

const log = (...a: unknown[]) => console.info('InokPush:', ...a); // grep-able in logcat (scripts/emulator_smoke.sh), never the token

let registered = false;
let subscribed = new Set<string>();
let onTap: ((m: PushMessage) => void) | null = null;
let onMessage: ((m: PushMessage) => void) | null = null;

export async function pushPermission(): Promise<PushPermission> {
  if (!isNative()) return webPerm() ?? 'unsupported';
  const s = await PushNotifications.checkPermissions();
  return s.receive === 'granted' ? 'granted' : s.receive === 'denied' ? 'denied' : 'prompt';
}

/** Asks the system (Android 13+ shows the dialog once); 'granted' lets registration proceed. */
export async function requestPushPermission(): Promise<PushPermission> {
  if (!isNative()) {
    const w = webPerm(); // the browser's play: «prompt» is answered «allow»
    if (w === 'prompt') { try { localStorage.setItem(WEB_KEY, 'granted'); } catch { /* none */ } return 'granted'; }
    return w ?? 'unsupported';
  }
  const s = await PushNotifications.requestPermissions();
  return s.receive === 'granted' ? 'granted' : 'denied';
}

/** A-67: the phone's notification settings of this app (a refused permission is changed only there; Android 8+). */
export async function openNotificationSettings(): Promise<void> {
  try { await FcmTopics.openSettings(); } catch (e) { log('open settings failed', String(e)); }
}

const toMessage = (n: PushNotificationSchema): PushMessage => {
  const data = (n.data ?? {}) as Record<string, string>;
  return { type: String(data.type ?? ''), data };
};

/** Registers the FCM token once (the value is never logged) and wires the listeners. Resolves true when registered. */
export async function registerPush(handlers: { onTap: (m: PushMessage) => void; onMessage: (m: PushMessage) => void }): Promise<boolean> {
  onTap = handlers.onTap;
  onMessage = handlers.onMessage;
  if (!isNative() || registered) return registered;
  const done = new Promise<boolean>((resolve) => {
    void PushNotifications.addListener('registration', () => { registered = true; log('registered'); resolve(true); });
    void PushNotifications.addListener('registrationError', (e) => { log('registration error', JSON.stringify(e)); resolve(false); });
  });
  void PushNotifications.addListener('pushNotificationReceived', (n) => onMessage?.(toMessage(n)));
  void PushNotifications.addListener('pushNotificationActionPerformed', (a: ActionPerformed) => onTap?.(toMessage(a.notification)));
  try {
    await PushNotifications.register();
  } catch (e) {
    log('register failed', String(e));
    return false;
  }
  return Promise.race([done, new Promise<boolean>((r) => setTimeout(() => r(registered), 20000))]);
}

/** Makes the device's topic set equal to `wanted` (+ `test` in debug builds). Idempotent; logs each change. */
export async function syncTopics(wanted: string[]): Promise<void> {
  if (!isNative() || !registered) return;
  const want = new Set(deviceTopics(wanted));
  if (PUSH_TEST) { want.add(TOPIC_TEST); log(PUSH_TEST_MARK); }
  for (const t of want) {
    if (subscribed.has(t)) continue;
    try { await FcmTopics.subscribe({ topic: t }); subscribed.add(t); log('subscribed', t); } catch (e) { log('subscribe failed', t, String(e)); }
  }
  for (const t of Array.from(subscribed)) {
    if (want.has(t)) continue;
    try { await FcmTopics.unsubscribe({ topic: t }); subscribed.delete(t); log('unsubscribed', t); } catch (e) { log('unsubscribe failed', t, String(e)); }
  }
}

/** A-84 (b): the tray forgets what the app has shown - all articles (Home's «Нове на сайті» seen) or the opened ones. Never throws. */
export async function consumedArticles(ids?: string[]): Promise<void> {
  if (!isNative()) return;
  try { await FcmTopics.consumedArticles(ids ? { ids } : {}); } catch (e) { log('consume failed', String(e)); }
}

/** A-84 (c): a FRESH live-status lists the live channels; the tray keeps «ефір» notifications of those only. Never throws. */
export async function liveChannelsNow(ids: Array<number | string>): Promise<void> {
  if (!isNative()) return;
  try { await FcmTopics.liveChannels({ ids: ids.map(String) }); } catch (e) { log('live channels failed', String(e)); }
}

/** Test seam: forget the device state (unit tests). */
export function _resetPushState(): void { registered = false; subscribed = new Set(); }
