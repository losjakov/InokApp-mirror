/** App icons that ionicons lacks (owner 31.10: «Монастирі» = a church dome with a cross, never a skyscraper). Same stroke style as
 *  the ionicons «outline» set (viewBox 512, stroke 32, currentColor) so it sits beside them in the tab bar and the tiles. */
const svg = (body: string) =>
  `data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><g fill="none" stroke="currentColor" stroke-width="32" stroke-linecap="round" stroke-linejoin="round">${body}</g></svg>`;

export const churchOutline = svg(
  '<path d="M256 40v104M216 80h80"/>' +
  '<path d="M256 144c-56 48-112 100-112 160h224c0-60-56-112-112-160z"/>' +
  '<path d="M160 304v152M352 304v152M104 456h304"/>' +
  '<path d="M224 456v-64a32 32 0 0 1 64 0v64"/>',
);

/** Material Symbols (Apache 2.0) filled glyphs on their own 24-unit grid: the A−/A+ of the article text size (A-23 #8). */
const svgFill = (d: string) =>
  `data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path fill="currentColor" d="${d}"/></svg>`;
const LETTER_A = 'M0.99 19h2.42l1.27-3.58h5.65L11.59 19h2.42L8.75 5h-2.5L0.99 19zM5.41 13.39L7.44 7.6h0.12l2.03 5.79H5.41z';
export const textDecrease = svgFill(`${LETTER_A}M23 11v2h-8v-2H23z`);
export const textIncrease = svgFill(`${LETTER_A}M20 11h3v2h-3v3h-2v-3h-3v-2h3V8h2V11z`);
