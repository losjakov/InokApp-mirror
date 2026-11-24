import { Map as MLMap, NavigationControl, setWorkerUrl, type ErrorEvent, type GeoJSONSource, type LngLatBoundsLike, type MapOptions, type RequestTransformFunction, type StyleSpecification, type SymbolLayerSpecification } from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
// MapLibre 6 resolves its worker as `./maplibre-gl-worker.mjs` next to its own module URL; after Vite bundling that
// file is not next to the chunk → «Worker failed to load» → no rendering. Point it at OUR worker bundle (REF_gotchas):
// built by Vite to the engine floor, with the floor's polyfills (A-46, ./mapWorker.ts).
import mapWorkerUrl from './mapWorker.ts?worker&url';
import { MARKER_ICONS } from './markerIcon';
import { basemapTransform } from './basemap';
import { mapWorkerSource, noteMapError, tilesLoaded } from './mapRuntime';
export { tilesLoaded } from './mapRuntime';
import { COUNT_FONT, LOCAL_STYLE, UKRAINE_BOUNDS, splitLavras } from './geojson';
import countGlyphs from '@/assets/glyphs/count-0-255.pbf?url';
import type { Lang } from '@/i18n';
import { onNetChange, online } from '@/native/network';
import { isMapGlFailure, markMapGlFailed, onMapGlFailure } from '@/app/mapGlFailure';
import { reportQuietly } from '@/app/crash';
setWorkerUrl(mapWorkerUrl);
/**
 * cloud_37 (the iOS simulator, ios run 4: every map stayed empty - the style never loaded, no worker was ever fetched; MapLibre's style waits
 * for its worker): WKWebView starts no worker from the app's own scheme (`capacitor://`). On a page that is not http(s) the SAME worker code
 * is read once and started from a `blob:` URL of the page's own origin, BEFORE any map of this module exists (top-level await: the lazy map
 * chunks wait for it). Android (https://localhost) and the browser keep the file URL. `inok.mapWorker` = 'blob' takes the blob path anywhere
 * (the screens prove it in Chromium and WebKit). How it went: `window.__inokMapWorker`.
 */
if (typeof window !== 'undefined') { // a page (never the unit tests' node, which only imports the pure helpers of this module)
  const forcedWorker = (() => { try { return localStorage.getItem('inok.mapWorker'); } catch { return null; } })();
  const worker = await mapWorkerSource(mapWorkerUrl, location.protocol, forcedWorker, (u) => fetch(u).then((r) => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.text(); }));
  setWorkerUrl(worker.url);
  (window as unknown as { __inokMapWorker?: unknown }).__inokMapWorker = { how: worker.how, error: worker.error };
}

/** A-117 (1): how long the network style may take before the map says «without the base map» (a weak signal never answers) */
export const BASEMAP_WAIT_MS = 8000;
/** the cluster count's glyphs from the app itself, on every style (the worker fetches them: an absolute URL) */
export const countGlyphsRequest: RequestTransformFunction = (url, type) =>
  type === 'Glyphs' && decodeURIComponent(url).includes(`/${COUNT_FONT}/`) ? { url: new URL(countGlyphs, location.href).href } : undefined;

/** THE fetch of the network style: its JSON, or null when it fails or does not answer in BASEMAP_WAIT_MS (never waits longer) */
export async function fetchBasemap(url: string, wait = BASEMAP_WAIT_MS): Promise<StyleSpecification | null> {
  if (!(await online())) return null;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const late = new Promise<null>((ok) => { timer = setTimeout(() => ok(null), wait); });
  const got = fetch(url).then((r) => (r.ok ? (r.json() as Promise<StyleSpecification>) : null)).then((j) => (j && j.version === 8 && Array.isArray(j.layers) ? j : null), () => null);
  try {
    const style = await Promise.race([got, late]);
    return style && (await withLiveSprite(style, wait));
  } finally { clearTimeout(timer); }
}

/** cloud_38 (the tester's Android 8: a weak signal, only the lavras drawn): MapLibre holds EVERY picture of the map - ours too - until the
 *  style's sprite has answered; a sprite that never answers left every pin waiting. The sprite (its JSON and picture at this screen's
 *  density) is asked first within `wait`; what does not answer is dropped from the style (the base map loses its road shields and POI
 *  icons; our houses never wait on the network). An answered sprite is in the WebView's cache when MapLibre asks for it. */
