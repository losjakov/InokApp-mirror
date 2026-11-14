import { registerPlugin } from '@capacitor/core';
import { isNative } from './platform';

/** A-66: the Google Cloud project `info-inok-app` linked in Play Console (08.11.2026) - the ONE place its number is written. */
export const CLOUD_PROJECT_NUMBER = '939184267521';
const WAIT_MS = 15_000;

/** Local plugin (android/app/src/main/java/info/inok/app/IntegrityPlugin.java): a Play Integrity STANDARD token per write. */
const PlayIntegrity = registerPlugin<{ token(o: { requestHash: string; cloudProjectNumber: string }): Promise<{ token: string }> }>('PlayIntegrity');

/** The token bound to `requestHash`, or null where there is none (the web; a phone without Play; Google busy; slower than 15 s). */
export async function playIntegrityToken(requestHash: string): Promise<string | null> {
  if (!isNative()) return null;
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const late = new Promise<null>((r) => { timer = setTimeout(() => r(null), WAIT_MS); });
    const r = await Promise.race([PlayIntegrity.token({ requestHash, cloudProjectNumber: CLOUD_PROJECT_NUMBER }), late]);
    return r?.token ?? null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}
