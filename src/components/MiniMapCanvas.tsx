import { useEffect, useRef } from 'react';
import { splitLavras } from '@/data/map/geojson';
import { InokMap, PLACE_ZOOM, boundsOf, fitHouses } from '@/data/map/inokMap';

/** the mini-map's label (`.minimap__chip`: 8 + 36 at the bottom) is what it draws over its edges */
const MINI_CHROME = { top: 0, right: 0, bottom: 44, left: 0 };
import type { MapPoint } from '@/data/repo/types';
import { isNative } from '@/native/platform';
import { useApp } from '@/state/AppContext';

/** the attribution the style's sources carry, as plain text (a mini-map has no control: it is one button) */
const creditOf = (sources: Record<string, unknown>) => [...new Set(Object.values(sources).flatMap((s) => {
  const a = (s as { attribution?: string }).attribution;
  return a ? [new DOMParser().parseFromString(a, 'text/html').body.textContent?.trim() ?? ''] : [];
}).filter(Boolean))].join(' ');

/** PLAN 5: the mini-map's MapLibre part (lazy: the eparchy page and «Контакти» do not pay for MapLibre before it is shown).
 *  The ONE set-up (inokMap.ts), not interactive; the houses framed as the main map frames them (`?eparchy=`), or one place. */
export default function MiniMapCanvas({ styleUrl, houses, place, onStub, onCredit }: { styleUrl: string; houses?: MapPoint[]; place?: [number, number]; onStub: () => void; onCredit: (c: string) => void }) {
  const { lang } = useApp();
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!box.current) return;
    const b = houses ? boundsOf(houses) : null;
    const c = new InokMap({ container: box.current, styleUrl, lang, interactive: false,
      ...(place ? { center: place, zoom: PLACE_ZOOM } : b ? { bounds: b } : {}), onFallback: onStub,
      onLayers: (m) => {
        c.setHouses(houses ? splitLavras(houses, lang) : null);
        c.setPlace(place ?? null);
        if (b) fitHouses(m, b, MINI_CHROME); // D50: THE fit of the main map, clear of its own label
        onCredit(creditOf(m.getStyle().sources));
        m.getContainer().dataset.ready = '1';
      } });
    if (!isNative()) (window as unknown as { __inokMiniMap?: unknown }).__inokMiniMap = c.map;
    const ro = new ResizeObserver(() => c.map.resize());
    ro.observe(box.current);
    return () => { ro.disconnect(); c.remove(); };
    // created once per mount: the screen keys the mini-map by what it shows
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return <div ref={box} className="minimap__canvas" data-testid="minimap-canvas" aria-hidden="true" />;
}
