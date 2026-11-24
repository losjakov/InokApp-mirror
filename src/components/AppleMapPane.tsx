import { useIonViewDidEnter, useIonViewWillLeave } from '@ionic/react';
import { useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { AppleMap, AppleMapView, appleHouses } from '@/native/appleMap';
import { reportQuietly } from '@/app/crash';
import type { MapPoint } from '@/data/repo/types';
import { useApp } from '@/state/AppContext';

/**
 * A-183: the «Карта» tab's area given to Apple's map (iPhone, our WebGL map cannot draw). This element only RESERVES the place (its rect goes
 * to the native view) and tells the view when to hide (an overlay, the page left). A pin's «›» opens the house card - the card route of a
 * tap on our map. Any failure of the native map: `onFail` (the list).
 */
export function AppleMapPane({ rows, center, onFail }: { rows: MapPoint[] | null; center?: { lat: number; lon: number }; onFail: () => void }) {
  const { t, lang } = useApp();
  const navigate = useNavigate();
  const box = useRef<HTMLDivElement>(null);
  const view = useRef<AppleMapView | null>(null);
  const started = useRef(false);
  useEffect(() => {
    const rect = () => { const b = box.current?.getBoundingClientRect(); return b && b.width > 0 && b.height > 0 ? { x: b.left, y: b.top, width: b.width, height: b.height } : null; };
    const v = new AppleMapView(AppleMap, rect, (code) => navigate(`/monasteries/${code}`), (e) => { reportQuietly(e, 'error'); onFail(); });
    view.current = v;
    const ro = new ResizeObserver(() => void v.sync());
    if (box.current) ro.observe(box.current);
    // the overlays come and go in the DOM (Ionic keeps them with `overlay-hidden`): every change re-reads the one test
    const mo = new MutationObserver(() => void v.sync());
    mo.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['class'] });
    return () => { ro.disconnect(); mo.disconnect(); void v.stop(); view.current = null; started.current = false; };
    // one native view per mount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  // the houses: the first set starts the view, a changed set (the eparchy scope, the language) replaces the annotations
  useEffect(() => {
    const v = view.current;
    if (!v || !rows) return;
    const hs = appleHouses(rows, lang);
    if (box.current) box.current.dataset.houses = String(hs.length); // the ring compares the native annotations with this (A-183 (8))
    if (!started.current) { started.current = true; void v.start(hs, t('map.apple_open'), center); }
    else void v.setHouses(hs);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, lang]);
  useIonViewDidEnter(() => { void view.current?.page(true); });
  useIonViewWillLeave(() => { void view.current?.page(false); });
  return <div ref={box} className="map-canvas apple-map" data-testid="apple-map" aria-hidden="true" />;
}
