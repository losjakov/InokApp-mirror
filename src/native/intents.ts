import { Browser } from '@capacitor/browser';
import { Share } from '@capacitor/share';
import { isIos, isNative } from './platform';
import type { Lang } from '@/i18n';
import { SITE_HOSTS } from '@/data/api/client';
import { online } from './network';
import { isUserCancel } from '@/app/userCancel';
export { isUserCancel };

/** tel: / mailto: / geo: — Capacitor's WebView hands these schemes to the system (intent). On the web: same via the browser. */
const go = (url: string) => {
  window.location.href = url;
};
/** A system intent by address (`market://` = the Play app, A-46); the same hand-over as tel: / mailto:. */
export const openSystemUrl = go;
export const callPhone = (phone: string) => go(`tel:${phone.replace(/[^+\d]/g, '')}`);
export const mailTo = (email: string) => go(`mailto:${email}`);

/** A-125 (cloud_38): an outer page / a video / a broadcast opened WITHOUT a network showed a browser's own error page (or nothing) - the app
 *  says why instead, with «Повторити». The device's own word decides (src/native/network.ts); the words and the snackbar are the app's
 *  (src/components/NetNotice.tsx `useNetToast`, wired once by the tabs). Unwired (a unit test, the first-run screen) = opened as before. */
let whenOffline: ((retry: () => void) => void) | null = null;
export const onOfflineOpen = (h: typeof whenOffline): void => { whenOffline = h; };
const offlineSaid = async (retry: () => void): Promise<boolean> => {
  if (!whenOffline || (await online())) return false;
  whenOffline(retry);
  return true;
};

/** https links: the in-app browser tab (`@capacitor/browser` = Custom Tabs / SFSafariViewController, A-33), a new tab on the web. */
export async function openExternal(url: string): Promise<void> {
  if (await offlineSaid(() => void openExternal(url))) return;
  if (isNative()) await Browser.open({ url });
  else window.open(url, '_blank', 'noopener');
}

/**
 * THE address of a page of inok.info in the interface language (A-15, one rule for every «open on the site»): uk = the page as
 * the site gives it; ru / en add `?lang=` unless the address already names a language (the feed's `site_url` does); `hash` =
 * an anchor the page acts on (A-33: `#skm-comment-add` opens the site's comment form at once, InokSite T-1319).
 * A-96 W-1: any other host (a house's own website, YouTube, Wikipedia) comes back UNCHANGED - so every link may pass through it.
 */
export function siteUrl(url: string, lang: Lang, hash?: string): string {
  const u = new URL(url);
  if (!SITE_HOSTS.has(u.host)) return url;
  if (lang !== 'uk' && !u.searchParams.has('lang')) u.searchParams.set('lang', lang);
  if (hash) u.hash = hash;
  return u.toString();
}

/** A-96 W-1: THE «open a link» of every screen - an inok.info page in the app's language (`siteUrl`), any other address as it is. */
export const openLink = (url: string, lang: Lang): Promise<void> => openExternal(siteUrl(url, lang));

/** Opens a page of the site in the in-app tab and resolves when the person closes it (A-33: then the app re-reads what may have changed). */
export async function openOnSite(url: string, lang: Lang, hash?: string): Promise<void> {
  const to = siteUrl(url, lang, hash);
  if (await offlineSaid(() => void openOnSite(url, lang, hash))) return;
  if (!isNative()) { window.open(to, '_blank', 'noopener'); return; }
  let closed!: () => void;
  const done = new Promise<void>((r) => { closed = r; });
  const h = await Browser.addListener('browserFinished', () => closed());
  try { await Browser.open({ url: to }); await done; } finally { await h.remove(); }
}

/** YouTube channel → the YouTube app via its https URL (Android resolves it to the app when installed; A-4.2). */
/** R-47 (A-101): a video's own page - YouTube, Facebook or another host - by the SAME implicit VIEW intent as before (Capacitor Browser binds no
 *  Custom Tabs session, gotcha 3): the phone's handler app opens it (the YouTube / Facebook app when installed), else the browser. Never openOnSite. */
export const openVideo = (url: string) => openExternal(url);

export type DirectionsApp = 'google' | 'waze' | 'other';
export function directions(lat: number, lon: number, label: string, app: DirectionsApp): Promise<void> | void {
  const q = `${lat},${lon}`;
  if (app === 'google') return openExternal(`https://www.google.com/maps/dir/?api=1&destination=${q}`);
  if (app === 'waze') return openExternal(`https://waze.com/ul?ll=${q}&navigate=yes`);
  // cloud_36 (B2): iOS knows no `geo:` - the system Maps app by its own scheme (Capacitor hands a non-web scheme to the system)
  if (isIos()) return go(`maps://?daddr=${q}&q=${encodeURIComponent(label)}`);
  return go(`geo:${q}?q=${q}(${encodeURIComponent(label)})`);
}

/** T2: what the app says when the sheet itself failed - wired once by the tabs (ShareHost) to the app's snackbar; unwired = silent. */
export type ShareWord = 'copied' | 'failed';
let shareSaid: ((w: ShareWord) => void) | null = null;
export const onShareFallback = (h: typeof shareSaid): void => { shareSaid = h; };

/** The system share sheet (A-43); `text` = a line before the address (A-80: «Поділитися застосунком»). Never throws (T2): a cancel = nothing;
 *  a real failure = the link copied + «Посилання скопійовано»; the copy refused too = «Не вдалося поділитися». */
export async function shareUrl(title: string, url: string, text?: string): Promise<void> {
  try {
    if (isNative() || typeof navigator.share === 'function') await Share.share({ title, text, url, dialogTitle: title });
    else shareSaid?.((await copyText(url)) ? 'copied' : 'failed');
  } catch (e) {
    if (isUserCancel(e)) return;
    console.warn('InokShare: failed', e instanceof Error ? e.message : String(e));
    shareSaid?.((await copyText(url)) ? 'copied' : 'failed');
  }
}

/** cloud_40: copy a text (the diagnostics) - the async clipboard first, the old `execCommand('copy')` of a selected field second (an
 *  engine that refuses the first in its own scheme); false = neither took it (the caller shows the text on the screen anyway). */
export async function copyText(text: string): Promise<boolean> {
  try { await navigator.clipboard.writeText(text); return true; } catch { /* refused / absent */ }
  try {
    const f = document.createElement('textarea');
    f.value = text; f.setAttribute('readonly', ''); f.style.position = 'fixed'; f.style.opacity = '0';
    document.body.appendChild(f); f.select();
    const ok = document.execCommand('copy');
    f.remove();
    return ok;
  } catch { return false; }
}
