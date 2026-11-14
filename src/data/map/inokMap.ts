import { Map as MLMap, NavigationControl, setWorkerUrl, type ErrorEvent, type GeoJSONSource, type LngLatBoundsLike, type MapOptions } from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
// MapLibre 6 resolves its worker as `./maplibre-gl-worker.mjs` next to its own module URL; after Vite bundling that
// file is not next to the chunk → «Worker failed to load» → no rendering. Point it at OUR worker bundle (REF_gotchas):
// built by Vite to the engine floor, with the floor's polyfills (A-46, ./mapWorker.ts).
import mapWorkerUrl from './mapWorker.ts?worker&url';
import { MARKER_ICONS } from './markerIcon';
import { basemapTransform } from './basemap';
import { FALLBACK_STYLE, UKRAINE_BOUNDS, splitLavras } from './geojson';
import type { Lang } from '@/i18n';
setWorkerUrl(mapWorkerUrl);

/**
 * PLAN 5 (cloud_11): ONE set-up of every map the app draws — the main map and the mini-maps (an eparchy's page, «Контакти»).
 * Here and nowhere else: the style URL from config through the ONE base-map transform (A-24), the flat fallback when the style
 * cannot load, the site's 17 marker pins (A-12), the clustered houses with the lavras above every marker (A-21(б)), the cluster
 * count over the pins (D35), the place point (the editorial office), the collapsed attribution (D8). What is drawn OVER a map is
 * the `.over-map` surface (D47, app.css). The screens own only their interaction (taps, «near me», the scope fit).
 */
export const SRC = 'monasteries';
/** A-21(б): the lavras' own source — not clustered; its layers are added LAST (above clusters and every marker) */
export const SRC_LAVRA = 'lavras';
export const SOURCES = [SRC, SRC_LAVRA];
/** the layers a person taps (and the screens count) */
export const HOUSE_LAYERS = ['clusters', 'points', 'lavras'];
export const EMPTY: GeoJSON.FeatureCollection = { type: 'FeatureCollection', features: [] };
export type Houses = ReturnType<typeof splitLavras>;
/** the zoom a single place / an eparchy's fit stops at */
export const PLACE_ZOOM = 14; // the office and the Lavra beside it (≈ 350 m) both in a phone-wide view
export const SCOPE_MAX_ZOOM = 11;

export { hasWebGL } from './webgl';

// the 17 site icons (A-12), bundled: an offline map still shows every marker
const ICON_URLS = import.meta.glob('../../assets/mapicons/*.svg', { eager: true, query: '?url', import: 'default' }) as Record<string, string>;
export const ICON_PX = 36; // the site's 48 px pin drawn at 36 dp; rasterised at 2× for sharp edges
/** D51: a place that is not a house (the editorial office) — the pins' family, the brand colour */
export const PLACE_ICON = 'place_office';
const PLACE_URL = (import.meta.glob('../../assets/brand/place_office.svg', { eager: true, query: '?url', import: 'default' }) as Record<string, string>);
async function addMarkerImages(map: MLMap): Promise<void> {
  const urls = { ...ICON_URLS, ...PLACE_URL };
  await Promise.all([...MARKER_ICONS, PLACE_ICON].map(async (name) => {
    if (map.hasImage(name)) return;
    const url = Object.entries(urls).find(([k]) => k.endsWith(`/${name}.svg`))?.[1];
    if (!url) return;
    const img = new Image();
    img.src = url;
    await img.decode();
    const h = Math.round((ICON_PX * img.naturalHeight) / img.naturalWidth);
    const c = document.createElement('canvas');
    c.width = ICON_PX * 2; c.height = h * 2;
    c.getContext('2d')!.drawImage(img, 0, 0, c.width, c.height);
    if (!map.hasImage(name)) map.addImage(name, c.getContext('2d')!.getImageData(0, 0, c.width, c.height), { pixelRatio: 2 });
  }));
}

/** the bounding box of points with coordinates, or null */
export function boundsOf(pts: { lat: number | null; lon: number | null }[]): [[number, number], [number, number]] | null {
  const ok = pts.filter((r) => r.lat != null && r.lon != null);
  if (!ok.length) return null;
  const lons = ok.map((r) => r.lon!), lats = ok.map((r) => r.lat!);
  return [[Math.min(...lons), Math.min(...lats)], [Math.max(...lons), Math.max(...lats)]];
}

