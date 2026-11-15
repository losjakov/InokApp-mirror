import { IonButton, IonIcon, IonModal } from '@ionic/react';
import { chevronBackOutline, chevronForwardOutline, closeOutline } from 'ionicons/icons';
import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import type { PhotoOpts } from '@/native/covers';
import type { GalleryItem } from '@/data/photos/gallery';
import { useApp } from '@/state/AppContext';
import { PhotoWait, usePhoto } from './PhotoWait';

/** What the viewer shows: the picture as shown in the text (`src`; `shown` = its local copy when the slot already has it), and (a gallery
 *  picture, R-18) the site's full file behind its link. `full` = `src`: the server keeps no reduced copy (R-49 `thumb` null) - the ONE copy
 *  is fetched as the full file (by the A-20 rule, A-112), never twice and never by the WebView behind the pipeline. `w` / `h`: the frame's
 *  shape before the picture arrives (no jump). */
export interface ViewerPhoto { code: string; src: string; shown: string | null; full: string | null; alt: string; w?: number | null; h?: number | null }
/** ONE picture as a set (a cover, a body picture): what a tap on a shown slot opens - also the card's cover offline (A-109). */
export const onePhoto = (code: number | string, src: string, shown: string | null, alt: string, full: string | null = null): ViewerSet =>
  ({ at: 0, photos: [{ code: String(code), src, shown, full, alt }] });
/** A-96 W-4 / A-109: a gallery's items as the viewer's set - ONE mapping for a publication's gallery and a card's (`code` = the photo store key). */
export const viewerPhotos = (items: GalleryItem[], code: number | string): ViewerPhoto[] =>
  items.map((x) => ({ code: String(code), src: x.src, shown: null, full: x.full, alt: x.alt, w: x.w, h: x.h }));
/** A-96 W-4: the viewer opens on `at` of a set - one picture, or a whole site gallery (R-45) to page through. */
export interface ViewerSet { photos: ViewerPhoto[]; at: number }

/** A-112 (owner 15.11.2026 «Одно нажатие - вся галерея»): the full file of the CURRENT picture follows THE A-20 rule (`decide()` inside
 *  `photoSrc`) - opening the viewer and paging are NOT a manual request. The tap on the standard block's button is: it is given for the open
 *  SET (`consent` = the set object it was given in), so every picture of this set loads as it is paged to (the current one only, no
 *  neighbour ahead) until the viewer closes; a new opening is a new set object = asked again. */
export const fullAsk = (consent: ViewerSet | null, set: ViewerSet | null): PhotoOpts => ({ manual: !!set && consent === set });

const MAX_ZOOM = 4;
const SWIPE_PX = 60; // a page turn: a horizontal move longer than this and longer than the vertical one
const CLOSE_PX = 100; // swipe down to close

/**
 * R-18 + A-96 W-4: THE full-screen picture viewer (never the browser), for one picture or a gallery. Shows the picture at once (the slot's
 * copy, else the small copy by THE pipeline), then the full file of the CURRENT picture only (A-112: by the A-20 rule, `fullAsk`; no
 * neighbour is fetched ahead) replaces it. While the full file waits the viewer shows THE standard block (`PhotoWait`, its black look)
 * under the small copy, or - no small copy (R-49) - under the empty frame that keeps the photo's shape. A file already on the phone shows at once.
 * Gallery: swipe or the arrows page, the counter «3 / 12» (TalkBack: «Фото 3 з 12», polite); pinch / double-tap zoom (1–4×), the zoomed
 * picture pans; «×», system Back (an Ionic overlay) or a swipe down closes.
 */
