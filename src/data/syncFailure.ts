import { ApiError } from './api/client';
import { ChecksumError } from './api/exportLoader';
import { ImportError } from './db/import';
import { ENGINE_FLOOR, chromeMajor } from '@/app/engineFloor';

/**
 * A-46 (3): why the first download failed - told apart on the first-run screen, with a short code a tester can photograph.
 * `engine` = the browser engine is below the floor (then nothing else is worth reading); `server` = the site answered with an
 * error (HTTP code); `import` = the file came but could not be checked or written; `network` = online, but no answer
 * (timeout, refused); `offline` = the device has no network.
 */
export type FailureKind = 'engine' | 'server' | 'import' | 'network' | 'offline';
export interface SyncFailure { kind: FailureKind; code: string }

const isAbort = (e: unknown) => typeof e === 'object' && e !== null && (e as { name?: string }).name === 'AbortError';
const isFetchFailure = (e: unknown) => e instanceof TypeError && /fetch|network|load failed/i.test(e.message);

export function classifySyncFailure(e: unknown, isOnline: boolean, ua: string, floor: number = ENGINE_FLOOR): SyncFailure {
  const major = chromeMajor(ua);
  if (major !== null && major < floor) return { kind: 'engine', code: `ENG-${major}` };
  if (e instanceof ApiError) return { kind: 'server', code: `HTTP-${e.status}${e.code && e.code !== `http_${e.status}` ? ` ${e.code}` : ''}` };
  if (e instanceof ChecksumError) return { kind: 'import', code: 'IMP-SHA' };
  if (e instanceof ImportError) return { kind: 'import', code: `IMP-${e.code.toUpperCase()}` };
  if (!isOnline) return { kind: 'offline', code: 'NET-OFF' };
  if (isAbort(e)) return { kind: 'network', code: 'NET-TIMEOUT' };
  if (isFetchFailure(e)) return { kind: 'network', code: 'NET-FAIL' };
  const name = e instanceof Error ? e.name : typeof e;
  return { kind: 'import', code: `ERR-${name}`.slice(0, 24) };
}
