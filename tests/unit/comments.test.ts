import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiError, apiFetch } from '@/data/api/client';
import type { Votes } from '@/data/api/types';
import { dataSource } from '@/data/source';
import { answerCounts, hiddenComments, hideComment, reportComment, applyVote, desiredVote, loadComments, withCounts, parseComments, parseVotes, resetVotesClosed, voteBar, voteComment, votesClosed } from '@/data/repo/comments';
import { castFailure, castMessage, installId, requestHash } from '@/data/repo/cast';
import { getArticle, parseArticles, rateArticle, storeArticles } from '@/data/repo/articles';
import { siteUrl } from '@/native/intents';
import { freshDb } from './helpers';

const live = JSON.parse(readFileSync(new URL('../../fixtures/comments.json', import.meta.url), 'utf8'))['2869'];
const feed = JSON.parse(readFileSync(new URL('../../fixtures/articles.json', import.meta.url), 'utf8'));
const V = (likes: number, dislikes: number, mine: Votes['mine']): Votes => ({ likes, dislikes, mine });

afterEach(() => { vi.restoreAllMocks(); resetVotesClosed(); });

describe('A-33: the ONE «open on the site» address', () => {
  it('uk = as given; ru / en add ?lang= unless the address names one; the form anchor last', () => {
    expect(siteUrl('https://inok.info/app/privacy/', 'uk')).toBe('https://inok.info/app/privacy/');
    expect(siteUrl('https://inok.info/monasteries/242/', 'ru')).toBe('https://inok.info/monasteries/242/?lang=ru');
    // the feed's site_url already carries the language: never doubled
    expect(siteUrl('https://inok.info/articles/publications/2869/?lang=ru', 'ru', 'skm-comment-add')).toBe('https://inok.info/articles/publications/2869/?lang=ru#skm-comment-add');
    expect(siteUrl('https://inok.info/articles/publications/2869/', 'en', 'skm-comment-add')).toBe('https://inok.info/articles/publications/2869/?lang=en#skm-comment-add');
    expect(siteUrl('https://inok.info/articles/publications/2869/', 'uk', 'skm-comment-add')).toBe('https://inok.info/articles/publications/2869/#skm-comment-add');
  });
});

