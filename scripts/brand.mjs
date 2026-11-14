// brand.mjs - the ONE source of the brand pictures (A-13): src/assets/brand/inok.svg (= https://inok.info/favicon.svg, unchanged).
// Used by make_icons.mjs (the launcher) and make_store_assets.mjs (Google Play's icon and feature graphic).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
export const svg = fs.readFileSync(path.join(ROOT, 'src/assets/brand/inok.svg'), 'utf8');
const BG = /fill:\s*rgb\((\d+),\s*(\d+),\s*(\d+)\)/.exec(svg.slice(svg.indexOf('<ellipse')));
/** the favicon's disc colour = the adaptive icon's background */
export const bgHex = '#' + BG.slice(1, 4).map((n) => Number(n).toString(16).padStart(2, '0')).join('').toUpperCase();
/** the foreground: everything but the disc */
export const domes = svg.replace(/<ellipse[^>]*\/>/, '');
export const uri = (s) => 'data:image/svg+xml;base64,' + Buffer.from(s).toString('base64');
/** the green disc in the favicon's own units (A-68: the feature graphic's white ring is concentric with it): centre, radius = the larger
 *  half-axis (the ellipse is 56.6 x 58.0 - a ring round it must clear both), and the viewBox side */
const E = /<ellipse[^>]*cx="([\d.]+)"[^>]*cy="([\d.]+)"[^>]*rx="([\d.]+)"[^>]*ry="([\d.]+)"/.exec(svg);
const VB = /viewBox="0 0 ([\d.]+) ([\d.]+)"/.exec(svg);
export const disc = { cx: Number(E[1]), cy: Number(E[2]), r: Math.max(Number(E[3]), Number(E[4])), side: Number(VB[1]) };