export async function withLiveSprite(style: StyleSpecification, wait = BASEMAP_WAIT_MS): Promise<StyleSpecification> {
  const sprites = typeof style.sprite === 'string' ? [style.sprite] : Array.isArray(style.sprite) ? style.sprite.map((x) => x.url) : [];
  if (!sprites.length) return style;
  const hi = typeof devicePixelRatio === 'number' && devicePixelRatio > 1 ? '@2x' : '';
  const ask = (u: string) => fetch(u).then((r) => (r.ok ? r.arrayBuffer().then(() => true) : false), () => false);
  let timer: ReturnType<typeof setTimeout> | undefined;
  const late = new Promise<boolean>((ok) => { timer = setTimeout(() => ok(false), wait); });
  const all = Promise.all(sprites.flatMap((u) => [ask(`${u}${hi}.json`), ask(`${u}${hi}.png`)])).then((r) => r.every(Boolean));
  try {
    if (await Promise.race([all, late])) return style;
  } finally { clearTimeout(timer); }
  console.info('InokMap: the base map sprite did not answer - the style is drawn without it');
  const rest: StyleSpecification = { ...style };
  delete rest.sprite;
  return rest;
}

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
/** A-133 «Я тут був»: the badge on a marked house's pin - a green disc, a WHITE ring (seen on a light and a dark basemap) and a white
 *  check (a SHAPE, never colour alone); drawn on a canvas, no file */
