import { IonIcon } from '@ionic/react';
import { cloudOfflineOutline, mapOutline } from 'ionicons/icons';
import { lazy, Suspense, useEffect, useState } from 'react';
import type { MapPoint } from '@/data/repo/types';
import { hasWebGL } from '@/data/map/webgl';
import { online } from '@/native/network';
import { mapGlFailed } from '@/app/mapGlFailure';
import { useApp } from '@/state/AppContext';

const Canvas = lazy(() => import('./MiniMapCanvas'));

/**
 * PLAN 5 (cloud_11): THE mini-map of a page (an eparchy's houses, the editorial office of «Контакти») — the main map's set-up
 * (inokMap.ts), not interactive: the whole map is ONE button that opens the main map with the same extent (`to`). Its label sits on
 * the `.over-map` surface (D47). Offline / no WebGL / the style fails: an honest stub of the same size (no tiles = no fake map);
 * the button still opens the main map (its markers come from the DB). The style's attribution is printed under it.
 */
export function MiniMap({ houses, place, label, onOpen, testId }: { houses?: MapPoint[]; place?: [number, number]; label: string; onOpen: () => void; testId: string }) {
  const { t, config } = useApp();
  // only the real base map: the flat fallback would be pins on nothing — the config's style URL first (it loads after the first screen)
  const styleUrl = config?.map_style_url ?? null;
  const [stub, setStub] = useState(() => !hasWebGL());
  const [credit, setCredit] = useState('');
  useEffect(() => { let on = true; void online().then((o) => { if (on && !o) setStub(true); }); return () => { on = false; }; }, []);
  // A-182: a device whose GL failed a map shows NO mini-map at all (the page keeps its address / «Маршрут»); unknown yet = nothing drawn
  const [gl, setGl] = useState<'wait' | 'ok' | 'failed'>('wait');
  useEffect(() => { let on = true; void mapGlFailed().then((f) => { if (on) setGl(f ? 'failed' : 'ok'); }); return () => { on = false; }; }, []);
  if (gl === 'failed') return null;
  return (
    <figure className="minimap" data-stub={stub ? '1' : '0'}>
      <button type="button" className="minimap__box" onClick={onOpen} data-testid={testId}>
        {stub ? (
          <span className="minimap__stub" data-testid="minimap-stub"><IonIcon icon={cloudOfflineOutline} aria-hidden="true" /><span>{t('map.mini_offline')}</span></span>
        ) : (
          styleUrl && gl === 'ok' && <Suspense fallback={null}><Canvas key={styleUrl} styleUrl={styleUrl} houses={houses} place={place} onStub={() => setStub(true)} onCredit={setCredit} onGlFail={() => setGl('failed')} /></Suspense>
        )}
        <span className="minimap__chip over-map"><IonIcon icon={mapOutline} aria-hidden="true" /><span>{label}</span></span>
      </button>
      {!stub && credit && <figcaption className="minimap__credit">{credit}</figcaption>}
    </figure>
  );
}
