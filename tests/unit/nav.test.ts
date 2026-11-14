import { describe, expect, it } from 'vitest';
import { backAction, OPENED_FROM, TABS, tabOf, tabTap, type TabId } from '@/app/nav';

describe('Android Back (owner 01.11: «Ще» back did nothing; the last Back folds the app)', () => {
  it('home folds the app (moved to the back, not finished)', () => {
    expect(backAction('/home', '', true)).toEqual({ kind: 'minimize' });
    expect(backAction('/', '', false)).toEqual({ kind: 'minimize' });
  });
  it('every plain tab root, «Ще» included, returns to home', () => {
    for (const p of ['/more', '/monasteries', '/map', '/streams', '/articles', '/more/'])
      expect(backAction(p, '', true)).toEqual({ kind: 'go', to: '/home' });
  });
  it('a detail walks the history, or goes to its parent when opened first (push tap, deep link)', () => {
    expect(backAction('/more/language', '', true)).toEqual({ kind: 'history' });
    expect(backAction('/more/language', '', false)).toEqual({ kind: 'go', to: '/more' });
    // F2 (A-79 2): the tablet's selection rides the query of the list's own path - Back walks it, opened first = the list
    expect(backAction('/monasteries', '?code=242', true)).toEqual({ kind: 'history' });
    expect(backAction('/monasteries', '?code=242', false)).toEqual({ kind: 'go', to: '/monasteries' });
    expect(backAction('/more/eparchies', '?id=27', false)).toEqual({ kind: 'go', to: '/more/eparchies' });
    expect(backAction('/more/eparchies/5', '', false)).toEqual({ kind: 'go', to: '/more/eparchies' }); // PLAN 7
    expect(backAction('/more/eparchies', '', false)).toEqual({ kind: 'go', to: '/more' });
    expect(backAction('/monasteries/242', '', false)).toEqual({ kind: 'go', to: '/monasteries' });
    expect(backAction('/articles', '?id=2869', false)).toEqual({ kind: 'go', to: '/articles' });
    expect(backAction('/articles', '?id=2869', true)).toEqual({ kind: 'history' });
    expect(backAction('/map', '?eparchy=5', false)).toEqual({ kind: 'go', to: '/more/eparchies/5' });
    expect(backAction('/map', '?at=50.43,30.56', false)).toEqual({ kind: 'go', to: '/more/contacts' }); // PLAN 5: the «Контакти» mini-map
    expect(backAction('/map', '?at=50.43,30.56', true)).toEqual({ kind: 'history' });
    expect(backAction('/map', '?code=37', false)).toEqual({ kind: 'go', to: '/monasteries/37' });
  });
});

/** A-25 #1 / #6: every cross-screen jump, played on a model of the browser history (push / replace / Back = backAction). */
class History {
  entries: { path: string; search: string; opened: boolean }[] = [{ path: '/home', search: '', opened: false }];
  i = 0;
  get at() { const e = this.entries[this.i]; return e.path + e.search; }
  push(url: string, opened = false) { const [path, q] = url.split('?'); this.entries = this.entries.slice(0, this.i + 1); this.entries.push({ path, search: q ? `?${q}` : '', opened }); this.i++; return this; }
  replace(url: string, opened = false) { const [path, q] = url.split('?'); this.entries[this.i] = { path, search: q ? `?${q}` : '', opened }; return this; }
  back() {
    const e = this.entries[this.i];
    const a = backAction(e.path, e.search, this.i > 0, e.opened);
    if (a.kind === 'history') this.i--;
    else if (a.kind === 'go') this.replace(a.to);
    else return 'minimized';
    return this.at;
  }
}
const from = (...urls: string[]) => { const h = new History(); urls.forEach((u) => h.push(u)); return h; };

describe('the transition table (header arrow = system Back)', () => {
  it.each([
    ['home tile → list', ['/monasteries'], '/home'],
    ['list → card', ['/monasteries', '/monasteries/37'], '/monasteries'],
    ['card → its map point', ['/monasteries', '/monasteries/37', '/map?code=37'], '/monasteries/37'],
    ['card → parent house', ['/monasteries/110', '/monasteries/98'], '/monasteries/110'],
    ['eparchy page → its map (the owner\'s #1)', ['/more', '/more/eparchies', '/more/eparchies/5', '/map?eparchy=5'], '/more/eparchies/5'],
    ['eparchy page → a house', ['/more/eparchies/5', '/monasteries/37'], '/more/eparchies/5'],
    ['list → eparchies chip', ['/monasteries', '/more/eparchies'], '/monasteries'],
    ['article → a house link (A-21)', ['/articles', '/articles?id=2869', '/monasteries/242'], '/articles?id=2869'],
    ['card → related article', ['/monasteries/242', '/articles?id=2869'], '/monasteries/242'],
    ['home «Нове на сайті» → article', ['/articles?id=2869'], '/home'],
    ['home «Поруч» → card', ['/monasteries/37'], '/home'],
    ['push tap → article (navigated from home)', ['/articles?id=2869'], '/home'],
    ['«Ще» → Контакти', ['/more', '/more/contacts'], '/more'],
    ['photo placeholder → «Ще» photo setting', ['/monasteries/37', '/more?photos=1'], '/monasteries/37'],
    ['tab bar list → tab bar map', ['/monasteries', '/map'], '/home'],
  ])('%s', (_name, urls, expected) => {
    expect(from(...(urls as string[])).back()).toBe(expected);
  });
  it('a map opened for an eparchy keeps its way back when its scope chip is cleared (replace in place)', () => {
    const h = from('/more/eparchies/5', '/map?eparchy=5').replace('/map', OPENED_FROM.opened);
    expect(h.back()).toBe('/more/eparchies/5');
  });
  it('a map opened for a card keeps its way back when the marker card closes', () => {
    expect(from('/monasteries/37', '/map?code=37').replace('/map', true).back()).toBe('/monasteries/37');
  });
  it('a deep link walks up to home, then folds', () => {
    const h = new History(); h.replace('/monasteries/37');
    expect(h.back()).toBe('/monasteries');
    expect(h.back()).toBe('/home');
    expect(h.back()).toBe('minimized');
  });
});

/** A-27 / D44: a tab button always opens its tab's top screen, whatever was opened in that tab before. */
describe('the bottom tabs (A-27)', () => {
  const tabs = Object.keys(TABS) as TabId[];
  it('every path belongs to its tab by prefix; home to none', () => {
    expect(tabOf('/more/eparchies/5')).toBe('more');
    expect(tabOf('/monasteries/37')).toBe('monasteries');
    expect(tabOf('/map')).toBe('map');
    expect(tabOf('/home')).toBeUndefined();
    expect(tabOf('/mapx')).toBeUndefined();
  });
  // the owner's path and every cross jump: wherever the app stands, each of the 5 buttons goes to its top screen
  const places = ['/home', '/more/eparchies/5', '/map?eparchy=5', '/monasteries/37', '/map?code=37', '/articles?id=2869', '/more/contacts', '/more?photos=1', '/monasteries', '/more'];
  it.each(places)('from %s each tab button = its top screen (or scroll up on it)', (url) => {
    const [path, q] = url.split('?'); const search = q ? `?${q}` : '';
    for (const t of tabs) {
      const a = tabTap(t, path, search);
      if (path === TABS[t] && !search) expect(a).toEqual({ kind: 'scrollTop' });
      else expect(a).toEqual({ kind: 'go', to: TABS[t] });
    }
  });
});
