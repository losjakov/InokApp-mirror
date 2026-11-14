import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

// A-83 edge-to-edge (ref/FUTURE_play_quality.md §4): ONE rule per edge - Capacitor's injected value first (0 below WebView 140, where the
// window is padded natively; the real inset from 140 on), env() for iOS / the browser; Ionic's variables point at it; no bare env().
const root = new URL('../../', import.meta.url).pathname;
const read = (p: string) => readFileSync(join(root, p), 'utf8');
const files = (d: string): string[] => readdirSync(join(root, d)).flatMap((f) => {
  const p = join(d, f); return statSync(join(root, p)).isDirectory() ? files(p) : [p];
});
const EDGES = ['top', 'right', 'bottom', 'left'] as const;

describe('safe area (edge-to-edge, A-83)', () => {
  const vars = read('src/theme/variables.css');
  it('one rule per edge: the injected --safe-area-inset-X, then env(), then 0 - and never less than the native overlap (P30 Pro)', () => {
    for (const e of EDGES) {
      // 1.0.5 round 2 (owner 11.11, Huawei P30 Pro, Android 10): Capacitor 8.6.0 injects bottom 0 on API < 30 (capacitor#8603) - the tab bar
      // went under the 3 buttons; MainActivity publishes how far the WebView REALLY lies under the navigation bar (--inok-nav-X)
      expect(vars).toContain(`--inok-safe-${e}: max(var(--safe-area-inset-${e}, env(safe-area-inset-${e}, 0px)), var(--inok-nav-${e}, 0px));`);
      expect(vars).toContain(`--ion-safe-area-${e}: var(--inok-safe-${e});`);
    }
  });
  it('no other place reads env(safe-area-*) or defines a second copy', () => {
    const web = [...files('src'), 'index.html'].filter((f) => /\.(css|tsx?|html)$/.test(f));
    const bare = web.filter((f) => f !== 'src/theme/variables.css' && /env\(\s*safe-area/.test(read(f)));
    expect(bare).toEqual([]);
    expect(vars.match(/env\(safe-area-inset-/g)).toHaveLength(4);
    const own = web.filter((f) => /--inok-safe-[a-z]+\s*:/.test(read(f)));
    expect(own).toEqual(['src/theme/variables.css']);
  });
  it('viewport-fit=cover (Capacitor passes the insets only then); the status-bar plugin (Play REC B) is gone', () => {
    expect(read('index.html')).toMatch(/viewport-fit=cover/);
    const pkg = JSON.parse(read('package.json')) as { dependencies: Record<string, string> };
    expect(pkg.dependencies['@capacitor/status-bar']).toBeUndefined();
    expect(read('android/capacitor.settings.gradle')).not.toMatch(/status-bar/);
    // never the deprecated or opt-out calls in our own native code (the DEX search in build.yml covers the libraries)
    const java = files('android/app/src').filter((f) => f.endsWith('.java')).map(read).join('\n');
    expect(java).not.toMatch(/setStatusBarColor|setNavigationBarColor|setDecorFitsSystemWindows/);
    expect(files('android/app/src/main/res').filter((f) => f.endsWith('.xml')).map(read).join('\n')).not.toMatch(/windowOptOutEdgeToEdgeEnforcement/);
  });
});
