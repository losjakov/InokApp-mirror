import { describe, expect, it } from 'vitest';
import { absoluteHref, linkTarget } from '@/data/links/router';
import { sanitize } from '@/components/HtmlLite';

const cardCodeOf = (h: string) => { const t = linkTarget(h); return t?.kind === 'card' ? t.code : null; };

/** A-21(а): the forms a link to a house takes in the site's texts ({code_NNN} → /monasteries/NNN/). */
describe('html-lite link router', () => {
  it('a card link in every form → its code', () => {
    for (const h of ['https://inok.info/monasteries/242/', 'https://inok.info/monasteries/242', 'http://inok.info/monasteries/242/', 'https://www.inok.info/monasteries/242/',
      '/monasteries/242/', '/monasteries/242/?lang=ru', 'https://inok.info/monasteries/242/?lang=en#history', '/monasteries/242#x', ' /monasteries/242/ '])
      expect(cardCodeOf(h), h).toBe(242);
  });
  it('anything else is not a card', () => {
    for (const h of ['https://inok.info/monasteries/', 'https://inok.info/monasteries/242/photos/', 'https://inok.info/articles/2869/', 'https://example.com/monasteries/242/',
      'https://inok.info.evil.com/monasteries/242/', 'mailto:a@b.c', 'javascript:alert(1)', '/dioceses/5/'])
      expect(cardCodeOf(h), h).toBeNull();
  });
  it('R-39: an article link in every form the body carries → its id (the app shows its own language; `?lang=` ignored)', () => {
    for (const h of ['https://inok.info/articles/publications/1832/', 'https://inok.info/articles/publications/1832/?lang=ru', 'https://inok.info/articles/publications/1832?lang=en',
      'https://www.inok.info/articles/publications/1832/', '/articles/publications/1832/', 'http://inok.info/articles/publications/1832/#x'])
      expect(linkTarget(h), h).toEqual({ kind: 'article', id: 1832 });
    expect(linkTarget('https://inok.info/articles/news/1833/')).toEqual({ kind: 'article', id: 1833 });
    expect(linkTarget('https://inok.info/articles/video/77/?lang=en')).toEqual({ kind: 'article', id: 77 });
  });
  it('A-76: every other path the App Links filter lets in names nothing of the app → the browser', () => {
    for (const h of ['https://inok.info/monasteries/table/', 'https://inok.info/monasteries/table/?oblast=3', 'https://inok.info/monasteries/242/photos/',
      'https://inok.info/articles/publications/abc/', 'https://inok.info/articles/2869/', 'https://inok.info/articles/x/', 'https://inok.info/dioceses/5/map/',
      'https://inok.info/articles/other/12/', 'https://inok.info/live/12/', 'https://inok.info/donate/', 'https://inok.info/', 'https://example.com/articles/publications/1832/',
      'https://example.com/monasteries/', 'https://inok.info/monasteriesx/', 'https://example.com/dioceses/5/'])
      expect(linkTarget(h), h).toBeNull();
  });
  it('A-138 (+ amendment): a site LIST page in every form (any ?lang=, any query, with or without the slash / www / a language prefix) -> its list', () => {
    const forms = (path: string) => [`https://inok.info/${path}`, `https://inok.info/${path}?lang=ru`, `https://inok.info/${path}?lang=en`, `https://www.inok.info/${path}`,
      `http://inok.info/${path.replace(/\/$/, '')}`, `/${path}`, `https://inok.info/${path}?page=2&lang=uk`, `https://inok.info/${path}#top`];
    const table = [['monasteries/', 'monasteries'], ['dioceses/', 'eparchies'], ['live/', 'streams'], ['articles/publications/', 'publication'], ['articles/video/', 'video'], ['articles/news/', 'news'], ['articles/', 'all']] as const;
    for (const [path, list] of table) for (const h of forms(path)) expect(linkTarget(h), h).toEqual({ kind: 'list', list });
    expect(linkTarget('https://inok.info/ru/monasteries/')).toEqual({ kind: 'list', list: 'monasteries' });
    expect(linkTarget('https://inok.info/uk/articles/')).toEqual({ kind: 'list', list: 'all' }); // T4
  });
  it('A-138 (backlog 13:57): an eparchy link `/dioceses/<id>/` (the article text\'s `{diocese}` token, any ?lang=) -> its page', () => {
    for (const h of ['https://inok.info/dioceses/5/', 'https://inok.info/dioceses/5/?lang=ru', 'https://inok.info/dioceses/5?lang=en', '/dioceses/5/', 'https://www.inok.info/dioceses/5/#x'])
      expect(linkTarget(h), h).toEqual({ kind: 'eparchy', id: 5 });
  });
  it('relative links are the site\'s; only http(s) survives', () => {
    expect(absoluteHref('/articles/1/')).toBe('https://inok.info/articles/1/');
    expect(absoluteHref('javascript:alert(1)')).toBeNull();
  });
  it('sanitize keeps a relative site link (made absolute) and drops a script link', () => {
    const out = sanitize('<p><a href="/monasteries/37/">Ц</a> <a href="javascript:x()">j</a></p>');
    if (typeof DOMParser === 'undefined') return; // node: the tag-stripping fallback
    expect(out).toContain('href="https://inok.info/monasteries/37/"');
    expect(out).not.toContain('javascript');
  });
});

