import { describe, expect, it } from 'vitest';
import { screenName } from '@/native/analytics';
import { DEFAULTS } from '@/state/settings';

/** A-36: only the screen's NAME leaves the device — never a card code, an article id, a search or a place */
describe('analytics: the screen name', () => {
  it.each([
    ['/home', '', 'home'], ['/monasteries', '?q=лавра', 'monasteries'], ['/monasteries/242', '', 'monastery'], ['/map', '?at=50.43,30.56', 'map'],
    ['/map', '?eparchy=1', 'map'], ['/streams', '', 'streams'], ['/articles', '', 'articles'], ['/articles', '?id=2869', 'article'],
    ['/more', '', 'more'], ['/more/eparchies', '', 'eparchies'], ['/more/eparchies/17', '', 'eparchy'], ['/more/contacts/', '', 'contacts'],
    ['/unknown', '', null],
  ])('%s%s → %s', (path, search, name) => {
    const got = screenName(path, search);
    expect(got).toBe(name);
    if (got) expect(got).toMatch(/^[a-z]+$/); // no digits, no text the person typed
  });
  it('A-96 W-7: collection on by default = incognito OFF by default (the switch in tests/unit/incognito.test.ts)', () => expect(DEFAULTS.incognito).toBe(false));
});
