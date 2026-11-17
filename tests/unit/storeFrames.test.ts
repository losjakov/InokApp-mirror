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
    expect(paint(FR('d16-map-phone.png'))).toMatch(/^MAP NOT PAINTED \(2\d% of the box rows/);
  });
  it('passes a whole map and real frames of the set (no false «blank» on a white list or a dark home)', () => {
    expect(paint(FR('good-map-phone.png'))).toBe('ok');
    // the release emulator's uk phone map of 1.0.12: whole, its land light (>= 250 in every channel) - refused by the first rule (37 % «white»)
    expect(paint(FR('good-map-light-land-phone.png'))).toBe('ok');
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

// cloud_40 (NOTE 3 of REVIEW cloud_39, E14): the Android WebView's tablet home frames failed `do wholeRows` with a bare 'none', asked ONCE
describe('store frame actions on a device: asked again like the browser ring, and every refusal says why', () => {
  it('emu_nav `do` asks up to 6 times (3 s apart) while the action answers none; the browser ring polls the same action', () => {
    const nav = readFileSync(new URL('../../scripts/emu_nav.mjs', import.meta.url), 'utf8');
    expect(nav).toMatch(/for \(let i = 0; i < 6; i\+\+\) \{\s*r = String\(await evaluate\(ACTIONS\[arg\]\)\);/);
    expect(nav).toMatch(/if \(r === 'ok' \|\| !r\.startsWith\('none'\)\) break;/);
    expect(readFileSync(new URL('../../screens/store.spec.ts', import.meta.url), 'utf8')).toMatch(/expect\.poll\(\(\) => act\(step\.slice\(3\)/);
  });
  it('wholeRows: the page measured = the one rowsWhole reads (the LAST shown), each none carries its reason', async () => {
    // @ts-expect-error - plain .mjs
    const { ACTIONS } = await import('../../scripts/store_checks.mjs');
    const src: string = ACTIONS.wholeRows;
    expect(src).toMatch(/const pg = shown\(\)\.pop\(\);/);
    expect(CHECKS.rowsWhole).toMatch(/filter\(\(x\) => !x\.classList\.contains\('ion-page-hidden'\)\)\.pop\(\)/);
    expect(src.match(/'none: /g)?.length).toBe(3);
    expect(src).not.toMatch(/return 'none';/);
  });
});

// cloud_40 (A-129, C1): the App Store frames 04 / 05 = the browser frame + the device's marks cut from a real simulator frame; a join that is
// not clean (a seam, app content under a band, a wrong size) is REFUSED - the frame then stays out of the set and is named
describe.skipIf(!hasPil)('App Store join (scripts/appstore_join.py)', () => {
  it('joins a clean pair and refuses a seam, covered content and a wrong size', () => {
    const PYJ = new URL('../../scripts/appstore_join.py', import.meta.url).pathname;
    expect(execFileSync('python3', ['-I', PYJ, '--self-test'], { encoding: 'utf8' }).trim()).toMatch(/^appstore_join self-test: PASS/);
  });
});
