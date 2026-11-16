import type { Db } from '@/data/db/types';
import { ApiError } from '@/data/api/client';
import { playIntegrityToken } from '@/native/integrity';
import { netMessageKey } from '@/data/netFailure';
import { online } from '@/native/network';
import { isIos } from '@/native/platform';
import { installId, requestHash, type CastParts } from './castLine';
import { AttestError, attestActive, attestedCast, type AttestFields } from './attest';

export { installId, uuidV4, requestHash } from './castLine';

/**
 * ONE code for everything the install casts on the site (A-34, A-49 + contract §3): the article's stars, the comments' likes /
 * dislikes and the reports (R-32) share the install id, the Play Integrity request hash and the reading of a refusal.
 */

/** Where a token comes from: the phone's Play Integrity (src/native/integrity.ts); unit tests put a fake here. */
export type IntegrityProvider = (requestHash: string) => Promise<string | null>;
let provider: IntegrityProvider = playIntegrityToken;
/** Test seam (A-66: «tests with a fake provider»). */
export const _setIntegrityProvider = (p: IntegrityProvider): void => { provider = p; };
/** Contract §3: `integrity_token` is 20-16000 characters of `A-Z a-z 0-9 _ . = -` - anything else would be a 400, so it is not sent. */
const TOKEN_FORM = /^[A-Za-z0-9_.=-]{20,16000}$/;

/**
 * A-66: the Play Integrity STANDARD token of ONE write, bound to its contract line by `requestHash`. No token (the web, a phone without
 * Play, an emulator, Google busy) = null: the write goes without it - the server's switch decides (off until the owner's word).
 */
export async function integrityToken(parts: CastParts): Promise<string | null> {
  try {
    const t = await provider(await requestHash(parts));
    return t && TOKEN_FORM.test(t) ? t : null;
  } catch {
    return null;
  }
}

/** THE body of every write of the app (A-15): `install_id` + the token of the write's contract line (`line(install_id)`, contract §3). */
export async function castBody<T extends object>(db: Db, line: (install: string) => CastParts, body: T): Promise<T & { install_id: string; integrity_token?: string }> {
  const install_id = await installId(db);
  const token = await integrityToken(line(install_id));
  return { ...body, install_id, ...(token ? { integrity_token: token } : {}) };
}

/** The fields a cast body may carry beside its own (contract §3): Android's token, or iOS's App Attest fields (R-53). */
export type CastFields = { install_id: string; integrity_token?: string } & Partial<AttestFields>;

/** A-127: casts leave ONE at a time, in order (an App Attest key's counter must grow; the same order on Android - one path). */
let queue: Promise<unknown> = Promise.resolve();
function enqueue<T>(job: () => Promise<T>): Promise<T> {
  const run = queue.then(job, job);
  queue = run.catch(() => undefined);
  return run;
}

/**
 * THE way every cast of the app leaves (A-15): stars, comment votes, reports, a view. An attesting iPhone (A-127, R-53) sends an App
 * Attest assertion over the cast's line; any other device the Play Integrity token of the same line (none on the web / a simulator =
 * the server's answer decides, `cast.ios` on an iPhone that cannot attest).
 */
export function sendCast<B extends object, T>(db: Db, line: (install: string) => CastParts, body: B, send: (b: B & CastFields) => Promise<T>): Promise<T> {
  return enqueue(async () => ((await attestActive(db)) ? attestedCast(db, line, body, send) : send(await castBody(db, line, body))));
}

/** What a refusal means to the person (every cast: stars, votes, reports): closed before the Play release, too many, refused, no network
 *  (the device has none), no answer (the device online, the site silent - A-125: never called «no network»), anything else. */
export type CastFailure = 'closed' | 'rate_limited' | 'refused' | 'offline' | 'unreachable' | 'ios' | 'error';
const CLOSED = new Set(['vote_closed', 'rating_closed', 'report_closed']);
export function castFailure(e: unknown, deviceOnline = false): CastFailure {
  // cloud_38 (A1): the server's own answer of the last refused cast, readable by the simulator ring (scripts/ios_sim_tour.sh) - never shown
  (globalThis as { __inokLastCast?: string }).__inokLastCast = e instanceof ApiError ? `${e.status} ${e.code}` : `no answer: ${String(e).slice(0, 80)}`;
  if (e instanceof AttestError) return 'error'; // Apple's own refusal on the device - not the network
  if (!(e instanceof ApiError)) return deviceOnline ? 'unreachable' : 'offline'; // no answer: the device's own network decides which (A-125)
  if (e.status === 503 && CLOSED.has(e.code)) return 'closed';
  if (e.status === 429) return 'rate_limited';
  // cloud_38 (A1, A-124): the site asks a Play Integrity token (Google's, Android only) once its switch is on - an iPhone can never pass it.
  // Said as it is («not yet on iPhone»), never «try again»; the server side is REQUEST R-53 (InokSite window C), not worked around here
  if (e.status === 403 && e.code === 'integrity_required' && isIos()) return 'ios';
  if (e.status === 403) return 'refused';
  return 'error';
}

/** The i18n key of a failure's short line; `closed` names what is closed (the stars or the comment votes). */
export const castMessage = (f: CastFailure, what: 'rating' | 'vote' | 'report'): string =>
  f === 'closed' ? `cast.closed_${what}` : f === 'offline' || f === 'unreachable' ? netMessageKey(f) : `cast.${f}`; // A-125: the shared net words

/** The same, the device's network read now (the casts' callers are async). */
export const castFailureNow = async (e: unknown): Promise<CastFailure> => castFailure(e, e instanceof ApiError || e instanceof AttestError ? true : await online());
