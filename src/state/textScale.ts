/**
 * A-56: the system text scale, MEASURED (the Android WebView applies the system font size as its text zoom; the browser screens as the
 * root font size) - a probe of 1 rem with `line-height: 1` is as tall as the font the engine really draws (16 px at 100 %). At a large scale
 * (>= LARGE_TEXT, the largest step of Android 8 «Huge» = 130 %; Android 14 goes to 200 %) `<html data-text-large="1">` turns hyphenation
 * on (app.css); at a normal scale the lines wrap between words as before (A-55: no visible change he did not ask for).
 */
export const LARGE_TEXT = 1.3;
export const isLargeText = (scale: number) => scale >= LARGE_TEXT - 0.01;

export function measureTextScale(doc: Document = document): number {
  const p = doc.createElement('span');
  p.style.cssText = 'position:absolute;visibility:hidden;font-size:1rem;line-height:1;display:inline-block;white-space:nowrap';
  p.textContent = 'M';
  doc.body.appendChild(p);
  const h = p.getBoundingClientRect().height;
  p.remove();
  return h > 0 ? h / 16 : 1;
}

/** Marks the document at start, after the page's styles have loaded, and whenever the window changes (rotation, split screen). */
export function applyTextScale(win: Window = window): void {
  const set = () => { win.document.documentElement.dataset.textLarge = isLargeText(measureTextScale(win.document)) ? '1' : '0'; };
  set();
  win.addEventListener('load', set);
  win.addEventListener('resize', set);
}
