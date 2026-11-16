import { describe, expect, it } from 'vitest';
import { execFileSync, spawnSync } from 'node:child_process';
import { chmodSync, existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

/** cloud_39 (A-127, REVIEW cloud_38 NOTE 5): a smoke that lost the DEVICE runs ONCE more after an adb restart; a CODE failure never. */
function rig(script: string) {
  const d = mkdtempSync(join(tmpdir(), 'emu-'));
  const bin = join(d, 'bin'); execFileSync('mkdir', ['-p', bin]);
  writeFileSync(join(bin, 'adb'), '#!/bin/sh\necho "adb $*" >> "$ADB_LOG"\n[ "$2" = getprop ] && echo 1\nexit 0\n'); chmodSync(join(bin, 'adb'), 0o755);
  writeFileSync(join(d, 'smoke.sh'), script); chmodSync(join(d, 'smoke.sh'), 0o755);
  const ci = join(d, 'ci'); execFileSync('mkdir', ['-p', ci]);
  writeFileSync(join(ci, 'verdict.txt'), 'CODE: step «emulator smoke 35» failed\n');
  const r = spawnSync('bash', ['scripts/emu_once_more.sh', join(d, 'out'), 'bash', join(d, 'smoke.sh'), d], {
    encoding: 'utf8', env: { ...process.env, PATH: `${bin}:${process.env.PATH}`, ADB_LOG: join(d, 'adb.log'), INOK_CI_DIR: ci, EMU_WAIT_S: '5' } });
  const runs = existsSync(join(d, 'runs')) ? readFileSync(join(d, 'runs'), 'utf8').trim().split('\n').length : 0;
  const verdict = existsSync(join(ci, 'verdict.txt')) ? readFileSync(join(ci, 'verdict.txt'), 'utf8') : '';
  return { rc: r.status, runs, adb: existsSync(join(d, 'adb.log')) ? readFileSync(join(d, 'adb.log'), 'utf8') : '', verdict, out: join(d, 'out') };
}
// the smoke: counts its runs in <dir>/runs; the first run loses the device (adb's own words), the second passes
const LOST_THEN_OK = 'echo x >> "$1/runs"; n=$(wc -l < "$1/runs"); if [ "$n" -eq 1 ]; then echo "adb: device offline"; echo "FAIL nav FAIL:articles-top"; exit 1; fi; echo PASS';

describe('emulator smoke: once more when the device was lost (B2)', () => {
  it('«adb: device offline» then a failed read = INFRA: adb restarted, the smoke runs ONCE more, the attempt-1 mark cleared', () => {
    const r = rig(LOST_THEN_OK);
    expect(r.rc).toBe(0);
    expect(r.runs).toBe(2);
    expect(r.adb).toMatch(/adb kill-server[\s\S]*adb start-server[\s\S]*adb wait-for-device/);
    expect(r.verdict).toBe('');
    expect(readFileSync(join(r.out, 'attempt1.log'), 'utf8')).toMatch(/adb: device offline/);
  });
  it('a CODE failure (no adb words) is never repeated and keeps its mark', () => {
    const r = rig('echo x >> "$1/runs"; echo "FAIL nav FAIL:articles-top"; exit 1');
    expect(r.rc).toBe(1); expect(r.runs).toBe(1); expect(r.adb).toBe('');
    expect(r.verdict).toMatch(/^CODE/);
  });
  it('lost twice = INFRA (one re-run of the job, not counted - A-127), never a third attempt', () => {
    const r = rig('echo x >> "$1/runs"; echo "adb: device offline"; exit 1');
    expect(r.rc).toBe(1); expect(r.runs).toBe(2);
    expect(r.verdict).toMatch(/^INFRA: the emulator \(adb: adb: device offline\)/);
  });
  it('emulator.yml: every smoke goes through it; API 35+ gets 4096 MB', () => {
    const wf = readFileSync('.github/workflows/emulator.yml', 'utf8');
    expect(wf).toMatch(/script: bash scripts\/emu_once_more\.sh screens\/emu-\$\{\{ matrix\.api-level \}\}-\$\{\{ matrix\.target \}\}\$\{\{ matrix\.tag \}\} bash scripts\//);
    expect(wf).toMatch(/ram-size: \$\{\{ matrix\.api-level >= 35 && '4096M' \|\| '' \}\}/);
  });
});

describe('preflight (B3, cloud_39): what macOS runs is read as bash 3.2 before any push', () => {
  it('the gate runs the bash 3.2 check (self-test first) and shellcheck', () => {
    const pf = readFileSync('scripts/preflight.sh', 'utf8');
    expect(pf).toMatch(/python3 -I scripts\/bash32_check\.py --self-test; python3 -I scripts\/bash32_check\.py/);
    expect(pf).toMatch(/shellcheck -S warning scripts\/\*\.sh/);
  });
  it('the check refuses «$x» (E3 of cloud_37 / cloud_38) in a macOS script and passes the tree', () => {
    expect(spawnSync('python3', ['-I', 'scripts/bash32_check.py', '--self-test'], { encoding: 'utf8' }).stdout).toMatch(/self-test: PASS/);
    const r = spawnSync('python3', ['-I', 'scripts/bash32_check.py'], { encoding: 'utf8' });
    expect(r.stdout).toMatch(/^bash 3\.2: PASS \(\d+ scripts: [^)]*ios_sim_tour\.sh/m);
    expect(r.status).toBe(0);
  });
});
