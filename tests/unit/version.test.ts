import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { APP_VERSION } from '@/app/version';

// A-62 (ref/REF_app_release.md): ONE version - package.json X.Y.Z -> the app's APP_VERSION and Android versionName; versionCode is
// COMPUTED by build.gradle = X*10000 + Y*100 + Z, never written by hand; the build fails on anything but X.Y.Z or on Y / Z > 99.
// Not below the live config's min_app_version (R-2: 1.0.0, measured 04.11.2026).
const cmp = (a: string, b: string) => { const x = a.split('.').map(Number); const y = b.split('.').map(Number); for (let i = 0; i < 3; i++) if ((x[i] ?? 0) !== (y[i] ?? 0)) return (x[i] ?? 0) - (y[i] ?? 0); return 0; };
const gradle = readFileSync(new URL('../../android/app/build.gradle', import.meta.url), 'utf8');

/** The test's own ORACLE of the rule (the product's one copy is build.gradle's closure; run for real with Groovy in cloud_21, REPORT §2). */
const oracle = (v: string): number | Error => {
  const m = /^(\d+)\.(\d+)\.(\d+)$/.exec(v);
  if (!m) return new Error('not X.Y.Z');
  const [x, y, z] = m.slice(1).map(Number);
  return y > 99 || z > 99 ? new Error('Y / Z > 99') : x * 10000 + y * 100 + z;
};

describe('version (A-62)', () => {
  it('package.json is X.Y.Z; the app and versionName read it (no second copy)', () => {
    expect(APP_VERSION).toMatch(/^\d+\.\d+\.\d+$/);
    expect(gradle).toMatch(/def appVersion = new groovy\.json\.JsonSlurper\(\)\.parse\(file\("\.\.\/\.\.\/package\.json"\)\)\.version/);
    expect(gradle).toMatch(/versionName appVersion\n/);
    expect(gradle).not.toMatch(/versionName "/);
  });
  it('versionCode is computed from the version, never a literal', () => {
    expect(gradle).toMatch(/versionCode appVersionCode\(appVersion\)\n/);
    expect(gradle).not.toMatch(/versionCode \d/);
    // the closure: the X.Y.Z pattern, the 0..99 guard, the formula - each once
    expect(gradle.match(/=~ \/\^\(\\d\+\)\\\.\(\\d\+\)\\\.\(\\d\+\)\$\//g)).toHaveLength(1);
    expect(gradle.match(/if \(y > 99 \|\| z > 99\) throw new GradleException/g)).toHaveLength(1);
    expect(gradle.match(/return x \* 10000 \+ y \* 100 \+ z/g)).toHaveLength(1);
  });
  it('the rule: 1.0.0 -> 10000, 1.2.3 -> 10203, X.99.99 the top of X; Y / Z > 99 and non-X.Y.Z fail', () => {
    expect(oracle(APP_VERSION)).toBe(10014); // 1.0.14 (cloud_40, A-129 / A-130) - Play AND the App Store (10012 / 10013 never public; 10013 = TestFlight + Play internal)
    expect(oracle('1.0.1')).toBe(10001);
    expect(oracle('1.2.3')).toBe(10203);
    expect(oracle('1.99.99')).toBe(19999);
    expect(oracle('2.0.0')).toBe(20000);
    for (const bad of ['1.100.0', '1.0.100', '1.0', '1.0.0-beta', 'v1.0.0']) expect(oracle(bad), bad).toBeInstanceOf(Error);
    // only grows as the version grows: every next version (any part up) has a bigger code
    const seq = ['1.0.0', '1.0.1', '1.0.99', '1.1.0', '1.99.99', '2.0.0'].map((v) => oracle(v) as number);
    expect(seq).toEqual([...seq].sort((a, b) => a - b));
  });
  it('iOS gets THE same pair (cloud_36): scripts/app_version.py = package.json + the rule (MARKETING_VERSION / CURRENT_PROJECT_VERSION)', () => {
    expect(execFileSync('python3', ['-I', new URL('../../scripts/app_version.py', import.meta.url).pathname, new URL('../../package.json', import.meta.url).pathname], { encoding: 'utf8' }).trim())
      .toBe(`${APP_VERSION} ${oracle(APP_VERSION)}`);
  });
  it('not below the live min_app_version', () => {
    expect(cmp(APP_VERSION, '1.0.0')).toBeGreaterThanOrEqual(0);
  });
  it('the release check (build.yml on a tag) reads ELF alignment right - its own self-test', () => {
    expect(execFileSync('python3', ['-I', new URL('../../scripts/release_check.py', import.meta.url).pathname, '--self-test'], { encoding: 'utf8' })).toContain('ok');
  });
});
