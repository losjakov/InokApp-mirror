import { ApiError } from './api/client';
import { online } from '@/native/network';

/**
 * A-125 (owner 16.11.2026: «без сети пользователь знал почему что-то не работает»): THE classification of a failed network action - ONE place
 * for every screen (A-15). `offline` ONLY when the device itself says it has no network (a false «no internet» while the network lives is
 * worse than silence - pre-mortem P2); the device online but no answer (timeout, DNS, TLS, a dropped connection) = `unreachable`; any HTTP
 * answer the app could not use (an error status, the hoster's busy page) = `server`.
 */
export type NetFailure = 'offline' | 'unreachable' | 'server';

export function netFailureOf(e: unknown, deviceOnline: boolean): NetFailure {
  if (e instanceof ApiError) return 'server';
  return deviceOnline ? 'unreachable' : 'offline';
}

/** The same, the device's network read now (the ONE reading: src/native/network.ts). */
export async function netFailure(e: unknown): Promise<NetFailure> {
  return netFailureOf(e, e instanceof ApiError ? true : await online());
}

/** The i18n key of the message (x3 languages): the cause in words, never a code. */
export const netMessageKey = (f: NetFailure): string => `net.${f}`;
