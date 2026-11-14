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
    for (const h of ['https://inok.info/monasteries/', 'https://inok.info/monasteries/table/', 'https://inok.info/monasteries/table/?oblast=3', 'https://inok.info/monasteries/242/photos/',
      'https://inok.info/articles/publications/', 'https://inok.info/articles/news/?page=2', 'https://inok.info/articles/publications/abc/', 'https://inok.info/articles/2869/',
      'https://inok.info/articles/other/12/', 'https://inok.info/live/', 'https://inok.info/donate/', 'https://inok.info/', 'https://example.com/articles/publications/1832/'])
      expect(linkTarget(h), h).toBeNull();
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
