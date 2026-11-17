import { registerPlugin } from '@capacitor/core';
import { isIos, isNative } from './platform';

/**
 * A-127 / contract §3 (R-53): the app's own Swift plugin over Apple's DCAppAttestService (ios/App/App/AppAttestPlugin.swift). Every hash
 * it gets is made in JS by the ONE line builder (`src/data/repo/castLine.ts`): the plugin only decodes base64 and calls Apple. A refusal
 * carries Apple's reason as `code`: `invalidKey` (the key is gone: a restore, a migration), `serverUnavailable` (retry later, same key),
 * `unsupported` (a simulator, an old device), `invalidInput`, `unknown`.
 */
export interface AppAttestNative {
  /** cloud_40: `os` = the device's iOS version (UIDevice.systemVersion; Safari's user agent freezes it) - for the diagnostics line only */
  isSupported(): Promise<{ supported: boolean; os?: string }>;
  generateKey(): Promise<{ keyId: string }>;
  attestKey(o: { keyId: string; clientDataHash: string }): Promise<{ attestation: string }>;
  generateAssertion(o: { keyId: string; clientDataHash: string }): Promise<{ assertion: string }>;
}
const Plugin = registerPlugin<AppAttestNative>('AppAttest');

/**
 * cloud_40 (A1): THREE outcomes of asking Apple, never two. `supported` / `unsupported` = Apple's own answer (kept for the run);
 * `failed` = the CALL itself was rejected (1.0.13 on every iPhone: the plugin was not in the bridge -> «not implemented») - that is not
 * Apple's «no», so it is NOT kept: the next cast asks again. `none` = not an iPhone / iPad app (the web, Android).
 */
export type AttestProbe = { state: 'supported' | 'unsupported'; os?: string } | { state: 'failed'; error: string } | { state: 'none' };
type Ask = () => Promise<{ supported: boolean; os?: string }>;
let ask: Ask | null = null;
/** Test seam: a stand-in for the native `isSupported` (null = the real plugin, iOS only). */
export const _setProbeAsk = (a: Ask | null): void => { ask = a; probe = null; last = null; };
let probe: Promise<AttestProbe> | null = null;
let last: AttestProbe | null = null;
const callError = (e: unknown): string => {
  const o = (e && typeof e === 'object' ? e : {}) as { code?: unknown; message?: unknown };
  return `${typeof o.code === 'string' ? `${o.code} ` : ''}${typeof o.message === 'string' ? o.message : String(e)}`.slice(0, 160);
};
/** Browser screens only (as `inok.platform` / `inok.net`): `localStorage['inok.attest']` = supported | unsupported | failed plays Apple's answer. */
const webAsk = (): Ask | null => {
  if (!isIos()) return null;
  let v: string | null = null;
  try { v = localStorage.getItem('inok.attest'); } catch { /* no storage */ }
  if (v === 'failed') return () => Promise.reject(Object.assign(new Error('"AppAttest" plugin is not implemented on ios'), { code: 'UNIMPLEMENTED' }));
  return v === 'supported' || v === 'unsupported' ? () => Promise.resolve({ supported: v === 'supported', os: '27.0.1' }) : null;
};
export const appAttestProbe = (): Promise<AttestProbe> => {
  const a = ask ?? (isNative() ? (isIos() ? () => Plugin.isSupported() : null) : webAsk());
  if (!a) return Promise.resolve({ state: 'none' });
  probe ??= a().then(
    (r): AttestProbe => ({ state: r.supported === true ? 'supported' : 'unsupported', ...(r.os ? { os: r.os } : {}) }),
    (e): AttestProbe => ({ state: 'failed', error: callError(e) }),
  ).then((p) => { last = p; if (p.state === 'failed') probe = null; return p; });
  return probe;
};
/** The last outcome seen in this run (null = never asked) - the diagnostics line. */
export const lastAttestProbe = (): AttestProbe | null => last;
/** iOS only (the web and Android have no such plugin): true only on Apple's own «supported». */
export const appAttestSupported = (): Promise<boolean> => appAttestProbe().then((p) => p.state === 'supported');
export const appAttestNative: AppAttestNative = Plugin;

/** Apple's reason of a refused native call ('' = not Apple's). */
export const attestCode = (e: unknown): string => (e && typeof e === 'object' && typeof (e as { code?: unknown }).code === 'string' ? (e as { code: string }).code : '');
