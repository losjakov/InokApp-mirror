import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

/** cloud_36 (REVIEW cloud_35 E2 / cloud_34 NOTE 1): the emulator smoke's own helpers, run by bash exactly as the script defines them */
const SCRIPT = readFileSync(new URL('../../scripts/emulator_smoke.sh', import.meta.url), 'utf8');
const fn = (name: string) => {
  // a one-line function (`f() { …; }`) or a block that ends at the first line that is only `}`
  const m = SCRIPT.match(new RegExp(`^${name}\\(\\) \\{.*\\}$`, 'm')) ?? SCRIPT.match(new RegExp(`^${name}\\(\\) \\{$[\\s\\S]*?^\\}$`, 'm'));
  if (!m) throw new Error(`${name} not defined`);
  return m[0];
};
const bash = (code: string) => execFileSync('bash', ['-c', code], { encoding: 'utf8' }).trim();

describe('emulator smoke helpers', () => {
  it('v110 reads the VALUE of `ev` («eval: wifi»), not the whole line', () => {
    const v = (w: string) => bash(`${fn('v110_verdict')}\nv110_verdict '${w}'`);
    expect(v('eval: wifi')).toBe('proved');
    expect(v('eval: saver')).toBe('proved');
    expect(v('eval: manual')).toBe('proved');
    expect(v('wifi')).toBe('proved');
    expect(v('eval: none')).toBe('not-proved(reason=none: the full file was allowed on this network)');
  });
  it('the database is copied by the retrying copy, never by a bare `adb exec-out cat > file`', () => {
    expect(fn('appcopy')).toMatch(/for i in 1 2 3/);
    expect(fn('appcopy')).toMatch(/adb reconnect offline/);
    expect(SCRIPT).not.toMatch(/exec-out cat [^\n]*>\s*"\$OUT\/inok\.db"/);
    expect(SCRIPT.match(/appcopy \$DB "\$OUT\/inok\.db"/g)?.length).toBe(3);
  });
});
