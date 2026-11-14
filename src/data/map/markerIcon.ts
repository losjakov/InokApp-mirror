/**
 * The map marker of a house = the site's own SVG (A-12 / InokSite 246), by the site's rule skmGetIconsShapesSvg():
 * `{mon|skit|podv|col}{_stavro}{_fem}` from object_type / subordination / type; the three lavras by their code.
 * The 17 files live unchanged in src/assets/mapicons/ (copied from inok.info/local/templates/skm1c/images/mapicons/svg/).
 * The site has no stauropegial community icon (`col_stavro*` do not exist there), so a community is `col` / `col_fem`.
 */
export const LAVRA_ICON: Record<number, string> = { 242: 'lavra_kpl', 111: 'lavra_pch', 98: 'lavra_svg' };
const BASE: Record<number, string> = { 1: 'mon', 2: 'skit', 4: 'podv', 17: 'col' };

export interface IconInput { code: number; object_type: number | null; subordination: number | null; type: string | null }

export function markerIcon(h: IconInput): string {
  if (LAVRA_ICON[h.code]) return LAVRA_ICON[h.code];
  const base = BASE[h.object_type ?? 1] ?? 'mon'; // a lavra outside the three (none today) or an unknown type: a monastery
  const stavro = h.subordination === 2 && base !== 'col' ? '_stavro' : '';
  return `${base}${stavro}${h.type === 'f' ? '_fem' : ''}`;
}

/** Every icon name the rule can return = the 17 files (the map registers exactly these). */
export const MARKER_ICONS: string[] = [
  ...['mon', 'skit', 'podv'].flatMap((b) => ['', '_stavro'].flatMap((s) => ['', '_fem'].map((f) => `${b}${s}${f}`))),
  'col', 'col_fem', ...Object.values(LAVRA_ICON),
];
