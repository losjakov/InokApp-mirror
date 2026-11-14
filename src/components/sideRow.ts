/** Watches a row and its children (size, text, a font-scale change) and re-runs `check`; a ref callback's cleanup (React 19). */
function watchRow(el: HTMLElement, check: () => void) {
  const ro = new ResizeObserver(check);
  const watch = () => { ro.disconnect(); ro.observe(el); for (const c of Array.from(el.children)) ro.observe(c); check(); };
  const mo = new MutationObserver(watch);
  mo.observe(el, { childList: true, subtree: true, characterData: true });
  watch();
  return () => { ro.disconnect(); mo.disconnect(); };
}

/**
 * D48: ONE sideways row (A-15) — the card's actions and the filter chips. `data-overflow="1"` only while the content is wider than
 * the row: then the end fades (the next item peeks: «more this way») and the row scrolls; when everything fits, nothing is faded.
 */
export function sideRow(el: HTMLElement | null) {
  if (!el) return;
  return watchRow(el, () => { el.dataset.overflow = el.scrollWidth > el.clientWidth + 1 ? '1' : '0'; });
}

/**
 * D56: a grid of equal tiles in ONE row while every label fits its tile WITH the tile's inner padding; else `data-wrap="1"` (the CSS
 * lays them out two per row). Measured against the one-row width whatever the current layout is, so the two layouts never flip-flop.
 */
export function tileRow(el: HTMLElement | null) {
  if (!el) return;
  return watchRow(el, () => {
    const tiles = Array.from(el.children) as HTMLElement[];
    if (!tiles.length) return;
    const row = getComputedStyle(el); const tile = getComputedStyle(tiles[0]);
    const inner = el.clientWidth - parseFloat(row.paddingLeft) - parseFloat(row.paddingRight);
    const room = (inner - parseFloat(row.columnGap || '0') * (tiles.length - 1)) / tiles.length - parseFloat(tile.paddingLeft) - parseFloat(tile.paddingRight);
    const widest = Math.max(...tiles.map((t) => { const s = t.querySelector('span'); if (!s) return 0; const r = document.createRange(); r.selectNodeContents(s); return r.getBoundingClientRect().width; }));
    el.dataset.wrap = widest > room ? '1' : '0';
  });
}
