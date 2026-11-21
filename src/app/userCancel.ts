/** T2 (cloud_43, remark 2): THE one test «the person closed the share sheet» (DRY: shareUrl + the crash guard). @capacitor/share 8.0.3 rejects
 *  «Share canceled» on BOTH platforms (iOS: completed == false; Android SharePlugin.java:78: Back on the chooser), «Can't share while sharing
 *  is in progress» on a double tap (iOS); the web's navigator.share rejects an AbortError. None of them is an error to show. */
export function isUserCancel(e: unknown): boolean {
  const o = (e ?? {}) as { name?: unknown; message?: unknown };
  const msg = typeof e === 'string' ? e : typeof o.message === 'string' ? o.message : '';
  return o.name === 'AbortError' || /cancel/i.test(msg) || msg.includes("Can't share while sharing is in progress");
}
