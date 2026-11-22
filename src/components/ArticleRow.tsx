import { IonItem, IonLabel } from '@ionic/react';
import { MetaLine } from './MetaLine';
import { Spoken } from './Spoken';
import { CoverImage } from './CoverImage';
import { Hl } from './Hl';
import type { Article } from '@/data/api/types';
import { useT } from '@/state/AppContext';
import { shortDate } from '@/i18n/date';
import { useReading } from '@/state/reading';
import { keepsPlace } from '@/data/repo/reading';
import { ReadBar } from './ContinueReading';
import { useLongPress } from '@/state/quickSheet';
import { useArticleSheet } from './QuickSheet';


/** One article row in EVERY list (the feed and its kinds, «Нове на сайті», a card's blocks; D5, A-15): cover · title + subtitle ·
 *  ONE meta line (A-146 / A-147, cloud_43; A-164 order, cloud_44) «[Новина - a news row of a MIXED list only] · ★ v (n) · 💬 N · DD.MM.YYYY»
 *  (the date LAST; an absent group drops with its dot), wrapping only between groups; nothing is cut. `mixed` is set by the LIST (several kinds in it), never guessed by the row.
 *  NO lead line in any row (A-55 withdrew A-54: the lead belongs to the article, not to the list). */
export function ArticleRow({ a, onSelect, selected, q, mixed }: { a: Article; onSelect: (id: number) => void; selected?: boolean;
  /** A-97: the search - its matches marked in the title and the subtitle (THE monasteries' highlight, `Hl`) */
  q?: string;
  /** A-146: the list holds several kinds («Усі», «★», Home «Нове на сайті», «Читайте також», «Недочитані») - a news row names its kind */
  mixed?: boolean }) {
  const { t, lang } = useT();
  const { saved, places } = useReading();
  const sheet = useArticleSheet(onSelect);
  const press = useLongPress(() => void sheet(a)); // A-142: the same sheet in EVERY article list
  const place = keepsPlace(a.kind) ? places.get(a.id) : undefined; // A-141 (3) / (4): a video has no place
  const v = a.rating ? a.rating.value.toLocaleString(lang, { maximumFractionDigits: 1 }) : '';
  const badges = [
    a.rating && a.rating.count > 0 ? <Spoken say={t('a11y.rating', { v, n: a.rating.count })}><span className="star-mark">★</span>{` ${v} (${a.rating.count})`}</Spoken> : '',
    a.comments_count ? <Spoken say={t('a11y.comments', { n: a.comments_count })}>{`💬 ${a.comments_count}`}</Spoken> : '',
  ];
  return (
    <IonItem button detail={false} onClick={() => onSelect(a.id)} color={selected ? 'light' : undefined} className="mrow" data-testid={`arow-${a.id}`} data-kind={a.kind} {...press}>
      <CoverImage small keep code={`a${a.id}`} url={a.cover?.url ?? null} alt="" className="mrow__cover arow__cover" />
      <IonLabel>
        {/* A-141 (1): a saved article's ★ before its title in EVERY list (drawn; the reader hears «В обраних») */}
        <h2 className="mrow__title">{saved.has(a.id) && <span className="arow__saved" role="img" aria-label={t('articles.saved_mark')} data-testid={`asaved-${a.id}`}>★ </span>}<Hl text={a.title} q={q} /></h2>
        {a.subtitle && <p className="arow__subtitle"><Hl text={a.subtitle} q={q} /></p>}
        <MetaLine groups={[mixed && a.kind === 'news' && <span data-testid={`akind-${a.id}`}>{t('kind1.news')}</span>, ...badges, shortDate(a.published_at)]} testId={`ameta-${a.id}`} />
        {/* A-141 (3): a started article - the thin bar + «прочитано N%»; a finished one - «✓ прочитано» */}
        {place?.finished ? <p className="arow__done" data-testid={`aread-${a.id}`}><span aria-hidden="true">✓ </span>{t('reading.done')}</p>
          : place?.started ? <p className="arow__read"><ReadBar pct={place.pct} testId={`apct-${a.id}`} /></p> : null}
      </IonLabel>
    </IonItem>
  );
}
