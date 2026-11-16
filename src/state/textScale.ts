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

/**
 * cloud_37 (A-121): iOS - WKWebView does NOT apply the system text size (Android's WebView does, as its text zoom). The system's body font
 * (`-apple-system-body`: 17 px at the default «Large») follows Dynamic Type, so on iOS the root size = 100 % x body / 17, kept between 80 %
 * and 200 % (Android 14's largest step: every layout of the app is proven up to it; Apple's accessibility sizes go higher).
 */
export const IOS_BODY_PX = 17;
export const MAX_TEXT_SCALE = 2;
export const iosRootPercent = (bodyPx: number): number =>
  Math.round(Math.min(MAX_TEXT_SCALE, Math.max(0.8, bodyPx > 0 ? bodyPx / IOS_BODY_PX : 1)) * 1000) / 10;

/** the size of the system's body font now (Dynamic Type), or 0 where the engine has no such font (every engine but WebKit) */
export function iosBodyPx(doc: Document = document): number {
  const css = doc.defaultView?.CSS;
  if (!css?.supports?.('font', '-apple-system-body')) return 0;
  const p = doc.createElement('span');
  p.style.cssText = 'position:absolute;visibility:hidden;font:-apple-system-body';
  doc.body.appendChild(p);
  const px = parseFloat(doc.defaultView!.getComputedStyle(p).fontSize);
  p.remove();
  return px || 0;
}

/** Marks the document at start, after the page's styles have loaded, and whenever the window changes (rotation, split screen); on iOS
 *  (`ios`) first sets the root size from Dynamic Type - again when the app comes back (the person changed it in Settings meanwhile). */
export function applyTextScale(win: Window = window, ios = false): void {
  const set = () => {
    const html = win.document.documentElement;
    if (ios && win.document.body) { const px = iosBodyPx(win.document); if (px) html.style.fontSize = `${iosRootPercent(px)}%`; }
    html.dataset.textLarge = isLargeText(measureTextScale(win.document)) ? '1' : '0';
  };
  set();
  win.addEventListener('load', set);
  win.addEventListener('resize', set);
  if (ios) win.document.addEventListener('visibilitychange', () => { if (win.document.visibilityState === 'visible') set(); });
}
