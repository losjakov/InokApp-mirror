import { IonButton, IonIcon, IonModal } from '@ionic/react';
import { chevronBackOutline, chevronForwardOutline, closeOutline } from 'ionicons/icons';
import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { photoSrc } from '@/native/covers';
import type { Wait } from '@/data/photos/policy';
import { useApp } from '@/state/AppContext';

/** What the viewer shows: the picture as shown in the text (`src`; `shown` = its local copy when the slot already has it), and (a gallery
 *  picture, R-18) the site's full file behind its link. */
export interface ViewerPhoto { code: string; src: string; shown: string | null; full: string | null; alt: string }
/** A-96 W-4: the viewer opens on `at` of a set - one picture, or a whole site gallery (R-45) to page through. */
export interface ViewerSet { photos: ViewerPhoto[]; at: number }

const MAX_ZOOM = 4;
const SWIPE_PX = 60; // a page turn: a horizontal move longer than this and longer than the vertical one
const CLOSE_PX = 100; // swipe down to close

/**
 * R-18 + A-96 W-4: THE full-screen picture viewer (never the browser), for one picture or a gallery. Shows the picture at once (the slot's
 * copy, else the small copy by THE pipeline), then the full file of the CURRENT picture only (a tap / a page turn = a manual request, A-20;
 * no neighbour is fetched ahead) replaces it; without it (offline, data saver) the small copy stays with the reason line of A-20.
 * Gallery: swipe or the arrows page, the counter «3 / 12» (TalkBack: «Фото 3 з 12», polite); pinch / double-tap zoom (1–4×), the zoomed
 * picture pans; «×», system Back (an Ionic overlay) or a swipe down closes.
 */
export function PhotoViewer({ set, onClose }: { set: ViewerSet | null; onClose: () => void }) {
  const { t, settings } = useApp();
  // state derived per set / per picture (no setState in an effect): a new set starts at its `at`, a new picture at 1x without its files
  const [pos, setPos] = useState<{ of: ViewerSet | null; i: number }>({ of: null, i: 0 });
  const n = set?.photos.length ?? 0;
  const i = pos.of === set ? pos.i : (set?.at ?? 0);
  const photo = set?.photos[Math.min(i, n - 1)] ?? null;
  const pk = photo ? `${i}|${photo.src}` : '';
  const [got, setGot] = useState<{ pk: string; thumb?: string; full?: string; why?: Wait } | null>(null);
  const g = got?.pk === pk ? got : null;
  const thumb = photo?.shown ?? g?.thumb ?? null;
  const full = g?.full ?? null;
  const why = g?.why ?? null;
  const [zs, setZs] = useState({ pk: '', z: 1 });
  const zoom = zs.pk === pk ? zs.z : 1;
  const setZoom = (f: (z: number) => number) => setZs((s0) => ({ pk, z: f(s0.pk === pk ? s0.z : 1) }));
  const pts = useRef(new Map<number, { x: number; y: number }>());
  const pinch0 = useRef<{ d: number; z: number } | null>(null);
  const start = useRef<{ x: number; y: number } | null>(null);
  const lastTap = useRef(0);
  useEffect(() => {
    if (!photo) return;
    let on = true;
    const put = (v: { thumb?: string; full?: string; why?: Wait }) => on && setGot((o) => ({ ...(o?.pk === pk ? o : {}), ...v, pk }));
    if (!photo.shown) void photoSrc(photo.code, photo.src, settings.photos, { small: true }).then((r) => { if (r.src !== null) put({ thumb: r.src }); });
    if (photo.full) void photoSrc(photo.code, photo.full, settings.photos, { manual: true }).then((r) => put(r.src !== null ? { full: r.src } : { why: r.why }));
    return () => { on = false; };
  }, [photo, pk, settings.photos]);
  const go = (d: number) => setPos({ of: set, i: Math.max(0, Math.min(n - 1, i + d)) });
  const close = () => onClose();
  const dist = () => { const [a, b] = [...pts.current.values()]; return Math.hypot(a.x - b.x, a.y - b.y); };
  const key = (e: KeyboardEvent) => { if (e.key === 'ArrowLeft') go(-1); else if (e.key === 'ArrowRight') go(1); };
  return (
    <IonModal isOpen={!!set} onDidDismiss={close} className="viewer" data-testid="photo-viewer">
      {photo && (
        <div className="viewer__box" onKeyDown={key}>
          <div
            className={`viewer__scroll${zoom > 1 ? ' viewer__scroll--zoomed' : ''}`}
            onPointerDown={(e) => {
              try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* a synthetic pointer */ } // the swipe's end lands here, also over an arrow
              pts.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
              if (pts.current.size === 2) { pinch0.current = { d: dist(), z: zoom }; start.current = null; }
              else {
                start.current = { x: e.clientX, y: e.clientY };
                if (Date.now() - lastTap.current < 300) { setZoom((z) => (z > 1 ? 1 : 2.5)); start.current = null; }
                lastTap.current = Date.now();
              }
            }}
            onPointerMove={(e) => {
              if (!pts.current.has(e.pointerId)) return;
              pts.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
              if (pinch0.current && pts.current.size === 2) { const z = Math.min(MAX_ZOOM, Math.max(1, (pinch0.current.z * dist()) / pinch0.current.d)); setZoom(() => z); }
            }}
            onPointerUp={(e) => {
              pts.current.delete(e.pointerId);
              if (pts.current.size < 2) pinch0.current = null;
              const s = start.current; start.current = null;
              if (!s || zoom > 1 || pts.current.size) return; // a zoomed picture pans; a pinch is not a swipe
              const dx = e.clientX - s.x; const dy = e.clientY - s.y;
              if (Math.abs(dx) > SWIPE_PX && Math.abs(dx) > Math.abs(dy)) go(dx < 0 ? 1 : -1);
              else if (dy > CLOSE_PX && dy > Math.abs(dx)) close();
            }}
            onPointerCancel={(e) => { pts.current.delete(e.pointerId); pinch0.current = null; start.current = null; }}
          >
            <img src={full ?? thumb ?? photo.src} alt={photo.alt} style={{ width: `${zoom * 100}%` }} draggable={false}
              data-testid="viewer-img" data-full={full ? '1' : '0'} data-index={i} />
          </div>
          {why && <p className="viewer__note" role="status" data-testid="viewer-note">{t(`photos.reason_${why}`)}</p>}
          {photo.alt && <p className="viewer__caption">{photo.alt}</p>}
          {n > 1 && <>
            <div className="viewer__count" aria-live="polite" data-testid="viewer-count">
              <span aria-hidden="true">{i + 1} / {n}</span><span className="sr-only">{t('gallery.photo', { n: i + 1, total: n })}</span>
            </div>
            <IonButton fill="clear" className="viewer__nav viewer__nav--prev" disabled={i === 0} onClick={() => go(-1)} aria-label={t('gallery.prev')} data-testid="viewer-prev">
              <IonIcon slot="icon-only" icon={chevronBackOutline} aria-hidden="true" />
            </IonButton>
            <IonButton fill="clear" className="viewer__nav viewer__nav--next" disabled={i === n - 1} onClick={() => go(1)} aria-label={t('gallery.next')} data-testid="viewer-next">
              <IonIcon slot="icon-only" icon={chevronForwardOutline} aria-hidden="true" />
            </IonButton>
          </>}
          <IonButton fill="clear" className="viewer__close" onClick={close} aria-label={t('common.close')} data-testid="viewer-close">
            <IonIcon slot="icon-only" icon={closeOutline} aria-hidden="true" />
          </IonButton>
        </div>
      )}
    </IonModal>
  );
}
