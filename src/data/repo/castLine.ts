import type { Db } from '@/data/db/types';
import { getMeta, setMeta } from '@/data/db/schema';

/**
 * THE line of every cast (contract §3) and its SHA-256 - ONE source for both platforms (A-15, A-127): Android's Play Integrity
 * `requestHash` = the hex of these 32 bytes; iOS's App Attest `clientDataHash` = the SAME 32 bytes (base64 over the bridge).
 * Lines: `rating|<id>|<value>|<install>`, `vote|<id>|<cid>|<value>|<install>`, `report|<id>|<cid>|<install>`, `view|article|<id>|<install>`,
 * `view|monastery|<code>|<install>`.
 */
export type CastParts = (string | number)[];
export const castLine = (parts: CastParts): string => parts.join('|');

/** SHA-256 of a string's UTF-8 bytes (the cast line; App Attest's challenge string). */
export async function sha256(text: string): Promise<Uint8Array> {
  return new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text)));
}
export const lineDigest = (parts: CastParts): Promise<Uint8Array> => sha256(castLine(parts));
export const toHex = (b: Uint8Array): string => Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');
/** Standard base64 (the bridge's form of bytes; `btoa` is in every engine of the floor). */
export const toBase64 = (b: Uint8Array): string => btoa(Array.from(b, (x) => String.fromCharCode(x)).join(''));

/** Contract §3: Play Integrity's `requestHash` = the lowercase hex SHA-256 of the cast's own line. */
export const requestHash = async (parts: CastParts): Promise<string> => toHex(await lineDigest(parts));

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
  const h = toHex(b);
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}
