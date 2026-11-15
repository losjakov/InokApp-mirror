import { Browser } from '@capacitor/browser';
import { Share } from '@capacitor/share';
import { isIos, isNative } from './platform';
import type { Lang } from '@/i18n';
import { SITE_HOSTS } from '@/data/api/client';

/** tel: / mailto: / geo: — Capacitor's WebView hands these schemes to the system (intent). On the web: same via the browser. */
const go = (url: string) => {
  window.location.href = url;
};
/** A system intent by address (`market://` = the Play app, A-46); the same hand-over as tel: / mailto:. */
export const openSystemUrl = go;
export const callPhone = (phone: string) => go(`tel:${phone.replace(/[^+\d]/g, '')}`);
export const mailTo = (email: string) => go(`mailto:${email}`);

/** https links: the in-app browser tab (`@capacitor/browser` = Custom Tabs / SFSafariViewController, A-33), a new tab on the web. */
export async function openExternal(url: string): Promise<void> {
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

/** The system share sheet (A-43); `text` = a line before the address (A-80: «Поділитися застосунком»). */
export async function shareUrl(title: string, url: string, text?: string): Promise<void> {
  if (isNative() || typeof navigator.share === 'function') {
    await Share.share({ title, text, url, dialogTitle: title });
    return;
  }
  await navigator.clipboard?.writeText(url);
}
