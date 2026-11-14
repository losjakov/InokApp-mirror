import type { Db } from './types';
import { isNative } from '@/native/platform';

let dbPromise: Promise<Db> | null = null;

/** One connection per app (StrictMode runs the boot effect twice; the native plugin refuses a second createConnection). */
export function openDb(): Promise<Db> {
  dbPromise ??= (isNative() ? import('./nativeDb').then((m) => m.openNativeDb()) : import('./wasmDb').then((m) => m.openWasmDb())).catch((e) => {
    dbPromise = null;
    throw e;
  });
  return dbPromise;
}
