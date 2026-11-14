import { foldChar, tokens } from './normalize';

/**
 * Owner 01.11 (A-23 #4): the matches of the search in the row's visible fields are marked, as /monasteries/ marks them — without
 * regard to case, apostrophes and the letters users confuse (the ONE folding table of the search, normalize.ts). Returns the
 * [start, end) ranges in the ORIGINAL text, merged and ordered; tokens shorter than 2 letters mark nothing (noise).
 */
export function highlightRanges(text: string, q: string): [number, number][] {
  const toks = tokens(q).filter((t) => t.length >= 2);
  if (!text || toks.length === 0) return [];
  let folded = '';
  const at: number[] = []; // folded index → original index
  for (let i = 0; i < text.length; i++) {
    const f = foldChar(text[i]);
    for (const c of f) { folded += c; at.push(i); }
  }
  const out: [number, number][] = [];
  for (const t of toks)
    for (let i = folded.indexOf(t); i >= 0; i = folded.indexOf(t, i + 1)) out.push([at[i], at[i + t.length - 1] + 1]);
  out.sort((a, b) => a[0] - b[0] || b[1] - a[1]);
  const merged: [number, number][] = [];
  for (const r of out) {
    const last = merged[merged.length - 1];
    if (last && r[0] <= last[1]) last[1] = Math.max(last[1], r[1]);
    else merged.push([...r]);
  }
  return merged;
}

/**
 * D27: a row the search found must SHOW why. The tokens that mark nothing in the row's visible texts are looked up in the
 * fields the search also reads but the row does not print (the official name, the other languages); the first field that
 * holds them gives one muted line «Збіг · <field>: …<mark>лавр</mark>…» — a snippet of ≤ `width` letters around the match.
 * null when every token is already marked on the row (or nothing explains it: a typo-tolerant match).
 */
export function hiddenMatch(visible: string[], hidden: { label: string; text: string | null | undefined }[], q: string, width = 60):
  { label: string; text: string } | null {
  const toks = tokens(q).filter((t) => t.length >= 2);
  const missing = toks.filter((t) => !visible.some((v) => highlightRanges(v, t).length > 0));
  if (missing.length === 0) return null;
  for (const h of hidden) {
    if (!h.text) continue;
    const r = highlightRanges(h.text, missing.join(' '));
    if (r.length === 0) continue;
    const [a, b] = r[0];
    const pad = Math.max(0, Math.floor((width - (b - a)) / 2));
    const from = a - pad <= 0 ? 0 : h.text.lastIndexOf(' ', a - pad) + 1 || a - pad;
    const to = Math.min(h.text.length, b + pad);
    return { label: h.label, text: `${from > 0 ? '…' : ''}${h.text.slice(from, to).trim()}${to < h.text.length ? '…' : ''}` };
  }
  return null;
}
