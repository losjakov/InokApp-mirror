import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { freshDb, serveFixtures } from './helpers';
import { dataSource } from '@/data/source';
import { _setIntegrityProvider, installId, integrityToken } from '@/data/repo/cast';
import { playIntegrityToken, CLOUD_PROJECT_NUMBER } from '@/native/integrity';
import { rateArticle, parseArticles } from '@/data/repo/articles';
import { reportComment, voteComment, NO_VOTES } from '@/data/repo/comments';
import { sendView } from '@/data/repo/views';

const sha = (s: string) => createHash('sha256').update(s).digest('hex');
const TOKEN = 'fake.Token_from-Play=0123456789';
const feed = JSON.parse(readFileSync('fixtures/articles.json', 'utf8'));

/** A-66: a fake provider records every request hash it was asked to bind */
const fake = () => { const seen: string[] = []; _setIntegrityProvider(async (h) => { seen.push(h); return TOKEN; }); return seen; };

describe('A-66 Play Integrity on EVERY write (contract §3 requestHash)', () => {
  beforeEach(() => { serveFixtures(); });
  afterEach(() => { _setIntegrityProvider(playIntegrityToken); vi.restoreAllMocks(); vi.unstubAllGlobals(); });
  it('the Cloud project number of info-inok-app is written once', () => {
    expect(CLOUD_PROJECT_NUMBER).toBe('939184267521');
    expect(readFileSync('android/app/src/main/java/info/inok/app/IntegrityPlugin.java', 'utf8')).not.toMatch(/939184267521/);
  });
  it('rating, vote, report and view: each body carries the token bound to ITS contract line', async () => {
    const { db } = await freshDb();
    const id = await installId(db);
    const seen = fake();
    const rate = vi.spyOn(dataSource(), 'rate');
    const vote = vi.spyOn(dataSource(), 'vote').mockResolvedValue({ likes: 1, dislikes: 0, mine: 1 });
    const report = vi.spyOn(dataSource(), 'report');
    const view = vi.spyOn(dataSource(), 'view');
    await rateArticle(db, parseArticles(feed).items[0], 4, 'uk');
    await voteComment(db, 2869, 109, 'like', NO_VOTES);
    await reportComment(db, 2869, 109);
    await sendView(db, { kind: 'article', id: 2869 }, 'dwell.tok');
    await sendView(db, { kind: 'monastery', code: 242 }, 'dwell.tok');
    expect(seen).toEqual([
      sha(`rating|2869|4|${id}`), sha(`vote|2869|109|like|${id}`), sha(`report|2869|109|${id}`),
      sha(`view|article|2869|${id}`), sha(`view|monastery|242|${id}`),
    ]);
    const body = { install_id: id, integrity_token: TOKEN };
    expect(rate.mock.calls[0][1]).toEqual({ value: 4, ...body });
    expect(vote.mock.calls[0][2]).toEqual({ value: 'like', ...body });
    expect(report.mock.calls[0][2]).toEqual(body);
    expect(view.mock.calls[0]).toEqual(['articles/2869/views', { token: 'dwell.tok', ...body }]);
    expect(view.mock.calls[1][0]).toBe('monasteries/242/views');
  });
  it('no token (no Play, an emulator, the web, a failure) = the write goes WITHOUT the field', async () => {
    const { db } = await freshDb();
    _setIntegrityProvider(async () => null);
    const report = vi.spyOn(dataSource(), 'report');
    await reportComment(db, 2869, 109);
    expect(report.mock.calls[0][2]).not.toHaveProperty('integrity_token');
    _setIntegrityProvider(async () => { throw new Error('play services missing'); });
    expect(await integrityToken(['report', 1, 2, 'x'])).toBeNull();
  });
  it('a token outside the contract\'s form is never sent (it would be a 400)', async () => {
    _setIntegrityProvider(async () => 'short');
    expect(await integrityToken(['x'])).toBeNull();
    _setIntegrityProvider(async () => 'has spaces and is long enough');
    expect(await integrityToken(['x'])).toBeNull();
    _setIntegrityProvider(async () => TOKEN);
    expect(await integrityToken(['x'])).toBe(TOKEN);
  });
  it('the browser asks no native call', async () => {
    expect(await playIntegrityToken('ab')).toBeNull();
  });
});
