import { IonButton, IonIcon } from '@ionic/react';
import { askPhotoChooser } from '@/state/photoChooser';
import { OPENED_FROM } from '@/app/nav';
import { cloudDownloadOutline, cloudOfflineOutline, imageOutline } from 'ionicons/icons';
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { photoSrc, type PhotoOpts, type PhotoResult } from '@/native/covers';
import { onNetChange } from '@/native/network';
import { useApp } from '@/state/AppContext';

/** A photo that waits: the reason (`photos.reason_<why>`), whether a tap may load it, whether the network is metered. */
export type PhotoWaitResult = Exclude<PhotoResult, { src: string }>;

/**
 * ONE way a slot asks for its picture (A-20, A-15; A-112: the viewer asks the same way): `photoSrc()` = the file already on the phone
 * first (shown whatever the setting, offline too), then `decide()` (network x «Автозавантаження фото» x Data Saver). While the picture
 * waits it asks again when the network changes (Wi-Fi came back); a shown file that fails (`lost`: removed by «Очистити збережені фото»)
 * is asked ONCE more. `on` false = not asked yet (a row out of view); `url` null = nothing to ask. The answer is keyed by what was asked:
 * a new picture (the viewer's page turn) or a manual tap starts empty - an old answer is never shown for a new question.
 */
export function usePhoto(code: number | string, url: string | null, o: PhotoOpts & { on?: boolean } = {}): { res: PhotoResult | null; lost: () => void; again: () => void } {
  const { settings } = useApp();
  const { version, small, keep, manual, on = true } = o;
  const k = `${code}|${url}|${version ?? ''}|${manual ? 1 : 0}`;
  const [got, setGot] = useState<{ k: string; r: PhotoResult } | null>(null);
  const res = got?.k === k ? got.r : null;
  const [tick, setTick] = useState(0);
  const [retried, setRetried] = useState('');
  useEffect(() => (res && !res.src ? onNetChange(() => setTick((x) => x + 1)) : undefined), [res]);
  useEffect(() => {
    if (!on || !url) return;
    let live = true;
    photoSrc(code, url, settings.photos, { version, small, keep, manual }).then((r) => live && setGot({ k, r }));
    return () => { live = false; };
  }, [on, k, code, url, settings.photos, version, small, keep, manual, tick]);
  const lost = () => { setGot(null); if (retried !== k) { setRetried(k); setTick((x) => x + 1); } };
  return { res, lost, again: () => setTick((x) => x + 1) }; // `again`: a tap on a block whose question is already manual (a failed download)
}

/**
 * The ONE placeholder (A-20; A-112: the viewer shows this same block): the reason line, «Завантажити (мобільний інтернет)», the link to
 * «Автозавантаження фото». Rows: the icon only. `viewer` = the full-screen viewer's black look (the same block, its colours) and a polite
 * announcement; `onLeave` runs before the link navigates (the viewer closes itself first, so «Ще» is not left under it).
 */
export function PhotoWait({ r, full, onLoad, viewer, onLeave }: { r: PhotoWaitResult; full?: boolean; onLoad: () => void; viewer?: boolean; onLeave?: () => void }) {
  const { t } = useApp();
  const navigate = useNavigate();
  const reason = t(`photos.reason_${r.why}`);
  const icon = r.why === 'offline' ? cloudOfflineOutline : imageOutline;
  if (!full) return <div className="photo-wait photo-wait--icon" role="img" aria-label={reason} data-testid="photo-wait"><IonIcon icon={icon} aria-hidden="true" /></div>;
  return (
    <div className={`photo-wait${viewer ? ' photo-wait--viewer' : ''}`} data-testid="photo-wait" data-why={r.why} role={viewer ? 'status' : undefined} tabIndex={viewer ? -1 : undefined}>
      <IonIcon className="photo-wait__icon" icon={icon} aria-hidden="true" />
      <div className="photo-wait__reason">{reason}</div>
      {r.canLoad && (
        <IonButton size="small" onClick={onLoad} data-testid="photo-load">
          <IonIcon slot="start" icon={cloudDownloadOutline} aria-hidden="true" />{t(r.metered ? 'photos.load_mobile' : 'photos.load')}
        </IonButton>
      )}
      <button type="button" className="photo-wait__link" onClick={() => { onLeave?.(); askPhotoChooser(); navigate('/more', { state: OPENED_FROM }); }} data-testid="photo-settings">{t('photos.title')}</button>
    </div>
  );
}
