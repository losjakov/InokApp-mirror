import { Fragment, createElement, useMemo, type ReactNode } from 'react';
import { useFollowLink } from '@/app/links';
import { absoluteHref, isSitePicture } from '@/data/links/router';
import { CoverImage } from './CoverImage';
import { Gallery, type GalleryItem } from './Gallery';

const ALLOWED = new Set(['P', 'BR', 'STRONG', 'EM', 'U', 'SUP', 'UL', 'OL', 'LI', 'A', 'IMG', 'H2', 'H3', 'H4', 'H5']); // U: the calendar's week line (R-24); H2-H5: R-33
/** R-37: `class="al-r"` / `"al-c"` on p, li, h2-h5 = the page's right / centred text (theme/app.css: one rule for bodies and histories). */
const ALIGNED = new Set(['P', 'LI', 'H2', 'H3', 'H4', 'H5']);
const ALIGN_CLASSES = new Set(['al-r', 'al-c']);
const IMG_ATTRS = new Set(['src', 'width', 'height', 'alt']);
/** R-45: a site gallery = `<div class="gallery">` - the ONE div html-lite keeps (any other div is unwrapped, its content shown). */
const isGallery = (el: Element) => el.tagName === 'DIV' && el.getAttribute('class')?.trim() === 'gallery';

/**
 * Renders contract html-lite (p, br, strong, em, sup, ul, ol, li, a; R-18: img of the site's own pictures; R-33: h2-h5 of a body) and nothing else.
 * Headings take THE heading scale of html-lite text (`.history h2..h5` in app.css, A-50 #3) - relative to the text and its A-/A+.
 * Links: a house's card (in the DB) or an article (R-39) opens IN the app (A-21(а), the one router `useFollowLink`), anything else leaves for the browser.
 * Pictures (R-18): in their place, a frame of the file's own proportions before the file arrives (no layout jump), the A-19/A-20
 * cache and the ONE placeholder (CoverImage); a tap opens the full-screen viewer — for a gallery picture wrapped in `<a href>` to
 * the full file, the viewer shows that file, never the browser. `photoKey` groups the pictures with their article (eviction, A-19).
 */
export function HtmlLite({ html, className, photoKey }: { html: string; className?: string; photoKey?: string }) {
  const follow = useFollowLink();
  const tree = useMemo(() => render(sanitize(html), photoKey ?? 'html'), [html, photoKey]);
  return (
    <>
      <div
        className={className}
        onClick={(e) => {
          const href = (e.target as HTMLElement).closest('a')?.getAttribute('href');
          if (href) {
            e.preventDefault();
            void follow(href);
          }
        }}
      >
        {tree}
      </div>
    </>
  );
}

export function sanitize(html: string): string {
  if (typeof DOMParser === 'undefined') return html.replace(/<[^>]+>/g, '');
  const doc = new DOMParser().parseFromString(`<div>${html}</div>`, 'text/html');
  const walk = (el: Element) => {
    for (const child of Array.from(el.children)) {
      walk(child);
      if ((!ALLOWED.has(child.tagName) && !isGallery(child)) || (child.tagName === 'IMG' && !isSitePicture(child.getAttribute('src') ?? ''))) {
        child.replaceWith(...Array.from(child.childNodes)); // a foreign picture is dropped (contract §3, R-18)
        continue;
      }
      for (const attr of Array.from(child.attributes)) {
        if (child.tagName === 'A' && attr.name === 'href') {
          const abs = absoluteHref(attr.value); // a relative link is the site's (A-21(а)); only http(s) survives
          if (abs) { child.setAttribute('href', abs); continue; }
        }
        if (child.tagName === 'IMG' && IMG_ATTRS.has(attr.name)) continue;
        if (attr.name === 'class' && isGallery(child)) { child.setAttribute('class', 'gallery'); continue; }
        if (attr.name === 'class' && ALIGNED.has(child.tagName)) { // R-37 (A-53): the site's right / centre alignment, its own two classes only
          const keep = attr.value.split(/\s+/).filter((c) => ALIGN_CLASSES.has(c));
          if (keep.length) { child.setAttribute('class', keep[0]); continue; }
        }
        child.removeAttribute(attr.name);
      }
    }
  };
  const root = doc.body.firstElementChild!;
  walk(root);
  // space economy (CLAUDE.md): the site's editor leaves empty paragraphs (<p><em><br></em></p>) and <br> runs around pictures —
  // on a phone they are half a screen of nothing; a picture keeps its own margin
  for (const p of Array.from(root.querySelectorAll('p'))) if (!p.textContent?.trim() && !p.querySelector('img')) p.remove();
  for (const img of Array.from(root.querySelectorAll('img'))) {
    const box = img.parentElement?.tagName === 'A' ? img.parentElement : img;
    for (const dir of ['previousSibling', 'nextSibling'] as const) {
      let n = box[dir];
      while (n && ((n.nodeType === 3 && !n.textContent?.trim()) || (n as Element).tagName === 'BR')) { const x = n; n = n[dir]; x.remove(); }
    }
  }
  return root.innerHTML;
}

const num = (v: string | null) => (v && /^\d+$/.test(v) ? Number(v) : null);

/** Sanitized html-lite → React; `<img>` becomes the app's picture slot, a gallery `<a href=full><img></a>` gives the viewer its file. */
function render(safe: string, key: string): ReactNode {
  if (typeof DOMParser === 'undefined') return safe;
  const root = new DOMParser().parseFromString(`<div>${safe}</div>`, 'text/html').body.firstElementChild!;
  const pic = (img: Element, full: string | null, k: number): ReactNode => {
    const src = img.getAttribute('src')!;
    const w = num(img.getAttribute('width'));
    const h = num(img.getAttribute('height'));
    const alt = img.getAttribute('alt') ?? '';
    return (
      <CoverImage key={k} code={key} url={src} alt={alt} className="body-pic" full ratio={w && h ? w / h : undefined}
        openable={{ full }} />
    );
  };
  const conv = (n: ChildNode, k: number): ReactNode => {
    if (n.nodeType === 3) return n.textContent;
    if (n.nodeType !== 1) return null;
    const el = n as Element;
    const tag = el.tagName.toLowerCase();
    if (tag === 'img') return pic(el, null, k);
    if (tag === 'div') { // R-45 + A-96 W-4: the gallery grid; a picture with no link of its own opens its own copy
      const items: GalleryItem[] = Array.from(el.querySelectorAll('img')).map((img) => {
        const a = img.parentElement?.tagName === 'A' ? img.parentElement.getAttribute('href') : null;
        return { src: img.getAttribute('src')!, full: a && isSitePicture(a) ? a : null, w: num(img.getAttribute('width')), h: num(img.getAttribute('height')), alt: img.getAttribute('alt') ?? '' };
      });
      return items.length ? <Gallery key={k} items={items} photoKey={key} /> : null;
    }
    const kids = Array.from(el.childNodes);
    if (tag === 'a') {
      const imgs = el.querySelectorAll('img');
      const href = el.getAttribute('href');
      // a gallery picture: the link points at the full file of the site — the viewer opens it, not the browser
      if (imgs.length === 1 && !el.textContent?.trim() && href && isSitePicture(href)) return pic(imgs[0], href, k);
      return createElement('a', { key: k, href }, kids.map(conv));
    }
    if (tag === 'br') return <br key={k} />;
    return createElement(tag, { key: k, className: el.getAttribute('class') ?? undefined }, kids.map(conv));
  };
  return <Fragment>{Array.from(root.childNodes).map(conv)}</Fragment>;
}
