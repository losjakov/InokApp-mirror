import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { freshDb, serveFixtures } from './helpers';
import { dataSource } from '@/data/source';
import { ApiError, apiFetch } from '@/data/api/client';
import { getMeta } from '@/data/db/schema';
import type { Db } from '@/data/db/types';
import { _setIntegrityProvider, castFailure, installId, sendCast } from '@/data/repo/cast';
import { castLine, lineDigest, requestHash } from '@/data/repo/castLine';
import { _setAttestDevice, _setWait, AttestError, type AttestDevice } from '@/data/repo/attest';
import { playIntegrityToken } from '@/native/integrity';
import { rateArticle, parseArticles } from '@/data/repo/articles';
import { reportComment, voteComment, NO_VOTES } from '@/data/repo/comments';
import { sendView } from '@/data/repo/views';

const sha = (s: string) => createHash('sha256').update(s).digest();
const b64hex = (b: string) => Buffer.from(b, 'base64').toString('hex');
const feed = JSON.parse(readFileSync('fixtures/articles.json', 'utf8'));

/** A stand-in for Apple's DCAppAttestService: keys k1, k2…; every assertion numbered (its counter); every call logged in order. */
function fakeDevice(opts: { active?: boolean } = {}) {
  const log: string[] = [];
  let keys = 0; let counter = 0;
  const lost = new Set<string>();
  const d: AttestDevice & { log: string[]; lose(k: string): void; hashes: string[] } = {
    log, hashes: [],
    lose: (k) => { lost.add(k); },
    active: async () => opts.active ?? true,
    isSupported: async () => ({ supported: opts.active ?? true }),
    generateKey: async () => { keys++; log.push(`generateKey k${keys}`); return { keyId: `k${keys}` }; },
    attestKey: async ({ keyId, clientDataHash }) => {
      if (lost.has(keyId)) throw Object.assign(new Error('gone'), { code: 'invalidKey' });
      log.push(`attestKey ${keyId} ${b64hex(clientDataHash)}`); return { attestation: `att-${keyId}` };
    },
    generateAssertion: async ({ keyId, clientDataHash }) => {
      if (lost.has(keyId)) throw Object.assign(new Error('gone'), { code: 'invalidKey' });
      counter++; d.hashes.push(b64hex(clientDataHash)); log.push(`assert ${keyId} #${counter}`); return { assertion: `as-${keyId}-${counter}` };
    },
  };
  return d;
}

const CH = 'challenge-0123456789abcdefghijklmnopqrstuvwxyzABCD';
function server(db: Db) {
  const src = dataSource();
  const challenge = vi.spyOn(src, 'attestChallenge').mockResolvedValue({ challenge: CH, expires_in: 300 });
  const key = vi.spyOn(src, 'attestKey').mockResolvedValue({ ok: true });
  return { src, challenge, key, db };
}

