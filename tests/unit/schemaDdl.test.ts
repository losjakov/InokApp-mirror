import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

/** cloud_42 (emulator 44615766139, API 31 / 34 / 35: «Execute: not an error (code 0)» right after the first import): the native SQLite plugin
 *  cuts a multi-statement text at «;» + end of line; a `--` comment that ENDS with «;» made a chunk of only a comment. Every SQL template of
 *  schema.ts: no comment line carries «;», and every chunk cut that way holds a statement. */
describe('schema DDL is safe for the native plugin\'s statement cut', () => {
  const src = readFileSync('src/data/db/schema.ts', 'utf8');
  const sql = Array.from(src.matchAll(/`([^`]*\b(?:CREATE|INSERT|ALTER)\b[^`]*)`/g), (m) => m[1]);
  it('the SQL templates are found', () => expect(sql.length).toBeGreaterThan(2));
  it('no «;» inside a -- comment line', () => {
    const bad = sql.flatMap((t) => t.split('\n')).filter((l) => /^\s*--/.test(l) && l.includes(';'));
    expect(bad).toEqual([]);
  });
  it('every «;»-and-newline chunk holds a statement, not only comments', () => {
    const empty = sql.flatMap((t) => { const ch = t.split(/;\s*\n/); return ch.slice(0, -1).map((c) => c.split('\n').filter((l) => !/^\s*--/.test(l)).join('\n').trim()); })
      .filter((c) => c === '');
    expect(empty).toEqual([]);
  });
});
