import type { Db } from '@/data/db/types';
import { getMeta, setMeta } from '@/data/db/schema';
import { ApiError } from '@/data/api/client';
import { playIntegrityToken } from '@/native/integrity';

/**
 * ONE code for everything the install casts on the site (A-34, A-49 + contract §3): the article's stars, the comments' likes /
 * dislikes and the reports (R-32) share the install id, the Play Integrity request hash and the reading of a refusal.
 */

/** The install's id (contract §3: uuid v4; one rating per install per item, one vote state per install per comment) — made once, kept in meta. */
export async function installId(db: Db): Promise<string> {
  let id = await getMeta(db, 'install_id');
  if (!id) { id = uuidV4(); await setMeta(db, 'install_id', id); }
  return id;
}

/** RFC 4122 v4 from `crypto.getRandomValues` (A-46: `crypto.randomUUID` is Chrome 92, the floor is lower). */
export function uuidV4(rnd: (a: Uint8Array) => Uint8Array = (a) => crypto.getRandomValues(a)): string {
  const b = rnd(new Uint8Array(16));
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  const h = Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

/** Contract §3: Play Integrity's `requestHash` = the lowercase hex SHA-256 of the cast's own line (`rating|<id>|<value>|<install>`, `vote|<id>|<cid>|<value>|<install>`, `report|<id>|<cid>|<install>`, `view|article|<id>|<install>`). */
export async function requestHash(parts: (string | number)[]): Promise<string> {
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(parts.join('|')));
  return [...new Uint8Array(bytes)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

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
export async function integrityToken(parts: (string | number)[]): Promise<string | null> {
  try {
    const t = await provider(await requestHash(parts));
    return t && TOKEN_FORM.test(t) ? t : null;
  } catch {
    return null;
  }
}

/** THE body of every write of the app (A-15): `install_id` + the token of the write's contract line (`line(install_id)`, contract §3). */
export async function castBody<T extends object>(db: Db, line: (install: string) => (string | number)[], body: T): Promise<T & { install_id: string; integrity_token?: string }> {
  const install_id = await installId(db);
  const token = await integrityToken(line(install_id));
  return { ...body, install_id, ...(token ? { integrity_token: token } : {}) };
}

/** What a refusal means to the person (every cast: stars, votes, reports): closed before the Play release, too many, refused, no network, anything else. */
export type CastFailure = 'closed' | 'rate_limited' | 'refused' | 'offline' | 'error';
const CLOSED = new Set(['vote_closed', 'rating_closed', 'report_closed']);
export function castFailure(e: unknown): CastFailure {
  if (!(e instanceof ApiError)) return 'offline'; // fetch itself failed: no answer from the server
  if (e.status === 503 && CLOSED.has(e.code)) return 'closed';
  if (e.status === 429) return 'rate_limited';
  if (e.status === 403) return 'refused';
  return 'error';
}

/** The i18n key of a failure's short line; `closed` names what is closed (the stars or the comment votes). */
export const castMessage = (f: CastFailure, what: 'rating' | 'vote' | 'report'): string => (f === 'closed' ? `cast.closed_${what}` : `cast.${f}`);
