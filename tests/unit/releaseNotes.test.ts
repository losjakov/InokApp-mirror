import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { APP_VERSION } from '@/app/version';

// REF_app_release §3.3: every version has its «Що нового» - uk (the original), ru, en; Google Play <= 500 characters, the App Store <= 4000.
// A-156: one «App Store only, after the second line:» line per section - THE parse is scripts/play_upload.py `texts` (no second copy here).
const LANGS = ['uk', 'ru', 'en'] as const;
const file = `store/release_notes/${APP_VERSION}.md`;
const texts = () => JSON.parse(execFileSync('python3', ['-I', 'scripts/play_upload.py', 'texts', 'package.json', 'store/release_notes'], { encoding: 'utf8' }));

describe('release notes', () => {
  it(`${file}: uk / ru / en, Google Play 1..500 characters, the App Store 1..4000`, () => {
    expect(existsSync(file), `notes for ${APP_VERSION}`).toBe(true);
    const t = texts();
    for (const l of LANGS) {
      expect([...t.play[l]].length, `${l} play`).toBeGreaterThan(0);
      expect([...t.play[l]].length, `${l} play: ${[...t.play[l]].length}`).toBeLessThanOrEqual(500);
      expect([...t.appstore[l]].length, `${l} appstore`).toBeLessThanOrEqual(4000);
    }
  });
  it('Google Play never shows the App Store line; the App Store has it third, after the shared second line', () => {
    const s = readFileSync(file, 'utf8');
    const t = texts();
    for (const l of LANGS) {
      expect(t.play[l]).not.toContain('App Store only');
      expect(t.appstore[l]).not.toContain('App Store only');
      const only = new RegExp(`## ${l}\\n[\\s\\S]*?App Store only, after the second line: ([^\\n]+)`).exec(s)?.[1];
      const play = t.play[l].split('\n');
      expect(t.appstore[l].split('\n')).toEqual(only ? [...play.slice(0, 2), only, ...play.slice(2)] : play);
    }
  });
});
