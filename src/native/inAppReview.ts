import { registerPlugin } from '@capacitor/core';
import { isNative } from './platform';

/** cloud_41 (A-133 C2): the app's own thin plugin (Android InAppReviewPlugin.java, iOS InAppReviewPlugin.swift) - the STORE's window only. */
interface InAppReviewPlugin { request(): Promise<{ state: 'asked' | 'unavailable' }> }
const InAppReview = registerPlugin<InAppReviewPlugin>('InAppReview');

/** the browser ring records the call (`window.__reviewAsked`); a phone asks the store */
export async function requestStoreReview(): Promise<void> {
  if (isNative()) { await InAppReview.request(); return; }
  const w = window as unknown as { __reviewAsked?: number };
  w.__reviewAsked = (w.__reviewAsked ?? 0) + 1;
}
