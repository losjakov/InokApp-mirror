import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

/** cloud_42 (A-135): the App Store 04 / 05 browser half on the live export is EVIDENCE, never a gate - the step can only end with exit 0, it
 *  sends no key of the app (only the public User-Agent), and every outcome (JOINED / REFUSED / NOT MADE / SKIPPED + the HTTP code) is written. */
describe('the appstore job\'s live 04 / 05 step', () => {
  const a = readFileSync('.github/actions/ios-sim-run/action.yml', 'utf8');
  const step = a.slice(a.indexOf('App Store 04-eparchy / 05-map'), a.indexOf('- uses: actions/upload-artifact'));
  it('exists, only for the appstore task, never for the 6.3-inch set', () => expect(step).toMatch(/if: inputs\.task == 'appstore' && inputs\.device != 'iphone63'/));
  it('never fails the job', () => { expect(step).toMatch(/set \+e/); expect(step.match(/exit (\d)/g)?.every((e) => e === 'exit 0')).toBe(true); });
  it('sends no app key', () => expect(step).not.toMatch(/X-Inok-App|APP_KEY/));
  it('writes why it skipped (the HTTP code)', () => expect(step).toMatch(/SKIPPED - the export refused this runner \(HTTP/));
});
