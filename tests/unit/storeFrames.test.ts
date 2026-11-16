import { describe, expect, it } from 'vitest';
import { execFileSync, spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
// @ts-expect-error - a plain .mjs of scripts/ (no types; the screens import it the same way, outside tsconfig)
import { CHECKS } from '../../scripts/store_checks.mjs';

// cloud_38 (E11, D16, REVIEW cloud_37 NOTE 7): a store frame is REFUSED when it shows the crash screen, when it is blank (one colour over the
// body - the white WebView paint of iOS 26.5) or when its map canvas is painted only in part (the nine Play `05-map` frames of 1.0.11).
// The frames here are the 1.0.11 emulator's own files, reduced (tests/unit/fixtures/frames): the map one is the defective uk/phone frame.
const PY = new URL('../../scripts/store_png.py', import.meta.url).pathname;
const FR = (f: string) => new URL(`./fixtures/frames/${f}`, import.meta.url).pathname;
const hasPil = spawnSync('python3', ['-c', 'import PIL'], { encoding: 'utf8' }).status === 0;
const paint = (f: string) => execFileSync('python3', ['-I', PY, '--paint', f], { encoding: 'utf8' }).trim();

describe.skipIf(!hasPil)('store frame paint (scripts/store_png.py)', () => {
  it('refuses the 1.0.11 map frame drawn in part (D16)', () => {
    expect(paint(FR('d16-map-phone.png'))).toMatch(/^MAP NOT PAINTED \(3\d% of the map box white\)$/);
  });
  it('passes a whole map and real frames of the set (no false «blank» on a white list or a dark home)', () => {
    expect(paint(FR('good-map-phone.png'))).toBe('ok');
    expect(paint(FR('good-monasteries-phone.png'))).toBe('ok');
    expect(paint(FR('good-home-dark-phone.png'))).toBe('ok');
  });
  it('refuses a white frame (E11) and passes the self-test', () => {
    expect(execFileSync('python3', ['-I', PY, '--selftest'], { encoding: 'utf8' })).toContain('store_png self-test: ok');
  });
});

describe('store frame read-backs (scripts/store_checks.mjs, scripts/store_lib.sh)', () => {
  it('the crash screen, the map box / view and the list top are read on every frame', () => {
    expect(Object.keys(CHECKS as object)).toEqual(expect.arrayContaining(['crash', 'mapbox', 'mapview', 'listTop']));
    const lib = readFileSync(new URL('../../scripts/store_lib.sh', import.meta.url), 'utf8');
    expect(lib).toMatch(/v=\$\(check crash\); \[ "\$v" = none \] \|\| echo "CRASH FAIL/);
    expect(lib).toContain('> "$f.maprect"');
    expect(lib).toContain('MAP VIEW FAIL');
    expect(lib).toContain('LIST TOP FAIL');
  });
  it('the crash check names the crash screen and says none without it', () => {
    const g = globalThis as { document?: unknown };
    const keep = g.document;
    g.document = { querySelector: (s: string) => (s === '[data-testid="crash"]' ? { innerText: 'Щось пішло не так\nR-TypeError-f05a' } : null) };
    expect((0, eval)((CHECKS as Record<string, string>).crash)).toBe('crash R-TypeError-f05a');
    g.document = { querySelector: () => null };
    expect((0, eval)((CHECKS as Record<string, string>).crash)).toBe('none');
    g.document = keep;
  });
  it('the Play run starts every set from a fresh app at its final size (D16)', () => {
    const emu = readFileSync(new URL('../../scripts/emu_store.sh', import.meta.url), 'utf8');
    const set = emu.slice(emu.indexOf('shoot_set() {'), emu.indexOf('for lang in uk ru en'));
    expect(set).toMatch(/wm size[\s\S]*am force-stop \$PKG[\s\S]*am start -n \$PKG\/\.MainActivity/);
  });
});
