import { afterEach, describe, expect, it, vi } from 'vitest';
import { userAgent } from '@/data/api/client';
import { APP_VERSION } from '@/app/version';

// cloud_41 (A-131, contract §1 / R-60): the User-Agent of every request is STRICTLY `InokApp/<version> (android|ios)`
const playAs = (p: string | null) => vi.stubGlobal('localStorage', { getItem: (k: string) => (k === 'inok.platform' ? p : null) });
describe('User-Agent', () => {
  afterEach(() => vi.unstubAllGlobals());
  it('android (anything not iOS - never «web»)', () => {
    playAs(null);
    expect(userAgent()).toBe(`InokApp/${APP_VERSION} (android)`);
    expect(userAgent()).toMatch(/^InokApp\/\d+\.\d+\.\d+ \((android|ios)\)$/);
  });
  it('ios', () => {
    playAs('ios');
    expect(userAgent()).toBe(`InokApp/${APP_VERSION} (ios)`);
  });
});