/** A-166 (cloud_44): EVERY short / full / legacy form of the site's card and gallery links -> the card (+ its gallery on top). Red before: the
 *  short forms were null (the browser), `gallery=Y` was dropped. */
describe('A-166 gallery and short card links', () => {
  const hosts = ['https://inok.info', 'http://inok.info', 'https://www.inok.info'];
  const card = (gallery: boolean) => ({ kind: 'card', code: 140, gallery });
  it('the short forms x3 languages, with / without the slash -> the card; `/g` -> its gallery (any case)', () => {
    for (const h of hosts) for (const l of ['', '/uk', '/ru', '/en']) for (const sl of ['', '/']) {
      expect(linkTarget(`${h}${l}/140${sl}`), `${h}${l}/140${sl}`).toEqual(card(false));
      expect(linkTarget(`${h}${l}/140/g${sl}`), `${h}${l}/140/g${sl}`).toEqual(card(true));
      expect(linkTarget(`${h}${l}/140/G${sl}`), `${h}${l}/140/G${sl}`).toEqual(card(true));
    }
  });
  it('the full and the legacy forms; `gallery=Y` among any parameters, any order, any case', () => {
    for (const f of ['/monasteries/140/', '/monasteries/140', '/ru/monasteries/140/', '/objects/monasteries/140/', '/objects/monasteries/140'])
      expect(linkTarget(`https://inok.info${f}`), f).toEqual(card(false));
    for (const q of ['?gallery=Y', '?lang=ru&gallery=Y', '?gallery=Y&lang=en', '?GALLERY=y', '?gallery=y&utm_source=tg', '?a=1&lang=uk&gallery=Y#photo'])
      for (const f of ['/monasteries/140/', '/140/', '/ru/140', '/objects/monasteries/140/'])
        expect(linkTarget(`https://inok.info${f}${q}`), f + q).toEqual(card(true));
    for (const q of ['?gallery=N', '?gallery=', '?lang=ru', '?gal=Y']) expect(linkTarget(`https://inok.info/monasteries/140/${q}`), q).toEqual(card(false));
  });
  it('a non-numeric id, another prefix or a deeper path is NOT a card (the browser, as today)', () => {
    for (const f of ['/140a/', '/a140/', '/14.0/', '/de/140/', '/ru/140/x/', '/140/g/x', '/140/gallery/', '/140/gg', '/objects/monasteries/140/photos/', '/objects/140/',
      '/ru/map/', '/app/', '/app/versions/', '/ru/', '/uk', '/-140/'])
      expect(linkTarget(`https://inok.info${f}`), f).toBeNull();
    expect(linkTarget('https://example.com/140/g')).toBeNull();
  });
});
