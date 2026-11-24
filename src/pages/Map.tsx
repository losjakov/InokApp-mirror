import { IonButton, IonContent, IonIcon, IonLabel, IonList, IonNote, IonPage, useIonViewDidEnter } from '@ionic/react';
import { ChipButton } from '@/components/ChipButton';
import { Busy } from '@/components/Busy';
import { closeCircle, closeOutline, locateOutline, navigateOutline } from 'ionicons/icons';
import type { Map as MLMap, GeoJSONSource, MapGeoJSONFeature, MapLayerMouseEvent } from 'maplibre-gl';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { PageHeader } from '@/components/PageHeader';
import { OPENED_FROM } from '@/app/nav';
import { MonasteryRow } from '@/components/MonasteryRow';
import { ParentLine } from '@/components/ParentLine';
import { MetaLine } from '@/components/MetaLine';
import { DirectionsSheet } from '@/components/DirectionsSheet';
import { RADII_KM, parseAt, nearby, radiusBounds, radiusPolygon, splitLavras, LAVRA_TYPE } from '@/data/map/geojson';
import { EMPTY, HOUSE_LAYERS, InokMap, PLACE_ZOOM, SOURCES, SRC, boundsOf, fitHouses, hasWebGL } from '@/data/map/inokMap';
import { getMonastery, listByCodes, listMapPoints } from '@/data/repo/monasteries';
import { eparchyTitle, getEparchy } from '@/data/repo/eparchies';
import { field, rowParts, type MapPoint, type MonasteryListRow as Row, type MonasteryRow as CardRow } from '@/data/repo/types';
import { distanceKm, formatKm } from '@/data/search/geo';
import { currentPosition, type Position } from '@/native/geolocation';
import { useApp } from '@/state/AppContext';
import { tCount } from '@/i18n';
import { sideRow } from '@/components/sideRow';
import { MapFallback } from '@/components/MapFallback';
import { clearMapGlFailed, mapGlFailed } from '@/app/mapGlFailure';
import { AppleMapPane } from '@/components/AppleMapPane';
import { appleMapPossible, mapMode } from '@/native/appleMap';
import { online, onNetChange } from '@/native/network';

/** D35: what the main map draws over its edges in a scope — the chip on top (8 + 40 + 8), the zoom buttons at the right; the pins' clearance is THE rule (fitHouses) */
const SCOPE_CHROME = { top: 56, right: 6, bottom: 4, left: 2 };
/** D58(в): the same without the scope chip (the whole map) */
const NO_SCOPE_CHROME = { ...SCOPE_CHROME, top: 0 };

/**
 * Stage 2 (spec §4): MapLibre with the style URL from config (OpenFreeMap), markers from SQLite as one clustered GeoJSON
 * source, tap → marker card, «near me» with a radius ring + a list sorted by distance, directions intents.
 * Offline (A-117 (1)): the map starts on the local style with the houses from the DB; the network style replaces it once fetched; failed or
 * its tiles lost → a note that says so (the houses stay). No WebGL → message + list.
 */
