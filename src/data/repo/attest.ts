import type { Db } from '@/data/db/types';
import type { AppConfig } from '@/data/api/types';
import { getMeta, setMeta } from '@/data/db/schema';
import { ApiError } from '@/data/api/client';
import { dataSource } from '@/data/source';
import { appAttestNative, appAttestProbe, appAttestSupported, attestCode, type AppAttestNative } from '@/native/appAttest';
import { cacheGet } from './cache';
import { installId, lineDigest, sha256, toBase64, type CastParts } from './castLine';

/**
 * A-127, contract §3 (R-53): every cast of an iPhone / iPad carries an Apple App Attest ASSERTION over the SAME line Android's
 * requestHash is made of. Once per install the key is made, attested and registered (`app-attest/challenge` + `app-attest/key`);
 * the key id is kept in SQLite meta WITH the install id it was registered for, so it lives through restarts and is renewed when
 * Apple says the key is gone (a restore from a backup / another device: the Secure Enclave key never travels) or the server
 * does not hold it. The key's counter must grow, so the casts leave ONE at a time, in order (`castQueue`).
 */

/** Where the native calls come from: Apple's (the Swift plugin); unit tests put a fake here. */
export interface AttestDevice extends AppAttestNative {
  /** this device + this config can attest (iOS, `isSupported`, `config.features.app_attest`) */
  active(db: Db): Promise<boolean>;
}
const appleDevice: AttestDevice = { // explicit methods: a Capacitor plugin is a Proxy, never spread
  generateKey: () => appAttestNative.generateKey(),
  attestKey: (o) => appAttestNative.attestKey(o),
  generateAssertion: (o) => appAttestNative.generateAssertion(o),
  isSupported: () => appAttestNative.isSupported(),
  async active(db) {
    if (!(await appAttestSupported())) return false;
    return (await cacheGet<AppConfig>(db, 'config'))?.value?.features?.app_attest === true;
  },
};
let device: AttestDevice = appleDevice;
/** Test seam (the native part is a stand-in in unit tests). */
export const _setAttestDevice = (d: AttestDevice | null): void => { device = d ?? appleDevice; newKeyUsed = false; };
export const attestActive = (db: Db): Promise<boolean> => device.active(db).catch(() => false);

/** A native refusal of App Attest (Apple's reason in `code`) - told to the person as «something went wrong», never «no network». */
export class AttestError extends Error {
  constructor(public code: string) { super(`app attest: ${code}`); }
}
const native = async <T>(p: Promise<T>): Promise<T> => {
  try { return await p; } catch (e) { throw new AttestError(attestCode(e) || 'unknown'); }
};

/** What is kept: the key and whether the server took it for THIS install. */
interface KeyState { install: string; key: string; registered: boolean }
const META = 'app_attest_key';
const readKey = async (db: Db): Promise<KeyState | null> => {
  try { return JSON.parse((await getMeta(db, META)) || 'null') as KeyState | null; } catch { return null; }
};
const keepKey = (db: Db, s: KeyState): Promise<void> => setMeta(db, META, JSON.stringify(s));

/** contract: a 403 `integrity_failed` of the registration = a NEW key and step 1 again, at most once per app start */
let newKeyUsed = false;

/** Steps 1-3 of the contract. `fresh` = a new key (the server or Apple does not know the kept one); else the kept, not yet registered key. */
export async function registerKey(db: Db, install: string, fresh: boolean): Promise<string> {
  const kept = await readKey(db);
  let key = !fresh && kept?.install === install && kept.key ? kept.key : (await native(device.generateKey())).keyId;
  await keepKey(db, { install, key, registered: false });
  for (let attempt = 0; ; attempt++) {
    const { challenge } = await dataSource().attestChallenge({ platform: 'ios', install_id: install });
    let attestation: string;
    try {
      attestation = (await native(device.attestKey({ keyId: key, clientDataHash: toBase64(await sha256(challenge)) }))).attestation;
    } catch (e) {
      if (e instanceof AttestError && e.code === 'invalidKey' && attempt === 0) { // Apple: discard the key and make a new one
        key = (await native(device.generateKey())).keyId;
        await keepKey(db, { install, key, registered: false });
        continue;
      }
      throw e;
    }
    try {
      await dataSource().attestKey({ platform: 'ios', install_id: install, key_id: key, attestation, challenge });
    } catch (e) {
      if (e instanceof ApiError && e.status === 403 && e.code === 'integrity_failed' && !newKeyUsed) {
        newKeyUsed = true;
        key = (await native(device.generateKey())).keyId;
        await keepKey(db, { install, key, registered: false });
        continue;
      }
      throw e; // 503 integrity_unavailable: the same key is kept (unregistered) and used at the next cast
    }
    await keepKey(db, { install, key, registered: true });
    return key;
  }
}

