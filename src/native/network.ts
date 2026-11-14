import { Network } from '@capacitor/network';
import { registerPlugin } from '@capacitor/core';
import type { NetState } from '@/data/photos/policy';
import { isNative } from './platform';

/** Local plugin (android/app/src/main/java/info/inok/app/NetPolicyPlugin.java): metered network + system Data Saver (A-20). */
const NetPolicy = registerPlugin<{ getStatus(): Promise<NetState> }>('NetPolicy');

/** Browser screens only: `localStorage['inok.net']` = a NetState JSON forces the network the placeholders show (screens.spec.ts). */
const webOverride = (): NetState | null => {
  try { const v = localStorage.getItem('inok.net'); return v ? (JSON.parse(v) as NetState) : null; } catch { return null; }
};

/** The ONE reading of the network for the whole app: connected / metered / Data Saver. */
export async function netState(): Promise<NetState> {
  if (!isNative()) {
    const o = webOverride();
    if (o) return o;
    const saveData = (navigator as Navigator & { connection?: { saveData?: boolean } }).connection?.saveData === true;
    return { connected: navigator.onLine !== false, metered: false, dataSaver: saveData };
  }
  try {
    return await NetPolicy.getStatus();
  } catch {
    // an older native shell without the plugin: the type is the best guess (Wi-Fi = unmetered)
    const s = await Network.getStatus().catch(() => null);
    return { connected: s?.connected !== false, metered: s?.connectionType !== 'wifi', dataSaver: false };
  }
}

export const online = async (): Promise<boolean> => (await netState()).connected;

/** Called when the network changes (Wi-Fi came back → waiting photos may load). Returns the unsubscribe. */
export function onNetChange(cb: () => void): () => void {
  if (!isNative()) {
    addEventListener('online', cb); addEventListener('offline', cb);
    return () => { removeEventListener('online', cb); removeEventListener('offline', cb); };
  }
  const h = Network.addListener('networkStatusChange', cb);
  return () => { void h.then((x) => x.remove()); };
}