export const VISITED_ICON = 'visited_badge';
export const VISITED_GREEN = '#1b7a3a';
function addVisitedBadge(map: MLMap): void {
  if (map.hasImage(VISITED_ICON)) return;
  try {
    const px = 2, d = 20 * px, c = document.createElement('canvas');
    c.width = d; c.height = d;
    const g = c.getContext('2d')!;
    g.beginPath(); g.arc(d / 2, d / 2, d / 2 - px, 0, Math.PI * 2); g.fillStyle = VISITED_GREEN; g.fill();
    g.lineWidth = 2 * px; g.strokeStyle = '#fff'; g.stroke();
    g.beginPath(); g.moveTo(5.5 * px, 10.5 * px); g.lineTo(8.5 * px, 13.5 * px); g.lineTo(14.5 * px, 7 * px);
    g.lineWidth = 2.4 * px; g.lineCap = 'round'; g.lineJoin = 'round'; g.stroke();
    map.addImage(VISITED_ICON, g.getImageData(0, 0, d, d), { pixelRatio: px });
  } catch (e) { noteMapError({ error: { message: `visited badge: ${String(e)}` } }); }
}
async function addMarkerImages(map: MLMap): Promise<void> {
  addVisitedBadge(map);
  const urls = { ...ICON_URLS, ...PLACE_URL };
  await Promise.all([...MARKER_ICONS, PLACE_ICON].map(async (name) => {
    if (map.hasImage(name)) return;
    const url = Object.entries(urls).find(([k]) => k.endsWith(`/${name}.svg`))?.[1];
    if (!url) return;
    // cloud_37 (the iOS 16.4 simulator: «The object is in an invalid state» from drawImage = the crash screen): the picture is awaited by its
    // `load` event (Safari may settle decode() of an SVG before it has a size), a picture without a size is skipped, and one icon that
    // fails never takes the map (or the app) with it - the house's other marks still draw
    try {
      const img = new Image();
      await new Promise<void>((ok, ko) => { img.onload = () => ok(); img.onerror = () => ko(new Error(`icon ${name} did not load`)); img.src = url; });
      if (!img.naturalWidth || !img.naturalHeight) throw new Error(`icon ${name} has no size`);
      const h = Math.round((ICON_PX * img.naturalHeight) / img.naturalWidth);
      const c = document.createElement('canvas');
      c.width = ICON_PX * 2; c.height = h * 2;
      c.getContext('2d')!.drawImage(img, 0, 0, c.width, c.height);
      if (!map.hasImage(name)) map.addImage(name, c.getContext('2d')!.getImageData(0, 0, c.width, c.height), { pixelRatio: 2 });
    } catch (e) {
      noteMapError({ error: { message: String(e) } });
    }
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
  /** the network style could not be fetched (offline, a weak signal, provider down): the map stays on LOCAL_STYLE (main) — a mini-map shows its stub */
  onFallback?: () => void;
  /** A-117 (1): the base map's tiles stopped coming after its style loaded (the main map's note) */
  onTilesLost?: () => void;
  /** the network style is drawn (again): the note leaves */
  onBasemap?: () => void;
  /** our sources and layers exist (again: a style switch drops them) — the screen adds its own layers here */
  onLayers?: (map: MLMap) => void;
  /** A-182: the device's GL could not draw the map (the map is already removed) - the screen shows its fallback */
  onGlFail?: () => void;
}

/** MapLibre's current Style object (internal): its identity tells a replaced style apart; `_loaded` = what addSource checks */
const styleOf = (map: MLMap) => (map as unknown as { style?: { _loaded?: boolean } }).style;

/** One map of the app: created once per mount (`InokMap.open`), removed with `remove()`. */
export class InokMap {
  /** A-182: THE way to create a map - a GL failure while MapLibre builds it (iOS 15 «Program failed to link») = no map, the screen's
   *  fallback (`onGlFail`), the flag for the next opening and one auto report; never the stop screen. Any other error is thrown as before. */
  static open(o: InokMapOptions): InokMap | null {
    try { return new InokMap(o); } catch (e) {
      if (!isMapGlFailure(e)) throw e;
      InokMap.failed(e, o);
      return null;
    }
  }
  private static failed(e: unknown, o: InokMapOptions) { reportQuietly(e, 'error', true); void markMapGlFailed(); o.onGlFail?.(); }
  private unroute: () => void = () => undefined;
  readonly map: MLMap;
  private appliedStyle: string | null;
  private appliedLang: Lang;
  private fellBack = false;
  private tilesLost = false;
  /** base map tiles that FAILED since the base map's style.load (0 = they were only slow: the note leaves once they come) */
  private tileErrors = 0;
  private tileTimer: ReturnType<typeof setTimeout> | undefined;
  private waitingUrl: boolean;
  /** the network style's JSON once fetched (a language change re-applies it without the network) */
  private basemap: StyleSpecification | null = null;
  private asked = 0;
  private removed = false;
  private stopNet: () => void;
  private lang: Lang;
  private houses: Houses | null = null;
  /** A-133: the marked houses (the badge layers read the feature's `visited`) */
  private visited: ReadonlySet<number> = new Set();
  private place: GeoJSON.FeatureCollection = EMPTY;

  constructor(private o: InokMapOptions) {
    const interactive = o.interactive !== false;
    const opts: MapOptions = {
      container: o.container, interactive, attributionControl: interactive ? { compact: true } : false, transformRequest: countGlyphsRequest,
      dragRotate: false, pitchWithRotate: false, cooperativeGestures: false,
      ...(o.center ? { center: o.center, zoom: o.zoom ?? PLACE_ZOOM } : { bounds: o.bounds ?? UKRAINE_BOUNDS, fitBoundsOptions: { padding: 16 } }),
    };
    const map = new MLMap(opts);
    this.map = map;
    // A-182: while this map exists, a GL failure thrown later (a frame's shader link, `window.error` in the map chunk) is routed to `fail`
    this.unroute = onMapGlFailure(() => this.fail());
    // cloud_38 D16 - THE cause of the Play map frames drawn in a ~400 x 300 corner: a map resized while its page is hidden (0 x 0) takes
    // MapLibre's 400 x 300 fallback, and the emulator's WebView did not resize it back when shown. A hidden map is never resized (MapLibre's
    // own observer, the screens' observers and the language restyle all come here); shown again, the observers size it to its box.
    const resize = map.resize.bind(map);
    map.resize = ((...a: Parameters<MLMap['resize']>) => {
      const c = map.getContainer();
      return c.clientWidth > 0 && c.clientHeight > 0 ? resize(...a) : map;
    }) as MLMap['resize'];
    this.appliedStyle = o.styleUrl;
    this.appliedLang = o.lang;
    this.lang = o.lang;
    this.waitingUrl = !!o.styleUrl;
    // A-117 (1), cloud_36 (JOURNAL «A1»): EVERY map starts on the local style - the houses are drawn from the DB at once; the network
    // style is fetched beside it and replaces it only once it is HERE (a URL given to MapLibre that never answers left a white map)
    map.setStyle(LOCAL_STYLE, { transformStyle: basemapTransform(o.lang) }); // A-24: the one style transform
    if (o.styleUrl) void this.loadBasemap(o.styleUrl);
    // the network came back: a style that failed is asked again, lost tiles are asked again
    this.stopNet = onNetChange(() => {
      if (this.fellBack && this.appliedStyle) void this.loadBasemap(this.appliedStyle);
      // cloud_38: the reload after a network change asks the style AND its sprite again within the wait (a weak signal never hangs our pins)
      else if (this.tilesLost && this.basemap && this.appliedStyle) { this.tilesLost = false; void this.loadBasemap(this.appliedStyle); }
    });
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
      if (isMapGlFailure(e.error, false)) { reportQuietly(e.error, 'error', true); this.fail(); return; } // A-182: MapLibre's own error event
      noteMapError(e);
      // a base map tile that failed (offline after the style came): the note; our own sources are GeoJSON, never fetched
      if (e.sourceId && map.getSource(e.sourceId)?.type !== 'geojson') { this.tileErrors++; this.loseTiles(); }
    });
    map.on('style.load', () => {
      console.info(`InokMap: style.load ${this.basemap ? 'network' : 'local'}`); // cloud_37: the map's life in the device log (iOS)
      clearTimeout(this.tileTimer);
      if (this.basemap) {
        this.tileErrors = 0;
        if (!this.tilesLost) o.onBasemap?.();
        // tiles that never answer (a weak signal) send no error: not all here in BASEMAP_WAIT_MS = the note too
        this.tileTimer = setTimeout(() => { if (!this.removed && !tilesLoaded(map)) this.loseTiles(); }, BASEMAP_WAIT_MS);
      }
      void this.addLayers();
    });
    // cloud_38: a lost GL context = not drawn (the shots never trust a stale `data-drawn`); MapLibre restores the map itself. (A re-applied
    // style on restore - tried for D16 - looped «lost / restored» on the iOS 16.4 simulator, ios run 1: removed, JOURNAL D11)
    map.on('webglcontextlost', () => { console.info('InokMap: GL context lost'); this.setDrawn('0'); });
    // ios run 2 (16.4 simulator): MapLibre's restore rebuilds the style from its snapshot without a style.load - our layers (dropped with the
    // old style) are added again here when missing (the D15 guard had made the pending addLayers give up on the replaced style)
    map.on('webglcontextrestored', () => {
      console.info('InokMap: GL context restored');
      if (this.removed) return;
      if (!map.getSource(SRC) && styleOf(map)?._loaded) void this.addLayers();
      map.triggerRepaint();
    });
    // the slow tiles came after all (none failed): the note leaves
    map.on('idle', () => { if (this.tilesLost && this.basemap && this.tileErrors === 0) { this.tilesLost = false; o.onBasemap?.(); } });
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
      const order = (map.getStyle()?.layers ?? []).map((l) => l.id); // undefined between two styles (the network one replacing the local)
      el.dataset.lavrasAbove = String(order.indexOf('lavras') > Math.max(order.indexOf('clusters'), order.indexOf('points')));
    });
  }

  /** the style drops our sources: they come back on every style.load WITH the latest data */
  private async addLayers() {
    const map = this.map;
    if (map.getSource(SRC)) return;
    // cloud_38 D15 (iOS: «Style is not done loading.» = the crash screen): the style these layers are for is captured BEFORE the pictures'
    // await; if another style replaced it meanwhile (the network style over the local one), this call gives up - that style's own
    // style.load adds the layers. Anything MapLibre still throws is noted, never an unhandled rejection (= the app's crash screen).
    const style = styleOf(map);
    try {
      await addMarkerImages(map); // style.load drops images: registered again for every style (the fallback included)
      // `_loaded` = the style's own «done loading» (what addSource checks); isStyleLoaded() also waits for tiles - too strict here
      if (styleOf(map) !== style || !style?._loaded || map.getSource(SRC)) return;
      this.addOurLayers();
    } catch (e) {
      noteMapError({ error: { message: `addLayers: ${String(e)}` } });
    }
  }

  private addOurLayers() {
    const map = this.map;
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
    // A-133: the «Я тут був» badge at the pin's upper right (never claims space: the pin claims it)
    const badge: SymbolLayerSpecification['layout'] = { 'icon-image': VISITED_ICON, 'icon-anchor': 'center', 'icon-offset': [11, -40], 'icon-allow-overlap': true, 'icon-ignore-placement': true };
    map.addLayer({ id: 'points-visited', type: 'symbol', source: SRC, filter: ['all', ['!', ['has', 'point_count']], ['==', ['get', 'visited'], 1]], layout: badge });
    // the lavras above every marker and cluster (A-21(б)): the same pin and halo, a source and layers of their own, drawn last
    map.addLayer({ id: 'lavras-selected', type: 'circle', source: SRC_LAVRA,
      paint: { 'circle-color': '#ffe082', 'circle-radius': 20, 'circle-translate': [0, -14],
        'circle-opacity': ['case', ['boolean', ['feature-state', 'selected'], false], 0.9, 0] } });
    map.addLayer({ id: 'lavras', type: 'symbol', source: SRC_LAVRA,
      layout: { 'icon-image': ['get', 'icon'], 'icon-anchor': 'bottom', 'icon-allow-overlap': true, 'icon-ignore-placement': false } });
    map.addLayer({ id: 'lavras-visited', type: 'symbol', source: SRC_LAVRA, filter: ['==', ['get', 'visited'], 1], layout: badge });
    // D53: every mark of ours is placed (allow-overlap) AND claims its box (ignore-placement false): the basemap's labels, placed after
    // the layers above them, give way - no town name under a pin or a cluster; the count's padding = the cluster circle
    // D35: a cluster's NUMBER is never hidden — its circle stays under the lavras (A-21), the count is drawn above every pin,
    // haloed in the cluster colour so it reads over a pin too
    map.addLayer({ id: 'cluster-count', type: 'symbol', source: SRC, filter: ['has', 'point_count'],
      layout: { 'text-field': ['get', 'point_count_abbreviated'], 'text-font': [COUNT_FONT], 'text-size': 13, 'text-allow-overlap': true, 'text-ignore-placement': false, 'text-padding': 14 },
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
      const mark = (fc: GeoJSON.FeatureCollection): GeoJSON.FeatureCollection => (this.visited.size === 0 ? fc : { ...fc, features: fc.features.map((f) =>
        (this.visited.has(Number(f.properties?.code)) ? { ...f, properties: { ...f.properties, visited: 1 } } : f)) });
      (map.getSource(SRC) as GeoJSONSource).setData(mark(this.houses.houses));
      (map.getSource(SRC_LAVRA) as GeoJSONSource).setData(mark(this.houses.lavras));
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

  /** A-133: the houses marked «Я тут був» - a badge on their pins */
  setVisited(v: ReadonlySet<number>) {
    this.visited = v;
    this.apply();
    this.map.triggerRepaint();
  }

  /** a place that is not a house ([lon, lat]) or none */
  setPlace(at: [number, number] | null) {
    this.place = at ? { type: 'FeatureCollection', features: [{ type: 'Feature', properties: {}, geometry: { type: 'Point', coordinates: at } }] } : EMPTY;
    this.apply();
  }

  private loseTiles() { if (!this.tilesLost) { this.tilesLost = true; this.o.onTilesLost?.(); } }

  /** the network style: fetched (BASEMAP_WAIT_MS at most), then drawn; failed = stay on the local style + `onFallback` (the latest ask wins) */
  private async loadBasemap(url: string) {
    const ask = ++this.asked;
    this.waitingUrl = true;
    this.setDrawn('0');
    const style = await fetchBasemap(url);
    if (ask !== this.asked || this.removed) return;
    this.waitingUrl = false;
    if (!style) {
      if (!this.fellBack) { this.fellBack = true; this.o.onFallback?.(); }
      this.map.triggerRepaint(); // `idle` again: the map on the local style is «drawn» now
      return;
    }
    this.fellBack = false;
    this.tilesLost = false;
    this.basemap = style;
    this.appliedLang = this.lang;
    this.map.setStyle(style, { diff: false, transformStyle: basemapTransform(this.lang) });
  }

  /** the style URL arrives after the config loads (first start); A-24: the interface language changes the labels — the same style again
   *  through the transform (a full reload: our layers come back on style.load) */
  restyle(styleUrl: string | null, lang: Lang) {
    this.lang = lang;
    if (styleUrl && this.appliedStyle !== styleUrl) {
      this.appliedStyle = styleUrl;
      this.basemap = null;
      void this.loadBasemap(styleUrl);
    } else if (this.appliedLang !== lang) {
      this.appliedLang = lang;
      this.map.setStyle(this.basemap ?? LOCAL_STYLE, { diff: false, transformStyle: basemapTransform(lang) });
    }
  }

  remove() {
    if (this.removed) return;
    this.removed = true; clearTimeout(this.tileTimer); this.stopNet(); this.unroute();
    try { this.map.remove(); } catch (e) { noteMapError({ error: { message: `remove: ${String(e)}` } }); } // a map whose GL died
  }
  /** A-182: THE one fall-back of a map whose GL failed: removed, the flag kept (next opening = the list), the screen told */
  fail() {
    if (this.removed) return;
    this.remove();
    void markMapGlFailed();
    this.o.onGlFail?.();
  }
}
