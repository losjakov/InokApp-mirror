import type { Db } from '@/data/db/types';
import type { Article, Comment, Comments, L10n, VoteValue, Votes } from '@/data/api/types';
import { keepCounts, type Counts } from './articles';
import { dataSource } from '@/data/source';
import { cacheGet, cacheSet } from './cache';
import { castBody, castFailure, installId, type CastFailure } from './cast';

/**
 * Comments of a publication or a video (contract §3): read-only text (A-33: written in the site's own form), and under every comment
 * and reply the site's two vote toggles (A-34, R-27). The last answer is kept for offline reading.
 */

const NO_VOTES: Votes = { likes: 0, dislikes: 0, mine: 0 };
const asMine = (v: unknown): Votes['mine'] => (v === 1 || v === -1 ? v : 0);
/** One vote record from the answer: the counts, and the install's own vote wherever the server puts it (`votes.mine`, live 02.11;
 *  or `mine` beside `votes`, the contract's wording). Missing counts = none yet. */
export function parseVotes(c: { votes?: Partial<Votes> | null; mine?: unknown }): Votes {
  const v = c.votes ?? {};
  return { likes: Number(v.likes) || 0, dislikes: Number(v.dislikes) || 0, mine: asMine(v.mine ?? c.mine) };
}
const withVotes = <T extends Omit<Comment, 'replies'>>(c: T): T => ({ ...c, votes: parseVotes(c as never) });
export const parseComments = (j: Comments): Comments => ({
  ...(j.rating !== undefined ? { rating: j.rating } : {}),
  ...(typeof j.comments_count === 'number' ? { comments_count: j.comments_count } : {}),
  ...(j.rules ? { rules: j.rules } : {}), // R-32: kept with the answer, so the rules show offline too
  ...(rulesUrls(j.rules_url) ? { rules_url: rulesUrls(j.rules_url) } : {}),
  total: j.total ?? j.items?.length ?? 0,
  items: (j.items ?? []).map((c) => ({ ...withVotes(c), replies: (c.replies ?? []).map(withVotes) })),
});

