import { IonButton, IonIcon } from '@ionic/react';
import { cloudDownloadOutline, cloudOfflineOutline, expandOutline, imageOutline } from 'ionicons/icons';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { photoSrc, type PhotoResult } from '@/native/covers';
import { onNetChange } from '@/native/network';
import { useApp } from '@/state/AppContext';
import { onePhoto, PhotoViewer, type ViewerSet } from './PhotoViewer';
import { scrollRoot } from './SplitContent';

/**
 * A-20: a group of photos (an article, a card) — «Завантажити всі фото» loads every photo of the group that waits.
 * The photos report whether they wait; the button shows only while one does.
 */
interface Scope { forced: boolean; force: () => void; report: (key: string, waits: boolean) => void; waiting: number }
const PhotoScopeCtx = createContext<Scope | null>(null);

export function PhotoScope({ children }: { children: ReactNode }) {
  const [forced, setForced] = useState(false);
  const [waits, setWaits] = useState<ReadonlySet<string>>(new Set());
  const report = useCallback((key: string, w: boolean) => setWaits((s) => {
    if (s.has(key) === w) return s;
    const n = new Set(s); if (w) n.add(key); else n.delete(key); return n;
  }), []);
  const force = useCallback(() => setForced(true), []);
  const v = useMemo(() => ({ forced, force, report, waiting: waits.size }), [forced, force, report, waits]);
  return <PhotoScopeCtx.Provider value={v}>{children}</PhotoScopeCtx.Provider>;
}

/** «Завантажити всі фото» — present while TWO or more photos of the group wait (one has its own button on its placeholder) (A-20). */
export function LoadAllPhotos() {
  const { t } = useApp();
  const scope = useContext(PhotoScopeCtx);
  if (!scope || scope.waiting < 2 || scope.forced) return null;
  return (
    <IonButton fill="outline" size="small" className="photos-all" onClick={scope.force} data-testid="photos-load-all">
      <IonIcon slot="start" icon={cloudDownloadOutline} aria-hidden="true" />{t('photos.load_all')}
    </IonButton>
  );
}

interface Props {
  code: number | string;
  url: string | null;
  alt: string;
  className: string;
  version?: string | null;
  /** a SMALL picture - list thumbnails, channel avatars, icons: loaded on any network (A-20 size class); offline a row keeps its icon */
  small?: boolean;
  /** A-111: a picture a LIST needs offline (thumbnails, avatars, eparchy pictures) - «Очистити збережені фото» keeps it (census, JOURNAL cloud_34) */
  keep?: boolean;
  /** a large slot (card / article cover, a body picture): the placeholder carries its reason, the button and the settings link */
  full?: boolean;
  /** what a row shows while there is no picture (avatar initials, the empty box) */
  fallback?: ReactNode;
  /** R-18: width / height of the file — the frame keeps it before the picture arrives (no layout jump) */
  ratio?: number;
  /** A-31 / R-18: «a picture that can be opened» — a tap on the SHOWN picture opens THE viewer (one for the whole app); `full` = a larger
   *  file the viewer fetches over the shown copy (a gallery picture's link), else it shows the shown copy. A placeholder never opens.
   *  A-96 W-4: `open` = a gallery cell - the gallery owns the viewer (the set to page through), the cell reports its shown copy; `label`
   *  = what TalkBack hears instead of «Відкрити фото: <alt>». */
  openable?: true | { full: string | null } | { open: (shown: string) => void; label: string };
  /** A-23 #6: told whether the picture is really shown (not the placeholder) — the card's gallery button follows it */
  onShown?: (shown: boolean) => void;
}