export type Edges = { top: number; right: number; bottom: number; left: number };
/** the largest cluster circle (clusters layer: 16 / 20 / 26 by count) + its 2 px ring */
export const CLUSTER_R = 28;
/** D53: what a mark DRAWS around its point - a pin stands on it (ICON_PX square above), a cluster is a circle around it - plus 8 dp of
 *  air: never given up, whatever the view's size */
/** the tallest pin: the lavras' (the site's 48 × 72) - drawn ICON_PX wide, so 1.5 × ICON_PX tall */
export const PIN_H_MAX = ICON_PX * 1.5;
export const MARK_MIN: Edges = { top: Math.max(PIN_H_MAX, CLUSTER_R) + 8, right: Math.max(ICON_PX / 2, CLUSTER_R) + 8, bottom: CLUSTER_R + 8, left: Math.max(ICON_PX / 2, CLUSTER_R) + 8 };
/** what a pin needs clear of the view's edges (D35): it stands on its point (anchor bottom) — beside it half a pin + a pin's width,
 *  above it its height + a pin's width, below it a pin's width (a comfortable margin; a small view shrinks it down to MARK_MIN) */
const PIN_CLEAR: Edges = { top: Math.max(ICON_PX * 2, PIN_H_MAX + 8), right: ICON_PX * 1.5, bottom: ICON_PX + 8, left: ICON_PX * 1.5 };
/**
 * D35 / D50 / D53: THE padding of a houses' fit — the main map (`?eparchy=`) and every mini-map. `chrome` = what the screen draws over
 * the map's edges (the scope chip, the zoom buttons, the mini-map's label); it is kept whole, and so is every mark's drawn size
 * (MARK_MIN). A small view shrinks only the clearance beyond that, so the houses keep at least a third of the view, each axis on its own.
 */
export function scopePadding(chrome: Edges, w: number, h: number): Edges {
  const room = (size: number, a: keyof Edges, b: keyof Edges) =>
    Math.max(0, (size * 2) / 3 - chrome[a] - chrome[b] - MARK_MIN[a] - MARK_MIN[b]) / (PIN_CLEAR[a] - MARK_MIN[a] + PIN_CLEAR[b] - MARK_MIN[b]);
  const kv = Math.min(1, room(h, 'top', 'bottom'));
  const kh = Math.min(1, room(w, 'left', 'right'));
  const e = (x: keyof Edges) => Math.round(chrome[x] + MARK_MIN[x] + (x === 'top' || x === 'bottom' ? kv : kh) * (PIN_CLEAR[x] - MARK_MIN[x]));
  return { top: e('top'), right: e('right'), bottom: e('bottom'), left: e('left') };
}
/** THE fit of a group of houses (see scopePadding); one house = SCOPE_MAX_ZOOM around it */
export function fitHouses(map: MLMap, b: LngLatBoundsLike, chrome: Edges): void {
  const c = map.getContainer();
  map.fitBounds(b, { padding: scopePadding(chrome, c.clientWidth, c.clientHeight), maxZoom: SCOPE_MAX_ZOOM, duration: 0 });
}

export interface InokMapOptions {
  container: HTMLElement;
  styleUrl: string | null;
  lang: Lang;
  /** false = a mini-map: no gestures, no controls; the whole map is one button of its screen */
  interactive?: boolean;
  bounds?: LngLatBoundsLike;
  center?: [number, number];
  zoom?: number;
  /** the style could not load (offline, provider down): the flat fallback is drawn (main) — a mini-map shows its stub */
  onFallback?: () => void;
  /** our sources and layers exist (again: a style switch drops them) — the screen adds its own layers here */
  onLayers?: (map: MLMap) => void;
}

/** One map of the app: created once per mount, removed with `remove()`. */
export class InokMap {
  readonly map: MLMap;
  private appliedStyle: string | null;
  private appliedLang: Lang;
  private fellBack = false;
  private waitingUrl: boolean;
  private lang: Lang;
  private houses: Houses | null = null;
  private place: GeoJSON.FeatureCollection = EMPTY;

