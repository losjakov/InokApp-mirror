import { Capacitor } from '@capacitor/core';

export const isNative = (): boolean => Capacitor.isNativePlatform();
/** Browser screens only: `localStorage['inok.platform'] = 'ios'` plays an iPhone (the iOS branches of the store seam), as `inok.net` plays a network */
const webPlay = (): string | null => {
  if (isNative()) return null;
  try { return localStorage.getItem('inok.platform'); } catch { return null; }
};
/** THE platform of the running app: 'android' | 'ios' | 'web' (A-1: one code; a platform branch is decided here and nowhere else) */
export const platform = (): string => webPlay() ?? Capacitor.getPlatform();
export const isIos = (): boolean => platform() === 'ios';
/** the app's own Android plugins (FcmTopics, InokAnalytics, PlayIntegrity, NetPolicy) exist only in the Android shell */
export const isAndroid = (): boolean => isNative() && Capacitor.getPlatform() === 'android';
