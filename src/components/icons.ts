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

/** A-120 (1): Telegram's logo (Simple Icons, CC0; ionicons has none) on the same 24-unit filled grid - beside ionicons' logo-facebook / logo-instagram */
export const logoTelegram = svgFill('M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z');
