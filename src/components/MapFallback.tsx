import { IonButton, IonList } from '@ionic/react';
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { MonasteryRow } from './MonasteryRow';
import { listMonasteries } from '@/data/repo/monasteries';
import type { MonasteryListRow } from '@/data/repo/types';
import { currentPosition, locationGranted, type Position } from '@/native/geolocation';
import { useApp } from '@/state/AppContext';

const PAGE = 30;

/**
 * A-182 (cloud_46): the «Карта» tab on a device whose WebGL cannot draw the map (no WebGL at all, or MapLibre's shaders failed - iPhone 7 /
 * iOS 15): ONE line saying so + the houses as the «Монастирі» rows (by distance when the location is granted or asked, else by name; an
 * eparchy's scope kept), a row opens the card (its «Маршрут» = the maps apps). `onRetry` (only after a GL failure, not without WebGL):
 * «Спробувати показати карту» - the flag cleared, the map tried once more.
 */
export function MapFallback({ pos, eparchyId, onRetry }: { pos: Position | null; eparchyId: number | null; onRetry?: () => void }) {
  const { db, fts, t, lang } = useApp();
  const navigate = useNavigate();
  const [own, setOwn] = useState<Position | null>(null);
  const [rows, setRows] = useState<MonasteryListRow[] | null>(null);
  const [shown, setShown] = useState(PAGE);
  // a location the person already granted is used quietly; never a permission prompt from here (the header's «near me» asks)
  useEffect(() => {
    let on = true;
    void locationGranted().then((g) => (g ? currentPosition() : null)).then((p) => { if (on && p) setOwn(p); }).catch(() => undefined);
    return () => { on = false; };
  }, []);
  const at = pos ?? own;
  useEffect(() => {
    let on = true;
    void listMonasteries(db, fts, { lang, sort: at ? 'distance' : 'name', at, filters: eparchyId != null ? { eparchy_id: eparchyId } : {} })
      .then((r) => { if (on) setRows(r); });
    return () => { on = false; };
  }, [db, fts, lang, at, eparchyId]);
  const open = (code: number) => navigate(`/monasteries/${code}`);
  return (
    <div className="map-fallback" data-testid="map-fallback">
      <p className="map-fallback__note" role="note" data-testid="map-gl-note">{t('map.gl_failed')}</p>
      {onRetry && <IonButton fill="outline" size="small" className="map-fallback__retry" onClick={onRetry} data-testid="map-gl-retry">{t('map.gl_retry')}</IonButton>}
      {rows && (
        <IonList data-testid="map-fallback-list">
          {rows.slice(0, shown).map((r) => <MonasteryRow key={r.code} row={r} onSelect={open} onPage={open} />)}
        </IonList>
      )}
      {rows && rows.length > shown && (
        <IonButton fill="clear" expand="block" onClick={() => setShown((n) => n + PAGE)} data-testid="map-fallback-more">
          {t('common.more_n', { n: Math.min(PAGE, rows.length - shown) })}
        </IonButton>
      )}
    </div>
  );
}
