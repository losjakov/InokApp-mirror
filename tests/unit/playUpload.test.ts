import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { APP_VERSION } from '@/app/version';

/** A-117 A5: the tag run's Google Play upload - a DRAFT on INTERNAL testing, the notes of THIS version, the versionCode of THE rule */
describe('Google Play upload (scripts/play_upload.py)', () => {
  const body = JSON.parse(execFileSync('python3', ['-I', 'scripts/play_upload.py', 'body', 'package.json', 'store/release_notes'], { encoding: 'utf8' }));
  const [x, y, z] = APP_VERSION.split('.').map(Number);
  it('internal testing, a draft, this version', () => {
    expect(body.track).toBe('internal');
    expect(body.releases).toHaveLength(1);
    expect(body.releases[0].status).toBe('draft');
    expect(body.releases[0].versionCodes).toEqual([String(x * 10000 + y * 100 + z)]);
    expect(body.releases[0].name).toBe(`${x * 10000 + y * 100 + z} (${APP_VERSION})`);
  });
  it('the notes = the three sections of store/release_notes/<version>.md', () => {
    const s = readFileSync(`store/release_notes/${APP_VERSION}.md`, 'utf8');
    const sec = (l: string) => new RegExp(`## ${l}\\n([\\s\\S]*?)(?=\\n## |\\n# |$)`).exec(s)![1].trim();
    expect(body.releases[0].releaseNotes).toEqual([{ language: 'uk', text: sec('uk') }, { language: 'ru-RU', text: sec('ru') }, { language: 'en-US', text: sec('en') }]);
  });
  it('the workflow: the tag run only, after the AAB artifact, skipped without the secret', () => {
    const wf = readFileSync('.github/workflows/build.yml', 'utf8');
    const step = wf.slice(wf.indexOf('- name: Google Play - the AAB'));
    expect(step).toMatch(/^\s*- name: Google Play[^\n]*\n\s+if: startsWith\(github\.ref, 'refs\/tags\/v'\)/);
    expect(wf.indexOf('name: app-release.aab')).toBeLessThan(wf.indexOf('- name: Google Play - the AAB'));
    expect(step).toMatch(/SKIPPED - no secret PLAY_SERVICE_ACCOUNT_JSON/);
    expect(step).not.toMatch(/echo "\$PLAY_SERVICE_ACCOUNT_JSON"|cat "\$K"/);
  });
});