describe('A-34: comment votes (R-27)', () => {
  it('reads the install vote where the live API puts it (votes.mine) and where the contract words it (mine beside votes)', () => {
    expect(parseVotes({ votes: { likes: 2, dislikes: 1, mine: -1 } as Votes })).toEqual(V(2, 1, -1));
    expect(parseVotes({ votes: { likes: 2, dislikes: 0 } as Votes, mine: 1 })).toEqual(V(2, 0, 1));
    expect(parseVotes({})).toEqual(V(0, 0, 0));
    const c = parseComments(live);
    expect(c.items.length).toBe(live.items.length);
    expect(c.items.every((x) => x.votes && x.replies)).toBe(true);
  });
  it('the site rule: the pressed toggle again withdraws, the other changes the mind; counts follow', () => {
    expect(desiredVote(0, 1)).toBe('like');
    expect(desiredVote(1, 1)).toBe('none');
    expect(desiredVote(1, -1)).toBe('dislike');
    expect(desiredVote(-1, -1)).toBe('none');
    expect(applyVote(V(2, 0, 0), 'like')).toEqual(V(3, 0, 1));
    expect(applyVote(V(3, 0, 1), 'dislike')).toEqual(V(2, 1, -1));
    expect(applyVote(V(2, 1, -1), 'none')).toEqual(V(2, 0, 0));
  });
  it('the answer table: 200 = the server counts; 409 / 429 / 503 / offline = the shown state back, with why', async () => {
    const { db } = await freshDb();
    const before = V(1, 0, 0);
    const vote = vi.spyOn(dataSource(), 'vote');
    vote.mockResolvedValueOnce({ likes: 7, dislikes: 2, mine: 1 });
    expect(await voteComment(db, 2869, 109, 'like', before)).toEqual({ ok: true, votes: V(7, 2, 1) }); // the server overwrites the optimistic 2
    const table: [unknown, string][] = [
      [new ApiError(409, 'conflict'), 'error'],
      [new ApiError(429, 'rate_limited'), 'rate_limited'],
      [new ApiError(403, 'integrity_failed'), 'refused'],
      [new ApiError(503, 'integrity_unavailable'), 'error'],
      [new TypeError('Failed to fetch'), 'unreachable'], // A-125: the test's device is online - a fetch that failed is «no answer», never «no network»
      [new ApiError(503, 'vote_closed'), 'closed'],
    ];
    for (const [e, why] of table) {
      vote.mockRejectedValueOnce(e);
      expect(await voteComment(db, 2869, 109, 'like', before)).toEqual({ ok: false, votes: before, failure: why });
    }
    // 503 vote_closed is learnt once: no request until the Play release (this run)
    expect(votesClosed()).toBe(true);
    const calls = vote.mock.calls.length;
    expect((await voteComment(db, 2869, 109, 'like', before)).ok).toBe(false);
    expect(vote.mock.calls.length).toBe(calls);
    // the body: the desired state + the install id (no token while Play Integrity is not there, R-8)
    expect(vote.mock.calls[0]).toEqual([2869, 109, { value: 'like', install_id: await installId(db) }]);
  });
  it('pressed twice quickly = ONE request and one state; the screen sees the optimistic state at once', async () => {
    const { db } = await freshDb();
    let release!: (v: Votes) => void;
    const vote = vi.spyOn(dataSource(), 'vote').mockReturnValue(new Promise((r) => { release = r; }));
    const seen: Votes[] = [];
    const bar = voteBar(db, 2869, 109, V(1, 0, 0), (v) => seen.push(v));
    const first = bar.press(1);
    const second = bar.press(1); // would withdraw if it counted
    await new Promise((r) => setTimeout(r, 20));
    release({ likes: 2, dislikes: 0, mine: 1 });
    await Promise.all([first, second]);
    expect(vote).toHaveBeenCalledTimes(1);
    expect(seen).toEqual([V(2, 0, 1), V(2, 0, 1)]);
  });
  it('a refusal rolls the toggles back; vote_closed tells why and keeps the counts', async () => {
    const { db } = await freshDb();
    const out: [Votes, string | undefined][] = [];
    const bar = voteBar(db, 2869, 109, V(1, 0, 0), (v, f) => out.push([v, f]));
    await bar.press(-1); // the fixtures source answers as the live API does before Play: 503 vote_closed
    expect(out).toEqual([[V(1, 1, -1), undefined], [V(1, 0, 0), 'closed']]);
    await bar.press(1);
    expect(out.at(-1)).toEqual([V(1, 0, 0), 'closed']);
    expect(castMessage('closed', 'vote')).toBe('cast.closed_vote');
    // REVIEW cloud_41 Q1 (cloud_42): the closed vote's line names no store - the same words on Android and iOS
    for (const l of ['uk', 'ru', 'en']) expect(JSON.parse(readFileSync(`src/i18n/${l}.json`, 'utf8'))['cast.closed_vote']).not.toMatch(/Google|Play|App Store/);
  });
  it('comments are asked with the install id, kept, and read back offline', async () => {
    const { db } = await freshDb();
    const comments = vi.spyOn(dataSource(), 'comments').mockResolvedValueOnce(live);
    const c = (await loadComments(db, 2869)).comments;
    expect(comments.mock.calls[0]).toEqual([2869, await installId(db)]);
    expect(c!.total).toBe(live.total);
    comments.mockRejectedValueOnce(new TypeError('offline'));
    expect((await loadComments(db, 2869)).comments!.items.map((x) => x.id)).toEqual(c!.items.map((x) => x.id));
  });
  it('D52 (R-29): the feed said 0 and no rating; the live answer says 4 and 5 (6) - the open article AND the cached feed row follow; offline keeps them', async () => {
    const { db } = await freshDb();
    const stale = { ...feed.items.find((x: { id: number }) => x.id === 2869), comments_count: 0, rating: null };
    await storeArticles(db, 'uk', [stale]);
    await storeArticles(db, 'ru', [{ ...stale, title: 'ru' }]);
    vi.spyOn(dataSource(), 'comments').mockResolvedValueOnce(live).mockRejectedValueOnce(new TypeError('offline'));
    const r = await loadComments(db, 2869);
    expect(r.counts).toEqual({ rating: { value: 5, count: 6 }, comments_count: 4 });
    expect(withCounts(stale, r)).toMatchObject({ rating: { value: 5, count: 6 }, comments_count: 4, title: stale.title });
    for (const lang of ['uk', 'ru'] as const) expect(await getArticle(db, 2869, lang)).toMatchObject({ rating: { value: 5, count: 6 }, comments_count: 4 });
    expect((await getArticle(db, 2869, 'ru'))!.title).toBe('ru'); // only the numbers move
    const off = await loadComments(db, 2869);
    expect(off.counts).toBeNull(); // offline: the article keeps what it shows
    expect(withCounts(stale, off)).toBe(stale);
    expect(off.comments!.total).toBe(4);
  });
  it('R-29: «no rating yet» from the server (null) is a fresh value; an answer without the fields changes nothing', () => {
    expect(answerCounts({ items: [], total: 0, rating: null, comments_count: 0 })).toEqual({ rating: null, comments_count: 0 });
    expect(answerCounts({ items: [], total: 0 })).toBeNull();
  });
  it('a 503 that is the server switch is not retried (vote_closed answers at once, not after 7 s of backoff)', async () => {
    const f = vi.spyOn(globalThis, 'fetch').mockImplementation(async () => new Response('{"error":"vote_closed"}', { status: 503 }));
    await expect(apiFetch('articles/2869/comments/109/vote', { method: 'POST', body: {} })).rejects.toMatchObject({ status: 503, code: 'vote_closed' });
    expect(f).toHaveBeenCalledTimes(1);
  });
});