  constructor(private o: InokMapOptions) {
    const interactive = o.interactive !== false;
    const opts: MapOptions = {
      container: o.container, interactive, attributionControl: interactive ? { compact: true } : false,
      dragRotate: false, pitchWithRotate: false, cooperativeGestures: false,
      ...(o.center ? { center: o.center, zoom: o.zoom ?? PLACE_ZOOM } : { bounds: o.bounds ?? UKRAINE_BOUNDS, fitBoundsOptions: { padding: 16 } }),
    };
    const map = new MLMap(opts);
    this.map = map;
    this.appliedStyle = o.styleUrl;
    this.appliedLang = o.lang;
    this.lang = o.lang;
    this.waitingUrl = !!o.styleUrl;
    map.setStyle(o.styleUrl ?? FALLBACK_STYLE, { transformStyle: basemapTransform(o.lang) }); // A-24: the one style transform
    if (interactive) {
      map.touchZoomRotate.disableRotation();
      map.addControl(new NavigationControl({ showCompass: false }), 'top-right');
      // D8: MapLibre opens the compact attribution once the first attributions arrive; collapse it to the ⓘ button the first time
      // it opens so the map keeps its area (a tap re-opens it; the data stays one tap away)
      const collapse = () => {
        const el = map.getContainer().querySelector('.maplibregl-ctrl-attrib.maplibregl-compact-show');
        if (el) { el.classList.remove('maplibregl-compact-show'); map.off('data', collapse); }
      };
      map.on('data', collapse);
    }
    map.on('error', (e: ErrorEvent & { sourceId?: string }) => {
      // a failed style download (offline, provider down) — not a missing tile — switches to the fallback style
      // (the URL style may come after the fallback was drawn — the config loads after the first screen, D22)
      if (!this.fellBack && (this.waitingUrl || !map.isStyleLoaded()) && !e.sourceId) {
        this.waitingUrl = false;
        this.fellBack = true;
        o.onFallback?.();
        map.setStyle(FALLBACK_STYLE, { transformStyle: basemapTransform(this.lang) });
      }
    });
    map.on('style.load', () => { this.waitingUrl = false; void this.addLayers(); });
    // D61: `data-drawn` = the map's own «drawn» signal for shots and tests (never a timer): '1' on MapLibre's `idle` (no camera movement,
    // every tile of the view loaded, no fade) once our layers are on the URL style; '0' as soon as it moves or loads data again
    // cloud_16 (CI: `idle` before the houses reached the worker = «drawn» with no pin): '1' only once the houses set are IN the sources
    // (the worker has cut them into tiles); `setHouses` resets it and asks for a frame, so `idle` comes again after the data
    const drawn = this.setDrawn;
    drawn('0');
    map.on('idle', () => { if (!this.waitingUrl && map.getSource(SRC) && this.housesIn()) drawn('1'); });
    map.on('movestart', () => drawn('0'));
    map.on('dataloading', () => drawn('0'));
    // evidence for the screens: how many lavra pins are DRAWN (never swallowed by a cluster), and which layer is on top
    let lastProbe = 0;
    map.on('render', () => { // not 'idle': while network tiles keep arriving the map is never idle
      if (!map.getLayer('lavras') || performance.now() - lastProbe < 300) return;
      lastProbe = performance.now();
      const el = map.getContainer();
      el.dataset.lavrasDrawn = String(map.queryRenderedFeatures({ layers: ['lavras'] }).length);
      const order = map.getStyle().layers.map((l) => l.id);
      el.dataset.lavrasAbove = String(order.indexOf('lavras') > Math.max(order.indexOf('clusters'), order.indexOf('points')));
    });
  }