export function PhotoViewer({ set, onClose }: { set: ViewerSet | null; onClose: () => void }) {
  const { t } = useApp();
  // state derived per set / per picture (no setState in an effect): a new set starts at its `at`, a new picture at 1x without its files
  const [pos, setPos] = useState<{ of: ViewerSet | null; i: number }>({ of: null, i: 0 });
  const n = set?.photos.length ?? 0;
  const i = pos.of === set ? pos.i : (set?.at ?? 0);
  const photo = set?.photos[Math.min(i, n - 1)] ?? null;
  const pk = photo ? `${i}|${photo.src}` : '';
  const one = !!photo?.full && photo.full === photo.src; // R-49: no reduced copy - the full file is the only one
  const [consent, setConsent] = useState<ViewerSet | null>(null);
  const small = usePhoto(photo?.code ?? '', photo && !photo.shown && !one ? photo.src : null, { small: true });
  const big = usePhoto(photo?.code ?? '', photo?.full ?? null, fullAsk(consent, set));
  const thumb = photo?.shown ?? small.res?.src ?? null;
  const full = big.res?.src ?? null;
  const wait = big.res && big.res.src === null ? big.res : null;
  const shownSrc = photo ? full ?? thumb ?? (one ? null : photo.src) : null; // a picture to show; null = the frame (R-49: the one copy on its way / waiting)
  const ratio = photo?.w && photo.h ? `${photo.w} / ${photo.h}` : undefined;
  // P10: after the tap the button leaves - when the answer comes TalkBack's focus goes to the picture (its alt), or back to the block if it
  // still waits (a failed download); never lost to the page behind
  const pic = useRef<HTMLElement | null>(null);
  const box = useRef<HTMLDivElement>(null);
  const focusPic = useRef(false);
  useEffect(() => {
    if (!focusPic.current || !big.res) return;
    focusPic.current = false;
    (big.res.src ? pic.current : box.current?.querySelector<HTMLElement>('.photo-wait'))?.focus();
  });
  const load = () => { focusPic.current = true; if (consent === set) big.again(); else setConsent(set); };
  const [zs, setZs] = useState({ pk: '', z: 1 });
  const zoom = zs.pk === pk ? zs.z : 1;
  const setZoom = (f: (z: number) => number) => setZs((s0) => ({ pk, z: f(s0.pk === pk ? s0.z : 1) }));
  const pts = useRef(new Map<number, { x: number; y: number }>());
  const pinch0 = useRef<{ d: number; z: number } | null>(null);
  const start = useRef<{ x: number; y: number } | null>(null);
  const lastTap = useRef(0);
  const go = (d: number) => setPos({ of: set, i: Math.max(0, Math.min(n - 1, i + d)) });
  const close = () => onClose();
  const dist = () => { const [a, b] = [...pts.current.values()]; return Math.hypot(a.x - b.x, a.y - b.y); };
  const key = (e: KeyboardEvent) => { if (e.key === 'ArrowLeft') go(-1); else if (e.key === 'ArrowRight') go(1); };
  return (
    <IonModal isOpen={!!set} onDidDismiss={close} className="viewer" data-testid="photo-viewer">
      {photo && (
        <div className="viewer__box" ref={box} onKeyDown={key}>
          <div
            className={`viewer__scroll${zoom > 1 ? ' viewer__scroll--zoomed' : ''}`}
            onPointerDown={(e) => {
              if ((e.target as Element).closest('button, a, ion-button')) return; // the block's button / link: their own click (no capture)
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
            {shownSrc
              ? <img ref={(e) => { pic.current = e; }} tabIndex={-1} src={shownSrc} alt={photo.alt} style={{ width: `${zoom * 100}%`, aspectRatio: ratio && `auto ${ratio}` }} draggable={false}
                  data-testid="viewer-img" data-full={full ? '1' : '0'} data-index={i} />
              : <div ref={(e) => { pic.current = e; }} tabIndex={-1} className="viewer__frame" style={{ aspectRatio: ratio ?? '4 / 3' }} role="img" aria-label={photo.alt}
                  data-testid="viewer-wait" data-index={i} />}
          </div>
          {/* owner 15.11.2026 (on the shot): the block always stands UNDER the picture, as in a publication's gallery - never squeezed into the frame */}
          {wait && <PhotoWait r={wait} full viewer onLoad={load} onLeave={close} />}
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