/** ONE photo slot for the whole app: the cache + the A-20 rule through photoSrc(); the ONE placeholder when the photo waits. */
export function CoverImage({ code, url, alt, className, version, small, keep, full, fallback, ratio, openable, onShown }: Props) {
  const { settings, t } = useApp();
  const scope = useContext(PhotoScopeCtx);
  const [res, setRes] = useState<PhotoResult | null>(null);
  // inside a card / an article (a few dozen photos at most) every photo is weighed at once, so «Завантажити всі фото» knows them all
  const inScope = !!scope;
  const [visible, setVisible] = useState(inScope);
  const [manual, setManual] = useState(false);
  const [tick, setTick] = useState(0);
  // A-111 P2: a shown file removed by «Очистити збережені фото» (or any lost file) asks the pipeline ONCE more - it comes back by the A-20 rule
  const [retried, setRetried] = useState(false);
  const lost = () => { setRes(null); if (!retried) { setRetried(true); setTick((x) => x + 1); } };
  const [viewer, setViewer] = useState<ViewerSet | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  const want = manual || !!scope?.forced;
  // 300+ rows: touch the cache / network only for rows that scrolled into view
  useEffect(() => {
    const el = ref.current;
    if (inScope) return;
    if (!el || typeof IntersectionObserver === 'undefined') { setVisible(true); return; }
    const io = new IntersectionObserver((es) => { if (es.some((e) => e.isIntersecting)) { setVisible(true); io.disconnect(); } }, { root: scrollRoot(el), rootMargin: '200px' });
    io.observe(el);
    return () => io.disconnect();
  }, [inScope]);
  // a waiting photo tries again when the network changes (Wi-Fi came back)
  useEffect(() => (res && !res.src ? onNetChange(() => setTick((x) => x + 1)) : undefined), [res]);
  useEffect(() => {
    if (!visible) return;
    let on = true;
    photoSrc(code, url, settings.photos, { version, small, keep, manual: want }).then((r) => on && setRes(r));
    return () => { on = false; };
  }, [visible, code, url, settings.photos, version, small, keep, want, tick]);
  const shown = !!res?.src;
  useEffect(() => { onShown?.(shown); }, [onShown, shown]);
  const key = `${code}|${url}`;
  const wait = res && res.src === null ? res : null;
  const waits = !!url && !!wait?.canLoad;
  const report = scope?.report; // stable (useCallback): the effect does not re-run when the group's count changes
  useEffect(() => { report?.(key, waits); return () => report?.(key, false); }, [report, key, waits]);
  return (
    <div ref={ref} className={className} style={ratio ? { aspectRatio: String(ratio) } : undefined}>
      {res?.src ? (openable
        ? <button type="button" className="photo-open" onClick={() => (typeof openable === 'object' && 'open' in openable ? openable.open(res.src!)
            : setViewer(onePhoto(code, url!, res.src!, alt, openable === true ? null : openable.full)))}
            aria-label={typeof openable === 'object' && 'open' in openable ? openable.label : alt ? `${t('photos.open')}: ${alt}` : t('photos.open')} data-testid="photo-open">
            <img src={res.src} alt={alt} loading="lazy" onError={lost} />
            <span className="over-photo photo-open__hint" aria-hidden="true"><IonIcon icon={expandOutline} aria-hidden="true" /></span></button>
        : <img src={res.src} alt={alt} loading="lazy" onError={lost} />)
        : wait && url && !(small && fallback) ? <PhotoWait r={wait} full={full} onLoad={() => setManual(true)} />
        : fallback}
      {openable && !(typeof openable === 'object' && 'open' in openable) && <PhotoViewer set={viewer} onClose={() => setViewer(null)} />}
    </div>
  );
}

/** The ONE placeholder (A-20): the reason line, «Завантажити (мобільний інтернет)», the link to «Автозавантаження фото». Rows: the icon only. */
function PhotoWait({ r, full, onLoad }: { r: Exclude<PhotoResult, { src: string }>; full?: boolean; onLoad: () => void }) {
  const { t } = useApp();
  const navigate = useNavigate();
  const reason = t(`photos.reason_${r.why}`);
  if (!full) return <div className="photo-wait photo-wait--icon" role="img" aria-label={reason} data-testid="photo-wait"><IonIcon icon={r.why === 'offline' ? cloudOfflineOutline : imageOutline} aria-hidden="true" /></div>;
  return (
    <div className="photo-wait" data-testid="photo-wait" data-why={r.why}>
      <IonIcon className="photo-wait__icon" icon={r.why === 'offline' ? cloudOfflineOutline : imageOutline} aria-hidden="true" />
      <div className="photo-wait__reason">{reason}</div>
      {r.canLoad && (
        <IonButton size="small" onClick={onLoad} data-testid="photo-load">
          <IonIcon slot="start" icon={cloudDownloadOutline} aria-hidden="true" />{t(r.metered ? 'photos.load_mobile' : 'photos.load')}
        </IonButton>
      )}
      <button type="button" className="photo-wait__link" onClick={() => navigate('/more?photos=1')} data-testid="photo-settings">{t('photos.title')}</button>
    </div>
  );
}