/** R-32 (T-1335): `rules_url` {uk,ru,en} - only https addresses survive; none = no link (the rules text still shows). */
function rulesUrls(v: unknown): L10n | null {
  if (!v || typeof v !== 'object') return null;
  const out: L10n = {};
  for (const [l, u] of Object.entries(v as Record<string, unknown>)) if (typeof u === 'string' && /^https:\/\//.test(u)) out[l as keyof L10n] = u;
  return Object.keys(out).length ? out : null;
}

const key = (id: number) => `comments:${id}`;
/** What one read gives the article screen: the comments (live, else the last answer; null = never read) and the item's own
 *  numbers from a LIVE answer only (R-29) - offline the article keeps what it had. */
export interface CommentsRead { comments: Comments | null; counts: Counts | null }
/** R-29 (D52): the numbers a live answer carries; `rating: null` = no rating yet (the server says so), absent = not sent. */
export const answerCounts = (c: Comments): Counts | null => {
  const n: Counts = {};
  if (c.rating !== undefined) n.rating = c.rating;
  if (typeof c.comments_count === 'number') n.comments_count = c.comments_count;
  return Object.keys(n).length ? n : null;
};
/** The article with the fresh numbers of a read (the screen's one merge). */
export const withCounts = (a: Article, r: CommentsRead): Article => (r.counts ? { ...a, ...r.counts } : a);

/**
 * Asks the comments with this install's votes (`?install_id=`, never cached by the server); the same answer's `rating` and
 * `comments_count` (R-29) go into the cached item (feed rows) and back to the screen. Offline → the last answer, no numbers.
 */
export async function loadComments(db: Db, id: number): Promise<CommentsRead> {
  try {
    const c = parseComments(await dataSource().comments(id, await installId(db)));
    await cacheSet(db, key(id), c);
    const counts = answerCounts(c);
    if (counts) await keepCounts(db, id, counts);
    return { comments: c, counts };
  } catch {
    return { comments: (await cacheGet<Comments>(db, key(id)))?.value ?? null, counts: null };
  }
}

/** The site's rule (ruling 161): the pressed toggle again = withdraw, the other one = change of mind. */
export const desiredVote = (mine: Votes['mine'], pressed: 1 | -1): VoteValue => (mine === pressed ? 'none' : pressed === 1 ? 'like' : 'dislike');
/** The optimistic state: the counts as they will be once the server takes `value` (the site's applyWord). */
export function applyVote(v: Votes, value: VoteValue): Votes {
  const mine: Votes['mine'] = value === 'like' ? 1 : value === 'dislike' ? -1 : 0;
  const likes = v.likes - (v.mine === 1 ? 1 : 0) + (mine === 1 ? 1 : 0);
  const dislikes = v.dislikes - (v.mine === -1 ? 1 : 0) + (mine === -1 ? 1 : 0);
  return { likes, dislikes, mine };
}

/** 503 `vote_closed` until the Play release (the server's switch): learnt once, the toggles stay read-only this run. */
let closed = false;
export const votesClosed = () => closed;
export const resetVotesClosed = () => { closed = false; };

export type VoteResult = { ok: true; votes: Votes } | { ok: false; votes: Votes; failure: CastFailure };
/**
 * Casts one vote: `before` is what the screen showed; the answer's counts win on success (the server's truth), a refusal returns
 * `before` (roll-back) with what went wrong. The kept comments follow the server's counts so the offline copy shows the same.
 */
export async function voteComment(db: Db, articleId: number, cid: number, value: VoteValue, before: Votes): Promise<VoteResult> {
  if (closed) return { ok: false, votes: before, failure: 'closed' };
  try {
    const ans = parseVotes({ votes: await dataSource().vote(articleId, cid, await castBody(db, (i) => ['vote', articleId, cid, value, i], { value })) });
    await keepVotes(db, articleId, cid, ans);
    return { ok: true, votes: ans };
  } catch (e) {
    const failure = castFailure(e);
    if (failure === 'closed') closed = true;
    return { ok: false, votes: before, failure };
  }
}

async function keepVotes(db: Db, articleId: number, cid: number, v: Votes): Promise<void> {
  const kept = (await cacheGet<Comments>(db, key(articleId)))?.value;
  if (!kept) return;
  const put = <T extends Omit<Comment, 'replies'>>(c: T): T => (c.id === cid ? { ...c, votes: v } : c);
  await cacheSet(db, key(articleId), { ...kept, items: kept.items.map((c) => ({ ...put(c), replies: c.replies?.map(put) })) });
}

export { NO_VOTES };

/**
 * A-49 (R-32): ONE comment to the site's moderators - the shared cast code (install id, Play Integrity `report|<id>|<cid>|<install>`,
 * the reading of a refusal). The server answers the same for a new report and a repeat; nothing is hidden by it.
 */
export async function reportComment(db: Db, articleId: number, cid: number): Promise<{ ok: true } | { ok: false; failure: CastFailure }> {
  try {
    await dataSource().report(articleId, cid, await castBody(db, (i) => ['report', articleId, cid, i], {}));
    return { ok: true };
  } catch (e) {
    return { ok: false, failure: castFailure(e) };
  }
}

/** A-49: «Приховати» - on this phone only (SQLite, kept across launches and article reads); undo = `hideComment(…, false)`. */
export const hiddenComments = async (db: Db): Promise<Set<number>> =>
  new Set((await db.query<{ id: number }>('SELECT id FROM comment_hidden')).map((r) => r.id));
export const hideComment = (db: Db, cid: number, hide: boolean): Promise<void> =>
  hide ? db.run('INSERT OR REPLACE INTO comment_hidden(id, hidden_at) VALUES (?, ?)', [cid, Date.now()]) : db.run('DELETE FROM comment_hidden WHERE id = ?', [cid]);

/**
 * One comment's toggles (A-34): optimistic at once, the server's counts on success, the shown state back on a refusal; a press while
 * the last one is on its way is ignored (two quick presses = one state, as the site's `busy`). `onChange` gets every state and,
 * on a refusal, what went wrong.
 */
export function voteBar(db: Db, articleId: number, cid: number, initial: Votes, onChange: (v: Votes, failure?: CastFailure) => void) {
  let v = initial;
  let busy = false;
  return {
    async press(pressed: 1 | -1): Promise<void> {
      if (busy) return;
      if (closed) { onChange(v, 'closed'); return; }
      busy = true;
      const before = v;
      const value = desiredVote(v.mine, pressed);
      v = applyVote(v, value);
      onChange(v);
      const r = await voteComment(db, articleId, cid, value, before);
      v = r.votes;
      busy = false;
      onChange(v, r.ok ? undefined : r.failure);
    },
  };
}