describe('the casts share ONE code (A-34): install id, request hash, refusals', () => {
  it('requestHash = hex SHA-256 of the contract line', async () => {
    const line = ['rating', 2869, 5, '3f1c2b4a-1111-4222-8333-444455556666'];
    expect(await requestHash(line)).toBe(createHash('sha256').update(line.join('|')).digest('hex'));
  });
  it('a refused rating speaks through the same table', async () => {
    const { db } = await freshDb();
    vi.spyOn(dataSource(), 'rate').mockRejectedValueOnce(new ApiError(429, 'rate_limited'));
    const e = await rateArticle(db, parseArticles(feed).items[0], 5, 'uk').catch((x) => x);
    expect(castMessage(castFailure(e), 'rating')).toBe('cast.rate_limited');
    expect(castMessage(castFailure(new ApiError(503, 'rating_closed')), 'rating')).toBe('cast.closed_rating');
  });
});

describe('A-49 (R-32): report ONE comment, hide on this phone', () => {
  it('the report goes with the install id to the comment\'s address; its refusals speak through the shared table', async () => {
    const { db } = await freshDb();
    const rep = vi.spyOn(dataSource(), 'report').mockResolvedValueOnce({ ok: true });
    expect(await reportComment(db, 2869, 109)).toEqual({ ok: true });
    expect(rep).toHaveBeenCalledWith(2869, 109, { install_id: await installId(db) });
    for (const [e, f] of [[new ApiError(503, 'report_closed'), 'closed'], [new ApiError(429, 'rate_limited'), 'rate_limited'],
      [new ApiError(503, 'unavailable'), 'error'], [new ApiError(404, 'not_found'), 'error'], [new TypeError('Failed to fetch'), 'unreachable']] as const) {
      rep.mockRejectedValueOnce(e);
      expect(await reportComment(db, 2869, 109)).toEqual({ ok: false, failure: f });
    }
    expect(castMessage('closed', 'report')).toBe('cast.closed_report');
  });
  it('hidden = kept in SQLite, undo removes it; the rules come with the comments (offline too)', async () => {
    const { db } = await freshDb();
    await hideComment(db, 108, true); await hideComment(db, 107, true); await hideComment(db, 107, false);
    expect([...await hiddenComments(db)]).toEqual([108]);
    const c = parseComments(live);
    expect(c.rules?.uk).toContain('Пишіть доброзичливо');
    expect(c.rules_url?.ru).toBe('https://inok.info/about/comment-rules/?lang=ru'); // T-1335: {uk,ru,en}
    expect(parseComments({ ...live, rules_url: null }).rules_url).toBeUndefined(); // none = no link
    expect(parseComments({ ...live, rules_url: { uk: 'javascript:x' } }).rules_url).toBeUndefined();
  });
});