  /** the style drops our sources: they come back on every style.load WITH the latest data */
  private async addLayers() {
    const map = this.map;
    if (map.getSource(SRC)) return;
    await addMarkerImages(map); // style.load drops images: registered again for every style (the fallback included)
    if (map.getSource(SRC)) return;
    map.addSource(SRC, { type: 'geojson', data: EMPTY, cluster: true, clusterRadius: 48, clusterMaxZoom: 11, promoteId: 'code' });
    map.addSource(SRC_LAVRA, { type: 'geojson', data: EMPTY, promoteId: 'code' });
    map.addSource('place', { type: 'geojson', data: EMPTY });
    map.addLayer({ id: 'clusters', type: 'circle', source: SRC, filter: ['has', 'point_count'],
      paint: { 'circle-color': '#0c6486', 'circle-opacity': 0.9, 'circle-stroke-color': '#fff', 'circle-stroke-width': 2,
        'circle-radius': ['step', ['get', 'point_count'], 16, 10, 20, 50, 26] } });
    // A-12: the site's own SVG per house (markerIcon); the selected one gets a halo under its pin
    map.addLayer({ id: 'points-selected', type: 'circle', source: SRC, filter: ['!', ['has', 'point_count']],
      paint: { 'circle-color': '#ffe082', 'circle-radius': 20, 'circle-translate': [0, -14],
        'circle-opacity': ['case', ['boolean', ['feature-state', 'selected'], false], 0.9, 0] } });
    map.addLayer({ id: 'points', type: 'symbol', source: SRC, filter: ['!', ['has', 'point_count']],
      layout: { 'icon-image': ['get', 'icon'], 'icon-anchor': 'bottom', 'icon-allow-overlap': true, 'icon-ignore-placement': false } });
    // the lavras above every marker and cluster (A-21(б)): the same pin and halo, a source and layers of their own, drawn last
    map.addLayer({ id: 'lavras-selected', type: 'circle', source: SRC_LAVRA,
      paint: { 'circle-color': '#ffe082', 'circle-radius': 20, 'circle-translate': [0, -14],
        'circle-opacity': ['case', ['boolean', ['feature-state', 'selected'], false], 0.9, 0] } });
    map.addLayer({ id: 'lavras', type: 'symbol', source: SRC_LAVRA,
      layout: { 'icon-image': ['get', 'icon'], 'icon-anchor': 'bottom', 'icon-allow-overlap': true, 'icon-ignore-placement': false } });
    // D53: every mark of ours is placed (allow-overlap) AND claims its box (ignore-placement false): the basemap's labels, placed after
    // the layers above them, give way - no town name under a pin or a cluster; the count's padding = the cluster circle
    // D35: a cluster's NUMBER is never hidden — its circle stays under the lavras (A-21), the count is drawn above every pin,
    // haloed in the cluster colour so it reads over a pin too
    map.addLayer({ id: 'cluster-count', type: 'symbol', source: SRC, filter: ['has', 'point_count'],
      layout: { 'text-field': ['get', 'point_count_abbreviated'], 'text-font': ['Noto Sans Bold'], 'text-size': 13, 'text-allow-overlap': true, 'text-ignore-placement': false, 'text-padding': 14 },
      paint: { 'text-color': '#fff', 'text-halo-color': '#0c6486', 'text-halo-width': 2 } });
    // a place that is not a house (the editorial office of «Контакти»): the brand colour, ringed white
    map.addLayer({ id: 'place', type: 'symbol', source: 'place',
      layout: { 'icon-image': PLACE_ICON, 'icon-anchor': 'bottom', 'icon-allow-overlap': true, 'icon-ignore-placement': false } });
    this.apply();
    this.o.onLayers?.(map);
  }

  private apply() {
    const map = this.map;
    if (!map.getSource(SRC)) return;
    if (this.houses) {
      (map.getSource(SRC) as GeoJSONSource).setData(this.houses.houses);
      (map.getSource(SRC_LAVRA) as GeoJSONSource).setData(this.houses.lavras);
    }
    (map.getSource('place') as GeoJSONSource).setData(this.place);
  }

  private setDrawn = (v: '0' | '1') => { this.map.getContainer().dataset.drawn = v; };
  /** the houses set are in the sources (none set, or none to draw = true) */
  private housesIn(): boolean {
    const h = this.houses;
    if (!h || h.houses.features.length + h.lavras.features.length === 0) return true;
    return this.map.querySourceFeatures(SRC).length + this.map.querySourceFeatures(SRC_LAVRA).length > 0;
  }

  /** the houses drawn (the screens' data: the DB's points, split by splitLavras) */
  setHouses(h: Houses | null) {
    this.houses = h;
    this.setDrawn('0');
    this.apply();
    this.map.triggerRepaint();
    if (h) {
      this.map.getContainer().dataset.markers = String(h.houses.features.length + h.lavras.features.length);
      this.map.getContainer().dataset.lavras = String(h.lavras.features.length);
    }
  }

  /** a place that is not a house ([lon, lat]) or none */
  setPlace(at: [number, number] | null) {
    this.place = at ? { type: 'FeatureCollection', features: [{ type: 'Feature', properties: {}, geometry: { type: 'Point', coordinates: at } }] } : EMPTY;
    this.apply();
  }

  /** the style URL arrives after the config loads (first start): switch once; A-24: the interface language changes the labels —
   *  the same style again through the transform (a full reload: our layers come back on style.load) */
  restyle(styleUrl: string | null, lang: Lang) {
    this.lang = lang;
    if (styleUrl && !this.fellBack && this.appliedStyle !== styleUrl) {
      this.appliedStyle = styleUrl;
      this.appliedLang = lang;
      this.waitingUrl = true;
      this.map.setStyle(styleUrl, { transformStyle: basemapTransform(lang) });
    } else if (this.appliedLang !== lang) {
      this.appliedLang = lang;
      this.map.setStyle(this.fellBack || !this.appliedStyle ? FALLBACK_STYLE : this.appliedStyle, { diff: false, transformStyle: basemapTransform(lang) });
    }
  }

  remove() { this.map.remove(); }
}
