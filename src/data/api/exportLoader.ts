import { ungzip } from 'pako';
import type { Directory, Manifest } from './types';

/** gz bytes → verified (sha256) → parsed Directory. Pure: no network, no DB — unit-tested with fixtures/. */
export async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', bytes as BufferSource);
  return Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, '0')).join('');
}

export class ChecksumError extends Error {}

export async function decodeExport(gz: Uint8Array, expectedSha256?: string): Promise<Directory> {
  if (expectedSha256) {
    const got = await sha256Hex(gz);
    if (got !== expectedSha256.toLowerCase()) throw new ChecksumError(`sha256 ${got} != ${expectedSha256}`);
  }
  const text = ungzip(gz, { to: 'string' });
  return JSON.parse(text) as Directory;
}

export const manifestFile = (m: Manifest) => m.files.find((f) => f.name === 'directory_v1.json.gz') ?? m.files[0];
