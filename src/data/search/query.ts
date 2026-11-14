import type { Db } from '@/data/db/types';
import type { FtsMode } from '@/data/db/schema';
import { tokens, trigrams, trigramScore } from './normalize';

export interface SearchHit { code: number; score: number }

const FUZZY_MIN = 0.5; // keep candidates whose every token has ≥ half of its trigrams present (≈ one typo)
const ftsQuote = (s: string) => `"${s.replace(/"/g, '""')}"`;

async function ftsCodes(db: Db, match: string, limit: number): Promise<number[]> {
  const rows = await db.query<{ code: number }>(
    'SELECT code FROM monastery_fts WHERE monastery_fts MATCH ? ORDER BY bm25(monastery_fts) LIMIT ?',
    [match, limit],
  );
  return rows.map((r) => r.code);
}

async function likeCodes(db: Db, toks: string[], limit: number): Promise<number[]> {
  const where = toks.map(() => 'norm_all LIKE ?').join(' AND ');
  const rows = await db.query<{ code: number }>(`SELECT code FROM monastery WHERE ${where} LIMIT ?`, [
    ...toks.map((t) => `%${t}%`),
    limit,
  ]);
  return rows.map((r) => r.code);
}

/** JS re-ranking shared by every mode: name prefix first, then exact substrings, then trigram similarity. */
async function rank(db: Db, codes: number[], toks: string[], limit: number): Promise<SearchHit[]> {
  if (codes.length === 0) return [];
  const rows = await db.query<{ code: number; norm_name: string; norm_all: string }>(
    `SELECT code, norm_name, norm_all FROM monastery WHERE code IN (${codes.map(() => '?').join(',')})`,
    codes,
  );
  const hits: (SearchHit & { exact: boolean })[] = [];
  for (const r of rows) {
    let score = 0;
    let ok = true;
    for (const t of toks) {
      const s = t.length < 3 ? (r.norm_all.includes(t) ? 1 : 0) : trigramScore(t, r.norm_all);
      if (s < FUZZY_MIN) { ok = false; break; }
      score += s;
    }
    if (!ok) continue;
    score /= toks.length;
    const words = r.norm_name.split(' ');
    if (toks.every((t) => r.norm_name.includes(t))) score += 0.5;
    if (toks.some((t) => words.some((w) => w.startsWith(t)))) score += 0.25;
    if (r.norm_name.startsWith(toks[0])) score += 0.25;
    hits.push({ code: r.code, score, exact: toks.every((t) => r.norm_all.includes(t)) });
  }
  // as the site's list: when the words occur as typed, only those rows; the typo-tolerant matches only when nothing occurs as typed
  // (cloud_06: «лавр» also brought every «ставропігійний» through the trigram «авр»)
  const exact = hits.filter((h) => h.exact);
  const out = exact.length ? exact : hits;
  out.sort((a, b) => b.score - a.score || a.code - b.code);
  return out.slice(0, limit).map(({ code, score }) => ({ code, score }));
}

/**
 * Search by name / town / eparchy / oblast / head / address (spec §3, A-23 #4 — the fields the row shows). Exact substrings first; if few hits, a fuzzy pass over the
 * trigrams of each token (typo tolerance) — trigram FTS only. 1–2 character tokens always go through LIKE.
 */
export async function searchMonasteries(db: Db, fts: FtsMode, q: string, limit = 50): Promise<SearchHit[]> {
  const toks = tokens(q);
  if (toks.length === 0) return [];
  const long = toks.filter((t) => t.length >= 3);
  const candidateLimit = Math.max(limit * 4, 200);
  let codes: number[];
  if (fts === 'trigram' && long.length > 0) {
    codes = await ftsCodes(db, long.map(ftsQuote).join(' '), candidateLimit);
    if (codes.length < limit) {
      const ors = long.flatMap((t) => Array.from(trigrams(t)).map(ftsQuote));
      const fuzzy = await ftsCodes(db, ors.join(' OR '), candidateLimit);
      codes = Array.from(new Set([...codes, ...fuzzy]));
    }
  } else if (fts === 'fts5' && long.length > 0) {
    codes = await ftsCodes(db, long.map((t) => ftsQuote(t) + '*').join(' '), candidateLimit);
    if (codes.length === 0) codes = await likeCodes(db, toks, candidateLimit);
  } else {
    codes = await likeCodes(db, toks, candidateLimit);
  }
  return rank(db, codes, toks, limit);
}
