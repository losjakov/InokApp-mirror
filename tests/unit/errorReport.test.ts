import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// A-181 (cloud_46, contract R-65): the automatic anonymous report + the «Надіслати розробнику» text
const store = new Map<string, string>();
const calls: { url: string; body: Record<string, unknown> }[] = [];
let answer: 'ok' | '404' | 'offline' = 'ok';
beforeEach(() => {
  store.clear(); calls.length = 0; answer = 'ok';
  vi.stubGlobal('localStorage', { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v), removeItem: (k: string) => void store.delete(k) });
  vi.stubGlobal('document', { documentElement: { lang: 'ru' } });
  vi.stubGlobal('fetch', vi.fn(async (url: string, init: { body?: string }) => {
    calls.push({ url, body: JSON.parse(init.body ?? '{}') });
    if (answer === 'offline') throw new TypeError('Failed to fetch');
    return new Response(null, { status: answer === 'ok' ? 204 : 404 });
  }));
  store.set('inok.errreport', 'on');
});
afterEach(() => { vi.unstubAllGlobals(); vi.resetModules(); vi.useRealTimers(); });
vi.mock('@capacitor/device', () => ({ Device: { getInfo: async () => ({ osVersion: '17.5', model: 'iPhone12,5', name: 'Anna’s iPhone' }) } }));
const settle = () => new Promise((r) => setTimeout(r, 20));
const err = (code = 'E-Error-5691', at = '2026-11-24T01:41:00.000Z') => ({ code, line: 'Program failed to link', where: 'inokMap-x.js:815:2', at });

describe('sendAuto (A-181 (1))', () => {
  it('ONE POST with exactly the contract keys - no id, no device name, no user text', async () => {
    const { sendAuto } = await import('@/app/errorReport');
    sendAuto(err());
    await settle();
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe('https://inok.info/api/app/v1/error-report');
    expect(Object.keys(calls[0].body).sort()).toEqual(['app_version', 'at', 'build', 'code', 'kind', 'lang', 'line', 'model', 'os_version', 'platform', 'where']);
    expect(calls[0].body).toMatchObject({ kind: 'auto', code: 'E-Error-5691', os_version: '17.5', model: 'iPhone12,5', lang: 'ru', at: '2026-11-24T01:41:00.000Z' });
    expect(JSON.stringify(calls[0].body)).not.toMatch(/Anna|install/);
  });
  it('the same code the same day = no second send; another day = sent again', async () => {
    const { sendAuto } = await import('@/app/errorReport');
    sendAuto(err()); sendAuto(err()); sendAuto(err('E-Error-5691', '2026-11-24T23:00:00.000Z'));
    await settle();
    expect(calls).toHaveLength(1);
    sendAuto(err('E-Error-5691', '2026-11-25T08:00:00.000Z'));
    await settle();
    expect(calls).toHaveLength(2);
  });
  it('a 404 (the site half not live yet) = dropped: one call, nothing queued, no retry', async () => {
    answer = '404';
    const { sendAuto, flushReports } = await import('@/app/errorReport');
    sendAuto(err());
    await settle();
    expect(calls).toHaveLength(1);
    expect(store.get('inok.errqueue') ?? '[]').toBe('[]');
    await flushReports();
    expect(calls).toHaveLength(1);
  });
  it('offline = queued (at most 5), sent at the next start; still offline = kept', async () => {
    answer = 'offline';
    const { sendAuto, flushReports, QUEUE_MAX } = await import('@/app/errorReport');
    for (let i = 0; i < 7; i++) sendAuto(err(`E-Error-000${i}`));
    await settle();
    expect(JSON.parse(store.get('inok.errqueue')!)).toHaveLength(QUEUE_MAX);
    await flushReports(); // the next start, still no network
    expect(JSON.parse(store.get('inok.errqueue')!)).toHaveLength(QUEUE_MAX);
    answer = 'ok'; calls.length = 0;
    await flushReports();
    expect(calls.map((c) => c.body.code)).toEqual(['E-Error-0002', 'E-Error-0003', 'E-Error-0004', 'E-Error-0005', 'E-Error-0006']);
    expect(store.get('inok.errqueue')).toBe('[]');
  });
  it('the browser build sends nothing without the seam', async () => {
    store.delete('inok.errreport');
    const { sendAuto } = await import('@/app/errorReport');
    sendAuto(err());
    await settle();
    expect(calls).toHaveLength(0);
  });
});

describe('«Надіслати розробнику» (A-181 (2))', () => {
  it('plain lines (code, line · where, version (build), OS, model), ≤ 1000 chars; the site form URL encodes it + lang', async () => {
    const { reportText, reportUrl } = await import('@/app/errorReport');
    const { APP_VERSION, versionCode } = await import('@/app/version');
    const text = await reportText(err(), 'Код: E-Error-5691');
    expect(text.split('\n')).toEqual(['Код: E-Error-5691', 'Program failed to link · inokMap-x.js:815:2', `inok.info ${APP_VERSION} (${versionCode()})`, 'Android 17.5', 'iPhone12,5']);
    expect(reportUrl(text, 'en')).toBe(`https://inok.info/app/?lang=en#report=${encodeURIComponent(text)}`);
    expect(decodeURIComponent(reportUrl('a & b?#', 'uk').split('#report=')[1])).toBe('a & b?#');
    const long = await reportText({ ...err(), line: 'x'.repeat(2000) }, 'Код: E');
    expect(long.length).toBe(1000);
  });
});
