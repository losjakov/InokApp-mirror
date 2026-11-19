import { IonIcon } from '@ionic/react';
import { closeOutline } from 'ionicons/icons';
import { Link, useNavigate } from 'react-router-dom';
import { CoverImage } from './CoverImage';
import { useApp } from '@/state/AppContext';
import { useReading } from '@/state/reading';
import { tCount } from '@/i18n';
import type { Place } from '@/data/repo/reading';

export const UNFINISHED_PATH = '/articles/unfinished';

/** A-141 (3): «прочитано N%» as a thin bar + its words; the reader hears «прочитано 42 відсотки» (one name, the bar is drawn) */
export function ReadBar({ pct, testId }: { pct: number; testId?: string }) {
  const { t, lang } = useApp();
  return (
    <span className="readbar" role="img" aria-label={tCount(t, lang, 'reading.pct_a11y', pct)} data-testid={testId} data-pct={pct}>
      <span className="readbar__track" aria-hidden="true"><span className="readbar__fill" style={{ width: `${pct}%` }} /></span>
      <span className="readbar__words" aria-hidden="true">{t('reading.pct', { n: pct })}</span>
    </span>
  );
}

/**
 * A-141 (3) «ПРОДОВЖИТИ ЧИТАННЯ»: ONE card - the latest unfinished article (cover, title, the bar, ✕) + «ще N ›» (-> «Недочитані») when there
 * are more; over the «Публікації» list (every tab but «★») and on «Головна» under the four buttons; nothing at all while nothing is unfinished.
 */
export function ContinueReading({ testId = 'continue' }: { testId?: string }) {
  const { t } = useApp();
  const { unfinished, dismiss } = useReading();
  const navigate = useNavigate();
  const p: Place | undefined = unfinished[0];
  if (!p) return null;
  const more = unfinished.length - 1;
  return (
    <section className="continue" data-testid={testId} aria-labelledby={`${testId}-h`}>
      <div className="continue__head">
        <h2 className="continue__h" id={`${testId}-h`}>{t('reading.continue')}</h2>
        {more > 0 && <Link to={UNFINISHED_PATH} className="continue__more" aria-label={t('reading.more_a11y', { n: more })} data-testid={`${testId}-more`}>{t('reading.more', { n: more })} ›</Link>}
      </div>
      <div className="continue__card">
        <button type="button" className="continue__open" onClick={() => navigate(`/articles?id=${p.id}`)} data-testid={`${testId}-open`} data-id={p.id}>
          <CoverImage small keep code={`a${p.id}`} url={p.snap.cover?.url ?? null} alt="" className="continue__cover" />
          <span className="continue__text">
            <span className="continue__title">{p.snap.title}</span>
            <ReadBar pct={p.pct} />
          </span>
        </button>
        <button type="button" className="continue__x" onClick={() => void dismiss(p.id)} aria-label={t('reading.dismiss')} data-testid={`${testId}-dismiss`}>
          <IonIcon icon={closeOutline} aria-hidden="true" />
        </button>
      </div>
    </section>
  );
}