describe('A-127 / R-53: iOS casts by Apple App Attest (the native part a stand-in)', () => {
  beforeEach(() => { serveFixtures(); _setWait(async () => undefined); });
  afterEach(() => { _setAttestDevice(null); _setWait(null); _setIntegrityProvider(playIntegrityToken); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

  it('ONE line for both platforms: Android requestHash = hex, iOS clientDataHash = the SAME 32 bytes (the four casts, byte for byte)', async () => {
    const { db } = await freshDb();
    const id = await installId(db);
    const dev = fakeDevice(); _setAttestDevice(dev); server(db);
    const androidSeen: string[] = [];
    vi.spyOn(dataSource(), 'vote').mockResolvedValue({ likes: 1, dislikes: 0, mine: 1 });
    await rateArticle(db, parseArticles(feed).items[0], 4, 'uk');
    await voteComment(db, 2869, 109, 'like', NO_VOTES);
    await reportComment(db, 2869, 109);
    await sendView(db, { kind: 'article', id: 2869 }, 'dwell.tok');
    await sendView(db, { kind: 'monastery', code: 242 }, 'dwell.tok');
    const lines = [`rating|2869|4|${id}`, `vote|2869|109|like|${id}`, `report|2869|109|${id}`, `view|article|2869|${id}`, `view|monastery|242|${id}`];
    expect(dev.hashes).toEqual(lines.map((l) => sha(l).toString('hex')));
    for (const l of lines) androidSeen.push(await requestHash(l.split('|')));
    expect(androidSeen).toEqual(dev.hashes); // the same digest Android sends as hex
    expect(castLine(['rating', 2869, 4, id])).toBe(lines[0]);
    expect(Buffer.from(await lineDigest(['rating', 2869, 4, id])).equals(sha(lines[0]))).toBe(true);
  });

  it('registration ONCE per install: challenge -> generateKey -> attestKey(SHA256(challenge)) -> app-attest/key; the casts carry platform, key_id, assertion', async () => {
    const { db } = await freshDb();
    const id = await installId(db);
    const dev = fakeDevice(); _setAttestDevice(dev);
    const s = server(db);
    const report = vi.spyOn(dataSource(), 'report');
    await reportComment(db, 2869, 109);
    await reportComment(db, 2869, 110);
    expect(s.challenge).toHaveBeenCalledTimes(1);
    expect(s.challenge.mock.calls[0][0]).toEqual({ platform: 'ios', install_id: id });
    expect(dev.log.slice(0, 2)).toEqual(['generateKey k1', `attestKey k1 ${sha(CH).toString('hex')}`]);
    expect(s.key.mock.calls[0][0]).toEqual({ platform: 'ios', install_id: id, key_id: 'k1', attestation: 'att-k1', challenge: CH });
    expect(report.mock.calls[0][2]).toEqual({ install_id: id, platform: 'ios', key_id: 'k1', assertion: 'as-k1-1' });
    expect(report.mock.calls[1][2]).toEqual({ install_id: id, platform: 'ios', key_id: 'k1', assertion: 'as-k1-2' });
    expect(report.mock.calls[0][2]).not.toHaveProperty('integrity_token');
  });

  it('the key id lives through a restart (SQLite meta with its install id): no second registration', async () => {
    const { db } = await freshDb();
    const id = await installId(db);
    _setAttestDevice(fakeDevice()); const s = server(db);
    await reportComment(db, 1, 2);
    expect(JSON.parse((await getMeta(db, 'app_attest_key'))!)).toEqual({ install: id, key: 'k1', registered: true });
    const dev2 = fakeDevice(); _setAttestDevice(dev2); // a new run: the plugin's memory is empty, the DB is not
    const report = vi.spyOn(dataSource(), 'report');
    await reportComment(db, 1, 3);
    expect(s.challenge).toHaveBeenCalledTimes(1);
    expect(dev2.log).toEqual(['assert k1 #1']);
    expect(report.mock.calls[0][2]).toMatchObject({ key_id: 'k1' });
  });

  it('a restored copy: the kept key is gone on this device (invalidKey) -> a NEW key, steps 1-3, the cast ONCE more', async () => {
    const { db } = await freshDb();
    const dev = fakeDevice(); _setAttestDevice(dev); const s = server(db);
    await reportComment(db, 1, 2);
    dev.lose('k1');
    const report = vi.spyOn(dataSource(), 'report');
    expect(await reportComment(db, 1, 3)).toEqual({ ok: true });
    expect(s.challenge).toHaveBeenCalledTimes(2);
    expect(s.key.mock.calls[1][0]).toMatchObject({ key_id: 'k2' });
    expect(report).toHaveBeenCalledTimes(1);
    expect(report.mock.calls[0][2]).toMatchObject({ key_id: 'k2' });
  });

  it('a new install id (reinstall) never uses the key of another install', async () => {
    const { db } = await freshDb();
    _setAttestDevice(fakeDevice()); const s = server(db);
    await reportComment(db, 1, 2);
    await db.run("UPDATE meta SET value = ? WHERE key = 'install_id'", ['11111111-1111-4111-8111-111111111111']);
    await reportComment(db, 1, 3);
    expect(s.challenge).toHaveBeenCalledTimes(2);
  });

  it('403 integrity_required on a cast (the server does not hold the key) -> register a new key, the cast once more; again = refused, no loop', async () => {
    const { db } = await freshDb();
    _setAttestDevice(fakeDevice()); const s = server(db);
    const report = vi.spyOn(dataSource(), 'report').mockRejectedValueOnce(new ApiError(403, 'integrity_required'));
    expect(await reportComment(db, 1, 2)).toEqual({ ok: true });
    expect(report).toHaveBeenCalledTimes(2);
    expect(s.key).toHaveBeenCalledTimes(2);
    expect(report.mock.calls[1][2]).toMatchObject({ key_id: 'k2' });
    report.mockReset().mockRejectedValue(new ApiError(403, 'integrity_required'));
    expect(await reportComment(db, 1, 3)).toEqual({ ok: false, failure: 'refused' });
    expect(report).toHaveBeenCalledTimes(2);
  });

  it('403 integrity_failed on a cast: that cast is NOT retried', async () => {
    const { db } = await freshDb();
    _setAttestDevice(fakeDevice()); server(db);
    const report = vi.spyOn(dataSource(), 'report').mockRejectedValue(new ApiError(403, 'integrity_failed'));
    expect(await reportComment(db, 1, 2)).toEqual({ ok: false, failure: 'refused' });
    expect(report).toHaveBeenCalledTimes(1);
  });

  it('503 integrity_unavailable: retried with backoff, each attempt a NEW assertion (the counter grows); in the end an error', async () => {
    const { db } = await freshDb();
    const dev = fakeDevice(); _setAttestDevice(dev); server(db);
    const waits: number[] = []; _setWait(async (ms) => { waits.push(ms); });
    const report = vi.spyOn(dataSource(), 'report').mockRejectedValueOnce(new ApiError(503, 'integrity_unavailable')).mockResolvedValueOnce({ ok: true });
    expect(await reportComment(db, 1, 2)).toEqual({ ok: true });
    expect(report.mock.calls.map((c) => c[2].assertion)).toEqual(['as-k1-1', 'as-k1-2']);
    expect(waits).toEqual([1000]);
    report.mockReset().mockRejectedValue(new ApiError(503, 'integrity_unavailable'));
    expect(await reportComment(db, 1, 3)).toEqual({ ok: false, failure: 'error' });
    expect(report).toHaveBeenCalledTimes(3);
  });

  it('429 is not retried and reads «too many»', async () => {
    const { db } = await freshDb();
    _setAttestDevice(fakeDevice()); server(db);
    const report = vi.spyOn(dataSource(), 'report').mockRejectedValue(new ApiError(429, 'rate_limited'));
    expect(await reportComment(db, 1, 2)).toEqual({ ok: false, failure: 'rate_limited' });
    expect(report).toHaveBeenCalledTimes(1);
  });

  it('registration refused (403 integrity_failed) -> a new key at most ONCE per app start', async () => {
    const { db } = await freshDb();
    const dev = fakeDevice(); _setAttestDevice(dev); const s = server(db);
    s.key.mockRejectedValueOnce(new ApiError(403, 'integrity_failed'));
    expect(await reportComment(db, 1, 2)).toEqual({ ok: true });
    expect(dev.log.filter((l) => l.startsWith('generateKey'))).toEqual(['generateKey k1', 'generateKey k2']);
    expect(s.challenge).toHaveBeenCalledTimes(2);
    await db.run("DELETE FROM meta WHERE key = 'app_attest_key'");
    s.key.mockRejectedValue(new ApiError(403, 'integrity_failed'));
    expect(await reportComment(db, 1, 3)).toEqual({ ok: false, failure: 'refused' });
    expect(s.challenge).toHaveBeenCalledTimes(3); // this start already made its one new key
  });

  it('registration 503: the same key is kept and used at the next cast (no new key)', async () => {
    const { db } = await freshDb();
    const dev = fakeDevice(); _setAttestDevice(dev); const s = server(db);
    s.key.mockRejectedValueOnce(new ApiError(503, 'integrity_unavailable'));
    expect(await reportComment(db, 1, 2)).toEqual({ ok: false, failure: 'error' });
    expect(await reportComment(db, 1, 3)).toEqual({ ok: true });
    expect(dev.log.filter((l) => l.startsWith('generateKey'))).toEqual(['generateKey k1']);
    expect(s.key.mock.calls[1][0]).toMatchObject({ key_id: 'k1' });
  });

  it('casts leave ONE at a time, in order: the second assertion is made after the first answered', async () => {
    const { db } = await freshDb();
    const dev = fakeDevice(); _setAttestDevice(dev); server(db);
    let release!: () => void;
    const report = vi.spyOn(dataSource(), 'report').mockImplementationOnce(async () => { dev.log.push('send 1'); await new Promise<void>((r) => { release = r; }); dev.log.push('answer 1'); return { ok: true }; })
      .mockImplementationOnce(async () => { dev.log.push('send 2'); return { ok: true }; });
    const a = reportComment(db, 1, 2); const b = reportComment(db, 1, 3);
    await vi.waitFor(() => expect(dev.log).toContain('send 1'));
    expect(dev.log).not.toContain('assert k1 #2');
    release();
    await Promise.all([a, b]);
    expect(dev.log.slice(-5)).toEqual(['assert k1 #1', 'send 1', 'answer 1', 'assert k1 #2', 'send 2']);
    expect(report).toHaveBeenCalledTimes(2);
  });

  it('a refused cast does not stop the queue', async () => {
    const { db } = await freshDb();
    _setAttestDevice(fakeDevice()); server(db);
    vi.spyOn(dataSource(), 'report').mockRejectedValueOnce(new ApiError(429, 'rate_limited')).mockResolvedValueOnce({ ok: true });
    const [a, b] = await Promise.all([reportComment(db, 1, 2), reportComment(db, 1, 3)]);
    expect(a).toEqual({ ok: false, failure: 'rate_limited' });
    expect(b).toEqual({ ok: true });
  });

  it('an iPhone that cannot attest (the simulator, config without app_attest): the old body, no App Attest call; the honest line', async () => {
    const { db } = await freshDb();
    const dev = fakeDevice({ active: false }); _setAttestDevice(dev); const s = server(db);
    _setIntegrityProvider(async () => null);
    const report = vi.spyOn(dataSource(), 'report');
    await reportComment(db, 1, 2);
    expect(report.mock.calls[0][2]).toEqual({ install_id: await installId(db) });
    expect(dev.log).toEqual([]); expect(s.challenge).not.toHaveBeenCalled();
    vi.stubGlobal('localStorage', { getItem: (k: string) => (k === 'inok.platform' ? 'ios' : null) }); // the browser's play of an iPhone
    expect(castFailure(new ApiError(403, 'integrity_required'), true)).toBe('ios');
  });

  it('Apple\'s own refusal on the device reads «error», never «no network»', () => {
    expect(castFailure(new AttestError('unknown'), false)).toBe('error');
  });

  it('the live client sends an assertion ONCE (single-use): a 503 is not re-sent by the client', async () => {
    let n = 0;
    vi.stubGlobal('fetch', async () => { n++; return new Response('{"error":"integrity_unavailable"}', { status: 503, headers: { 'content-type': 'application/json' } }); });
    await expect(apiFetch('x', { method: 'POST', body: {}, once: true })).rejects.toMatchObject({ status: 503, code: 'integrity_unavailable' });
    expect(n).toBe(1);
  });

  it('sendCast without App Attest = the Android body (the token of the same line)', async () => {
    const { db } = await freshDb();
    _setAttestDevice(fakeDevice({ active: false }));
    const seen: string[] = []; _setIntegrityProvider(async (h) => { seen.push(h); return 'fake.Token_from-Play=0123456789'; });
    const send = vi.fn(async (b: object) => b);
    const id = await installId(db);
    expect(await sendCast(db, (i) => ['report', 1, 2, i], {}, send)).toEqual({ install_id: id, integrity_token: 'fake.Token_from-Play=0123456789' });
    expect(seen).toEqual([sha(`report|1|2|${id}`).toString('hex')]);
  });

  it('the native side: the Swift plugin over DCAppAttestService, registered by the bridge, in the target; the entitlement = production', () => {
    const swift = readFileSync('ios/App/App/AppAttestPlugin.swift', 'utf8');
    expect(swift).toMatch(/import DeviceCheck/);
    expect(swift).toMatch(/jsName = "AppAttest"/);
    for (const m of ['isSupported', 'generateKey', 'attestKey', 'generateAssertion']) expect(swift).toMatch(new RegExp(`CAPPluginMethod\\(name: "${m}"`));
    expect(swift).toMatch(/case \.invalidKey: return "invalidKey"/);
    expect(swift).toMatch(/case \.serverUnavailable: return "serverUnavailable"/);
    expect(swift).not.toMatch(/CryptoKit|SHA256/); // the hash is made by the ONE JS line builder, never a second time in Swift
    expect(readFileSync('ios/App/App/InokBridgeViewController.swift', 'utf8')).toMatch(/registerPluginInstance\(AppAttestPlugin\(\)\)/);
    const pbx = readFileSync('ios/App/App.xcodeproj/project.pbxproj', 'utf8');
    expect(pbx).toMatch(/AppAttestPlugin\.swift in Sources \*\/,/);
    const defs = [...pbx.matchAll(/^\s*([0-9A-F]{24}) \/\*[^*]*\*\/ = \{/gm)].map((m) => m[1]); // every object id defined ONCE (cloud_39 paid for it)
    expect(defs.length).toBeGreaterThan(20);
    expect(new Set(defs).size).toBe(defs.length);
    const ent = readFileSync('ios/App/App/App.entitlements', 'utf8');
    expect(ent).toMatch(/<key>com\.apple\.developer\.devicecheck\.appattest-environment<\/key>\s*<string>production<\/string>/);
  });
});