export function MapPage() {
  const { db, t, lang, config, dict, visited } = useApp();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const box = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MLMap | null>(null);
  const ctl = useRef<InokMap | null>(null);
  const [rows, setRows] = useState<MapPoint[] | null>(null); // PLAN item 6: the markers' points, not list rows
  const [ready, setReady] = useState(false);
  // every (re)build of the screen's layers — the first style and a later config style (`restyle`) both start with EMPTY sources
  const [layersGen, setLayersGen] = useState(0);
  const [offline, setOffline] = useState(false);
  const [noWebgl] = useState(() => !hasWebGL()); // A-182 (3): the pre-flight - no context at all = the list without a try
  // A-182 (2): a GL failure on this app + OS version = the list at once (no crash loop); 'wait' while the flag is read
  const [gl, setGl] = useState<'wait' | 'try' | 'failed'>('wait');
  useEffect(() => { let on = true; if (!noWebgl) void mapGlFailed().then((f) => { if (on) setGl(f ? 'failed' : 'try'); }); return () => { on = false; }; }, [noWebgl]);
  const retryMap = useCallback(() => { void clearMapGlFailed().then(() => setGl('try')); }, []);
  // A-183: on an iPhone the tab then shows Apple's own map; its failure (or Android) = A-182's list
  const [appleFailed, setAppleFailed] = useState(false);
  const mode = mapMode({ glOk: !noWebgl && gl !== 'failed', ios: appleMapPossible(), appleFailed });
  const [netOff, setNetOff] = useState(false); // A-183 (4): Apple's tiles need the network - the note says so, the pins stay
  useEffect(() => { if (mode !== 'apple') return; const read = () => void online().then((o) => setNetOff(!o)); read(); return onNetChange(read); }, [mode]);
  const [selected, setSelected] = useState<number | null>(params.get('code') ? Number(params.get('code')) : null);
  const [pos, setPos] = useState<Position | null>(null);
  const [locating, setLocating] = useState(false);
  const [posError, setPosError] = useState(false);
  const [radius, setRadius] = useState<number>(25);
  const [nearOn, setNearOn] = useState(false);
  const [dirs, setDirs] = useState(false);
  const [placeOpen, setPlaceOpen] = useState(false); // D51: the office's name on a tap of its pin
  // D58(в): opened with nothing to show = the whole map framed by its houses, until a house is picked or «near me» asked
  const [whole, setWhole] = useState(() => !params.get('at') && !params.get('code') && params.get('near') !== '1');

  // PLAN 7: `/map?eparchy=<id>` = the houses of one eparchy (its page's «Обителі на карті»), the view fitted to them; a chip clears it
  const eparchyId = params.get('eparchy') ? Number(params.get('eparchy')) : null;
  const [scopeOf, setScopeOf] = useState<{ id: number; name: string } | null>(null);
  const scope = eparchyId != null && scopeOf?.id === eparchyId ? scopeOf.name : null;
  useEffect(() => {
    listMapPoints(db, eparchyId != null ? { eparchy_id: eparchyId } : {}).then(setRows);
    if (eparchyId != null) void getEparchy(db, eparchyId).then((e) => setScopeOf(e ? { id: eparchyId, name: eparchyTitle(e, lang, dict) } : null));
  }, [db, lang, dict, eparchyId]);

  const fc = useMemo(() => (rows ? splitLavras(rows, lang) : null), [rows, lang]);
  const visitedShown = useMemo(() => (rows ?? []).filter((r) => visited.has(r.code)).length, [rows, visited]);
  const at = parseAt(params.get('at'));
  const atKey = at?.join(',') ?? null;
  const styleUrl = config?.map_style_url ?? null;

  // the map is created once per mount (the ONE set-up: inokMap.ts); style failures fall back to the flat style (markers still render)
  useEffect(() => {
    if (gl !== 'try' || !box.current || mapRef.current) return;
    const c = InokMap.open({ container: box.current, styleUrl, lang, center: at ?? undefined, zoom: at ? PLACE_ZOOM : undefined, onFallback: () => setOffline(true), onTilesLost: () => setOffline(true), onBasemap: () => setOffline(false),
      onGlFail: () => { mapRef.current = null; ctl.current = null; setReady(false); setGl('failed'); }, // A-182: the list instead
      onLayers: (m) => { // the screen's own layers: the «near me» ring under the houses, the person's dot above them
        m.addSource('me', { type: 'geojson', data: EMPTY });
        m.addSource('radius', { type: 'geojson', data: EMPTY });
        m.addLayer({ id: 'radius-fill', type: 'fill', source: 'radius', paint: { 'fill-color': '#0c6486', 'fill-opacity': 0.08 } }, 'clusters');
        m.addLayer({ id: 'radius-line', type: 'line', source: 'radius', paint: { 'line-color': '#0c6486', 'line-width': 1.5, 'line-dasharray': [2, 2] } }, 'clusters');
        m.addLayer({ id: 'me', type: 'circle', source: 'me', paint: { 'circle-color': '#1e88e5', 'circle-radius': 7, 'circle-stroke-color': '#fff', 'circle-stroke-width': 3 } });
        setReady(true);
        setLayersGen((g) => g + 1);
      } });
    if (!c) return;
    const map = c.map;
    ctl.current = c;
    mapRef.current = map;
    // browser tests click markers by projected coordinates; the emulator's store frame 03 fits the three lavras (A-78 4, scripts/store_checks.mjs)
    (window as unknown as { __inokMap?: MLMap }).__inokMap = map;
    map.on('click', 'clusters', (e: MapLayerMouseEvent) => {
      const f = e.features?.[0];
      if (!f) return;
      const src = map.getSource(SRC) as GeoJSONSource | undefined;
      if (!src) return; // a tap during a style swap (see «near me» below)
      src.getClusterExpansionZoom(f.properties.cluster_id as number).then((z) => {
        map.easeTo({ center: (f.geometry as GeoJSON.Point).coordinates as [number, number], zoom: z + 0.5 });
      });
    });
    const pick = (e: MapLayerMouseEvent) => {
      const f = e.features?.[0] as MapGeoJSONFeature | undefined;
      if (f) { setSelected(Number(f.properties.code)); setWhole(false); }
    };
    map.on('click', 'points', pick);
    map.on('click', 'place', () => { setSelected(null); setPlaceOpen(true); });
    map.on('mouseenter', 'place', () => { map.getCanvas().style.cursor = 'pointer'; });
    map.on('mouseleave', 'place', () => { map.getCanvas().style.cursor = ''; });
    map.on('click', 'lavras', pick);
    for (const l of HOUSE_LAYERS) {
      map.on('mouseenter', l, () => { map.getCanvas().style.cursor = 'pointer'; });
      map.on('mouseleave', l, () => { map.getCanvas().style.cursor = ''; });
    }
    const ro = new ResizeObserver(() => map.resize());
    ro.observe(box.current);
    return () => {
      ro.disconnect();
      c.remove();
      mapRef.current = null;
      ctl.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gl]);

  // the style URL arrives after the config loads; the interface language changes the labels (A-24) — the module decides
  useEffect(() => { ctl.current?.restyle(styleUrl, lang); }, [styleUrl, lang]);

  useIonViewDidEnter(() => { mapRef.current?.resize(); });

  // markers follow the DB rows and the language
  useEffect(() => { if (ready) ctl.current?.setHouses(fc); }, [fc, ready]);
  // A-133: the «Я тут був» badges follow the marks
  useEffect(() => { if (ready) ctl.current?.setVisited(visited); }, [visited, ready]);
  // «Контакти» → its map: the place drawn where the mini-map showed it
  useEffect(() => {
    if (ready) ctl.current?.setPlace(atKey ? (atKey.split(',').map(Number) as [number, number]) : null);
  }, [atKey, ready]);

  // the selected marker: highlighted + centred (deep link /map?code=…)
  // the marker card: the selected house's own row (one read), never a search in the whole list
  const [selFull, setSelFull] = useState<CardRow | null>(null);
  useEffect(() => { let on = true; if (selected != null) void getMonastery(db, selected).then((r) => on && setSelFull(r)); return () => { on = false; }; }, [db, selected]);
  const selRow = selected != null && selFull?.code === selected ? selFull : null;
  const placeOf = (r: CardRow) => { const p = rowParts(r, lang, dict); return [p.town, p.oblast].filter(Boolean).join(', '); }; // A-140 (3)
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    if (selRow && selRow.lat != null && selRow.lon != null) {
      const source = SOURCES[selRow.object_type === LAVRA_TYPE ? 1 : 0];
      map.setFeatureState({ source, id: selRow.code }, { selected: true });
      if (map.getZoom() < 9) map.easeTo({ center: [selRow.lon, selRow.lat], zoom: 12, duration: 600 });
      // the page may be unmounting: `map.remove()` (the first effect's cleanup, run before this one) nulls the style → TypeError, and an
      // error in an unmount cleanup takes React's whole tree down (emulator run 41342920913: every tab dead after eparchy → map → Back)
      return () => { if (mapRef.current === map && map.style) map.setFeatureState({ source, id: selRow.code }, { selected: false }); };
    }
  }, [selRow, ready]);
  useEffect(() => {
    if (selected == null && params.get('code')) setParams((p) => { p.delete('code'); return p; }, { replace: true, state: OPENED_FROM });
  }, [selected, params, setParams]);
  // D35: the eparchy's houses fill the view — clear of the scope chip and the pins' height (top), the zoom buttons (right); one house:
  // zoom 11 around it. D58(в): the map opened with nothing to show (no place, house, «near me») frames ALL the houses by the same fit -
  // Ukraine in the frame of its houses, every mark whole, not a fixed box that a tall screen pads with Europe.
  // Re-fitted when the view's size settles (page transition, rotation) until the person moves the map, picks a house or asks «near me».
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready || !rows || (eparchyId == null && !whole)) return;
    const b = boundsOf(rows);
    if (!b) return;
    const chrome = eparchyId != null ? SCOPE_CHROME : NO_SCOPE_CHROME;
    const fit = () => fitHouses(map, b, chrome);
    fit();
    const stop = (e: { originalEvent?: unknown }) => { if (e.originalEvent) { map.off('resize', fit); map.off('movestart', stop); } };
    map.on('resize', fit);
    map.on('movestart', stop);
    return () => { map.off('resize', fit); map.off('movestart', stop); };
  }, [ready, rows, eparchyId, whole]);

  const locate = useCallback(async () => {
    setLocating(true);
    setPosError(false);
    setWhole(false);
    try {
      const p = await currentPosition();
      setPos(p);
      setNearOn(true);
    } catch {
      setPosError(true);
    } finally {
      setLocating(false);
    }
  }, []);

  // `?near=1` (MAP_NEAR, «Головна → Поруч → Всі»): the locate button's own start, once; the address drops the flag (Back / a return do not repeat it)
  useEffect(() => {
    if (params.get('near') !== '1') return;
    setParams((p) => { p.delete('near'); return p; }, { replace: true, state: OPENED_FROM });
    void Promise.resolve().then(locate); // after this render (React Compiler: no setState in the effect's body)
  }, [params, setParams, locate]);

  // «near me»: the user's dot, the radius ring, the view fitted to the ring
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    const me = map.getSource('me') as GeoJSONSource | undefined;
    const ring = map.getSource('radius') as GeoJSONSource | undefined;
    // cloud_37 (the iOS simulator: R-TypeError «t.setData»): between a style swap (the local style -> the network one, A-117) and our layers'
    // return the screen's sources do not exist; nothing to draw now - `onLayers` bumps layersGen and this runs again on the new style
    if (!me || !ring) return;
    if (pos && nearOn) {
      me.setData({ type: 'FeatureCollection', features: [{ type: 'Feature', properties: {}, geometry: { type: 'Point', coordinates: [pos.lon, pos.lat] } }] });
      ring.setData(radiusPolygon(pos, radius));
      map.fitBounds(radiusBounds(pos, radius), { padding: 24, duration: 600 });
    } else {
      me.setData(EMPTY);
      ring.setData(EMPTY);
    }
  }, [pos, nearOn, radius, ready, layersGen]); // layersGen: «near me» switched on before the config style arrived (MAP_NEAR) is drawn again on it

  // «near me»: the ring is decided on the points (one rule, `nearby`); only the houses inside it are read as list rows
  const nearPts = useMemo(() => (rows && pos && nearOn ? nearby(rows, pos, radius) : null), [rows, pos, nearOn, radius]);
  const [nearRows, setNearRows] = useState<{ key: MapPoint[]; rows: Row[] } | null>(null);
  useEffect(() => {
    let on = true;
    if (nearPts) void listByCodes(db, nearPts.map((p) => p.code)).then((rs) => on && setNearRows({ key: nearPts,
      rows: rs.map((r, i) => ({ ...r, distance_km: nearPts[i]?.code === r.code ? nearPts[i].distance_km : undefined })) }));
    return () => { on = false; };
  }, [db, nearPts]);
  const near = nearPts ? (nearRows?.key === nearPts ? nearRows.rows : nearRows?.rows ?? []) : null;
  const selDist = selRow && pos && selRow.lat != null && selRow.lon != null ? distanceKm(pos.lat, pos.lon, selRow.lat, selRow.lon) : null;

  return (
    <IonPage>
      <PageHeader title={t('map.title')} end={
        <IonButton onClick={() => (nearOn ? setNearOn(false) : void locate())} aria-label={t('map.near_me')} data-testid="near-me" fill={nearOn ? 'solid' : 'clear'} color={nearOn ? 'secondary' : undefined}>
          <IonIcon slot="icon-only" icon={locateOutline} aria-hidden="true" />
        </IonButton>} />
      {mode === 'list' ? (
        <IonContent><MapFallback pos={nearOn ? pos : null} eparchyId={eparchyId} onRetry={noWebgl ? undefined : retryMap} /></IonContent>
      ) : mode === 'apple' ? (
        <IonContent scrollY={false}>
          <div className="map-split map-split--apple">
            {netOff && <p className="map-fallback__note" role="status" data-testid="map-offline">{t('map.offline')}</p>}
            <div className="map-pane"><AppleMapPane rows={rows} center={at ? { lat: at[1], lon: at[0] } : undefined} onFail={() => setAppleFailed(true)} /></div>
          </div>
        </IonContent>
      ) : (
      <IonContent scrollY={false}>
        <div className={`map-split${near ? ' map-split--near' : ''}`}>
          <div className="map-pane">
            <div ref={box} className="map-canvas" data-testid="map" data-ready={ready ? '1' : '0'} aria-label={t('map.title')} role="application" />
            {scope && (
              <div className="map-scope">
                <ChipButton color="primary" className="over-map" onClick={() => setParams((p) => { p.delete('eparchy'); return p; }, { replace: true, state: OPENED_FROM })} aria-label={`${t('map.scope_clear')}: ${scope}`} data-testid="map-scope">
                  <IonLabel>{scope}</IonLabel><IonIcon icon={closeCircle} aria-hidden="true" />
                </ChipButton>
              </div>
            )}
            {/* A-133: the legend of the badge, only while some house of the map is marked (the same badge, its word) */}
            {visitedShown > 0 && <div className="map-legend over-map" data-testid="map-legend"><span className="map-legend__badge" aria-hidden="true" />{t('visited.legend')}</div>}
            {offline && <div className="map-banner over-map" role="status" data-testid="map-offline">{t('map.offline')}</div>}
            {locating && <div className="map-banner over-map"><Busy name="dots" /> {t('map.locating')}</div>}
            {posError && <div className="map-banner map-banner--error over-map">{t('monasteries.no_location')}</div>}
            {!rows && <div className="map-banner over-map"><Busy name="dots" /></div>}
            {placeOpen && at && !selRow && (
              <div className="map-card over-map" data-testid="map-place-card">
                <IonButton fill="clear" size="small" className="map-card__close" onClick={() => setPlaceOpen(false)} aria-label={t('map.close')}><IonIcon slot="icon-only" icon={closeOutline} aria-hidden="true" /></IonButton>
                <h2 className="map-card__title">{t('contacts.office')}</h2>
                <div className="card__actions">
                  <IonButton size="small" onClick={() => navigate('/more/contacts')}>{t('more.contacts')}</IonButton>
                </div>
              </div>
            )}
            {selRow && (
              <div className="map-card over-map" data-testid="map-card">
                <IonButton fill="clear" size="small" className="map-card__close" onClick={() => setSelected(null)} aria-label={t('map.close')}><IonIcon slot="icon-only" icon={closeOutline} aria-hidden="true" /></IonButton>
                <h2 className="map-card__title">{field(selRow, 'name', lang)}</h2>
                {/* A-140 (3): «↳ <parent> ›» (-> the parent's card), then «<town>, <oblast>» for EVERY house (+ the distance when known) */}
                <ParentLine row={selRow} onOpen={() => navigate(`/monasteries/${selRow.parent_code}`)} className="map-card__parent" />
                <MetaLine className="map-card__sub" testId="map-card-place" groups={[placeOf(selRow), selDist != null && t('card.distance', { km: formatKm(selDist) })]} />
                <div className="card__actions">
                  <IonButton size="small" onClick={() => navigate(`/monasteries/${selRow.code}`)} data-testid="map-card-details">{t('map.details')}</IonButton>
                  {selRow.lat != null && (
                    <IonButton size="small" fill="outline" onClick={() => setDirs(true)}><IonIcon slot="start" icon={navigateOutline} aria-hidden="true" />{t('card.directions')}</IonButton>
                  )}
                </div>
                {selRow.lat != null && selRow.lon != null && <DirectionsSheet open={dirs} onClose={() => setDirs(false)} lat={selRow.lat} lon={selRow.lon} label={field(selRow, 'name', lang)} />}
              </div>
            )}
          </div>
          {near && (
            <div className="map-near" data-testid="map-near">
              <div className="filters__chips" ref={sideRow}>
                {/* the count first: the row scrolls sideways under its end fade, the answer must never be under it */}
                <IonNote className="filters__count" data-testid="near-count">{tCount(t, lang, 'monasteries.count', near.length)}</IonNote>
                {RADII_KM.map((km) => <ChipButton key={km} color={km === radius ? 'primary' : undefined} outline={km !== radius} pressed={km === radius} onClick={() => setRadius(km)}>{t('monasteries.radius_short', { km })}</ChipButton>)}
              </div>
              {near.length === 0 ? (
                <div className="empty">{t('map.nearby_empty', { km: radius })}</div>
              ) : (
                <IonList data-testid="near-list">{near.map((r) => <MonasteryRow key={r.code} row={r} onSelect={setSelected} selected={r.code === selected} />)}</IonList>
              )}
            </div>
          )}
        </div>
      </IonContent>
      )}
    </IonPage>
  );
}
