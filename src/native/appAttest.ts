import { registerPlugin } from '@capacitor/core';
import { isIos, isNative } from './platform';

/**
 * A-127 / contract §3 (R-53): the app's own Swift plugin over Apple's DCAppAttestService (ios/App/App/AppAttestPlugin.swift). Every hash
 * it gets is made in JS by the ONE line builder (`src/data/repo/castLine.ts`): the plugin only decodes base64 and calls Apple. A refusal
 * carries Apple's reason as `code`: `invalidKey` (the key is gone: a restore, a migration), `serverUnavailable` (retry later, same key),
 * `unsupported` (a simulator, an old device), `invalidInput`, `unknown`.
 */
export interface AppAttestNative {
  isSupported(): Promise<{ supported: boolean }>;
  generateKey(): Promise<{ keyId: string }>;
  attestKey(o: { keyId: string; clientDataHash: string }): Promise<{ attestation: string }>;
  generateAssertion(o: { keyId: string; clientDataHash: string }): Promise<{ assertion: string }>;
}
const Plugin = registerPlugin<AppAttestNative>('AppAttest');

/** iOS only (the web and Android have no such plugin): a device without App Attest (the simulator) answers false. Asked once per run. */
let supported: Promise<boolean> | null = null;
export const appAttestSupported = (): Promise<boolean> => {
  if (!isNative() || !isIos()) return Promise.resolve(false);
  supported ??= Plugin.isSupported().then((r) => r.supported === true, () => false);
  return supported;
};
export const appAttestNative: AppAttestNative = Plugin;

/** Apple's reason of a refused native call ('' = not Apple's). */
export const attestCode = (e: unknown): string => (e && typeof e === 'object' && typeof (e as { code?: unknown }).code === 'string' ? (e as { code: string }).code : '');
