/**
 * The ONE folding table for search (REF_app_architecture §4). Applied to indexed text and to the query, so
 * «Києво-Печерська», «киево печерская», «Kyiv» match what users actually type in any of the three languages.
 * Folds only what users confuse: і/ї/и/ы → и, є/ё/е → е, ґ → г, apostrophes removed, dashes → space.
 */
const FOLD: Record<string, string> = {
  і: 'и', ї: 'и', ы: 'и',
  є: 'е', ё: 'е',
  ґ: 'г',
  ъ: 'ь',
};
const APOSTROPHES = /['ʼ’‘`´"«»“”]/g;
const DASHES = /[-‐‑–—/]+/g;
const NON_WORD = /[^\p{L}\p{N} ]+/gu;

/** One character as the search sees it: '' (an apostrophe), ' ' (a dash or a non-letter) or the folded lower-case letter. */
export function foldChar(ch: string): string {
  if (APOSTROPHES.test(ch)) { APOSTROPHES.lastIndex = 0; return ''; }
  APOSTROPHES.lastIndex = 0;
  const l = ch.toLowerCase();
  if (l.length !== 1) return l;
  if (/[-‐‑–—/]/.test(l) || !/[\p{L}\p{N}]/u.test(l)) return ' ';
  return FOLD[l] ?? l;
}

export function normalize(s: string | null | undefined): string {
  if (!s) return '';
  let out = s.normalize('NFKC').toLowerCase().replace(APOSTROPHES, '').replace(DASHES, ' ');
  out = out.replace(/[Ѐ-ӿ]/g, (ch) => FOLD[ch] ?? ch);
  return out.replace(NON_WORD, ' ').replace(/\s+/g, ' ').trim();
}

/** Query → normalised tokens (empty tokens dropped). */
export function tokens(q: string): string[] {
  return normalize(q).split(' ').filter(Boolean);
}

/** The trigram set of a normalised string (what the FTS5 trigram tokenizer indexes). */
export function trigrams(s: string): Set<string> {
  const out = new Set<string>();
  for (let i = 0; i + 3 <= s.length; i++) out.add(s.slice(i, i + 3));
  return out;
}

/** Share of the needle's trigrams present in the haystack: 1 = exact substring, ~0.5 = one typo in a short word. */
export function trigramScore(needle: string, haystack: string): number {
  const tg = trigrams(needle);
  if (tg.size === 0) return haystack.includes(needle) ? 1 : 0;
  let hit = 0;
  for (const t of tg) if (haystack.includes(t)) hit++;
  return hit / tg.size;
}

/** Strips html-lite tags to plain text (for indexing only; rendering uses HtmlLite). */
export function stripHtml(html: string | null | undefined): string {
  return (html ?? '').replace(/<[^>]+>/g, ' ');
}
