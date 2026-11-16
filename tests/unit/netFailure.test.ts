import { describe, expect, it } from 'vitest';
import { netFailureOf, netMessageKey } from '@/data/netFailure';
import { ApiError, SERVER_BUSY } from '@/data/api/client';
import { castFailure, castMessage } from '@/data/repo/cast';
import uk from '@/i18n/uk.json';
import ru from '@/i18n/ru.json';
import en from '@/i18n/en.json';

// A-125 (cloud_38): ONE classification of a failed network action - «no internet» only when the device has none (pre-mortem P2)
describe('netFailure', () => {
  it('the device offline = offline; online with no answer = unreachable (never «no internet»); an HTTP answer = server', () => {
    expect(netFailureOf(new TypeError('Failed to fetch'), false)).toBe('offline');
    expect(netFailureOf(new TypeError('Failed to fetch'), true)).toBe('unreachable');
    expect(netFailureOf(new DOMException('timeout', 'AbortError'), true)).toBe('unreachable');
    expect(netFailureOf(new ApiError(500, 'http_500'), false)).toBe('server');
    expect(netFailureOf(new ApiError(200, SERVER_BUSY), true)).toBe('server');
  });
  it('the words exist in three languages, the cause named, «Повторити»', () => {
    for (const d of [uk, ru, en] as Record<string, string>[]) for (const k of ['net.offline', 'net.unreachable', 'net.server', 'net.retry', 'net.later']) expect(d[k], k).toBeTruthy();
    expect((uk as Record<string, string>)[netMessageKey('offline')]).toMatch(/^Немає з'єднання з інтернетом/);
  });
  it('the casts (stars, likes) speak the same words for no network / no answer', () => {
    expect(castMessage(castFailure(new TypeError('x'), false), 'rating')).toBe('net.offline');
    expect(castMessage(castFailure(new TypeError('x'), true), 'vote')).toBe('net.unreachable');
    expect((uk as Record<string, string>)['cast.offline'], 'the old duplicate line is gone (A-15)').toBeUndefined();
  });
  it('A1: on iOS a 403 integrity_required is said as «not yet on iPhone», never «try again» (the server side = R-53)', () => {
    const e = new ApiError(403, 'integrity_required');
    expect(castFailure(e, true)).toBe('refused'); // Android / the web: as before
    const g = globalThis as { localStorage?: unknown };
    g.localStorage = { getItem: (k: string) => (k === 'inok.platform' ? 'ios' : null) }; // the browser's play of an iPhone (src/native/platform.ts)
    try { expect(castMessage(castFailure(e, true), 'rating')).toBe('cast.ios'); } finally { delete g.localStorage; }
    expect((uk as Record<string, string>)['cast.ios']).toMatch(/iPhone/);
  });
});
