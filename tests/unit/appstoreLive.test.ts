import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

/** cloud_42 (A-135): the App Store 04 / 05 browser half on the live export is EVIDENCE, never a gate - the step can only end with exit 0, it
 *  sends no key of the app (only the public User-Agent), and every outcome (JOINED / REFUSED / NOT MADE / SKIPPED + the HTTP code) is written. */
describe('the appstore job\'s live 04 / 05 step', () => {
  const a = readFileSync('.github/actions/ios-sim-run/action.yml', 'utf8');
  const step = a.slice(a.indexOf('App Store 04-eparchy / 05-map'), a.indexOf('- uses: actions/upload-artifact'));
  // cloud_44 (A-168 (3)): the 6.3-inch set too - at ITS OWN measured insets (1.0.17 had the 6.9-inch frames scaled); each device greps its own tests
  it('exists, only for the appstore task, every device incl. the 6.3-inch one, its own tests only', () => {
    expect(step).toMatch(/if: inputs\.task == 'appstore'\s/);
    expect(step).not.toMatch(/device != 'iphone63'/);
    expect(step).toMatch(/--grep "\$D \(uk\|ru\|en\)\$"/);
  });
  it('never fails the job', () => { expect(step).toMatch(/set \+e/); expect(step.match(/exit (\d)/g)?.every((e) => e === 'exit 0')).toBe(true); });
  // cloud_43 (T14): the live pair = the one the bundle step fetched for this build (the site WITH the public key, sha checked) - no second fetch
  it('takes the bundled live export (one fetch, one source); no curl of its own', () => {
    expect(step).toMatch(/cp public\/bundled\/manifest\.json fixtures\/manifest\.json && cp public\/bundled\/directory_v1\.json\.gz\.bin fixtures\/directory_v1\.json\.gz/);
    expect(step).not.toMatch(/curl /);
    expect(readFileSync('.github/actions/ios-setup/action.yml', 'utf8')).toMatch(/node scripts\/bundle_export\.mjs && npm run build/);
  });
  it('writes why it skipped', () => expect(step).toMatch(/SKIPPED - no bundled live export in this job/));
});