/** The registered key of this install, registering it first when there is none (once per install). */
async function readyKey(db: Db, install: string): Promise<string> {
  const k = await readKey(db);
  return k?.registered && k.install === install ? k.key : registerKey(db, install, false);
}

/** The iOS-only fields of a cast's body (contract §3: `platform`, `key_id`, `assertion`). */
export interface AttestFields { platform: 'ios'; key_id: string; assertion: string }
export async function assertionFields(key: string, parts: CastParts): Promise<AttestFields> {
  const { assertion } = await native(device.generateAssertion({ keyId: key, clientDataHash: toBase64(await lineDigest(parts)) }));
  return { platform: 'ios', key_id: key, assertion };
}

/** retry later (backoff): the server's store failed, or Apple's own service is not answering */
const later = (e: unknown): boolean =>
  (e instanceof ApiError && e.status === 503 && e.code === 'integrity_unavailable') || (e instanceof AttestError && e.code === 'serverUnavailable');
/** a new key, steps 1-3, the cast ONCE more: the server does not hold the key / Apple lost it */
const renew = (e: unknown): boolean =>
  (e instanceof ApiError && e.status === 403 && e.code === 'integrity_required') || (e instanceof AttestError && e.code === 'invalidKey');
export const BACKOFF_MS = [1000, 3000];
let wait = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
export const _setWait = (w: ((ms: number) => Promise<void>) | null): void => { wait = w ?? ((ms) => new Promise<void>((r) => setTimeout(r, ms))); };

/** ONE cast of an attesting iPhone: a fresh assertion for EVERY attempt (an assertion is single-use: its counter). */
export async function attestedCast<B extends object, T>(db: Db, line: (install: string) => CastParts, body: B,
  send: (b: B & { install_id: string } & AttestFields) => Promise<T>): Promise<T> {
  const install = await installId(db);
  const parts = line(install);
  const attempt = async (key: string): Promise<T> => {
    for (let i = 0; ; i++) {
      try {
        return await send({ ...body, install_id: install, ...(await assertionFields(key, parts)) });
      } catch (e) {
        if (later(e) && i < BACKOFF_MS.length) { await wait(BACKOFF_MS[i]); continue; }
        throw e;
      }
    }
  };
  try {
    return await attempt(await readyKey(db, install));
  } catch (e) {
    if (!renew(e)) throw e; // integrity_failed: that cast is not retried (contract)
    try {
      return await attempt(await registerKey(db, install, true));
    } catch (e2) {
      // still «required» after a fresh registration = refused for this device (never the «not yet on iPhone» line of a non-attesting one)
      if (e2 instanceof ApiError && e2.status === 403 && e2.code === 'integrity_required') throw new ApiError(403, 'integrity_failed');
      throw e2;
    }
  }
}

/**
 * cloud_40 (A1 g): what the person SEES of App Attest on a real iPhone («Про застосунок», under the version): one state + a text to copy
 * and send. It carries the iOS version, Apple's answer (or the call's error), the config flag, whether a key is kept / registered and the
 * last refused cast - NEVER the key id, the install id, a challenge, an assertion or an attestation (unit appAttest pins it).
 */
export type AttestState = 'working' | 'ready' | 'unsupported' | 'failed' | 'off';
export async function attestDiagnostics(db: Db, appVersion: string): Promise<{ state: AttestState; details: string }> {
  const p = await appAttestProbe(); // a failed call is asked again here (never kept)
  const cfg = (await cacheGet<AppConfig>(db, 'config'))?.value;
  const flag = cfg ? String(cfg.features?.app_attest ?? 'absent') : 'no config kept';
  const k = await readKey(db);
  const key = !k?.key ? 'none' : k.registered ? 'kept, registered' : 'kept, not registered';
  const refusal = (globalThis as { __inokLastCast?: string | null }).__inokLastCast ?? 'none in this run';
  const state: AttestState = p.state === 'failed' ? 'failed' : p.state !== 'supported' ? 'unsupported'
    : cfg?.features?.app_attest !== true ? 'off' : k?.registered ? 'working' : 'ready';
  const apple = p.state === 'failed' ? `call failed: ${p.error}` : p.state === 'none' ? 'not an iOS app' : `isSupported = ${p.state === 'supported'}`;
  const details = [
    `Inok ${appVersion}, iOS ${('os' in p && p.os) || 'unknown'}`,
    `App Attest: ${apple}`,
    `config features.app_attest: ${flag}`,
    `key: ${key}`,
    `last refused cast: ${refusal}`,
    `state: ${state}`,
  ].join('\n');
  return { state, details };
}
