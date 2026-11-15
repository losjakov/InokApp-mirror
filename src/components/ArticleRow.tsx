import { IonItem, IonLabel } from '@ionic/react';
import { MetaLine } from './MetaLine';
import { Spoken } from './Spoken';
import { CoverImage } from './CoverImage';
import { Hl } from './Hl';
import type { Article } from '@/data/api/types';
import { useT } from '@/state/AppContext';
import { longDate } from '@/i18n/date';


/** One article row in EVERY list (the feed and its kinds, «Нове на сайті», a card's blocks; D5, A-15): cover · title + subtitle ·
 *  line 1 «kind · date», line 2 «★ rating (count) · 💬 comments» (A-53: on their own line; no line 2 when neither is there); nothing is cut.
 *  NO lead line in any row (A-55 withdrew A-54: the lead belongs to the article, not to the list). */
export function ArticleRow({ a, onSelect, selected, q }: { a: Article; onSelect: (id: number) => void; selected?: boolean;
  /** A-97: the search - its matches marked in the title and the subtitle (THE monasteries' highlight, `Hl`) */
  q?: string }) {
  const { t, lang } = useT();
  const v = a.rating ? a.rating.value.toLocaleString(lang, { maximumFractionDigits: 1 }) : '';
  const badges = [
    a.rating && a.rating.count > 0 ? <Spoken say={t('a11y.rating', { v, n: a.rating.count })}><span className="star-mark">★</span>{` ${v} (${a.rating.count})`}</Spoken> : '',
    a.comments_count ? <Spoken say={t('a11y.comments', { n: a.comments_count })}>{`💬 ${a.comments_count}`}</Spoken> : '',
  ];
  return (
    <IonItem button detail={false} onClick={() => onSelect(a.id)} color={selected ? 'light' : undefined} className="mrow" data-testid={`arow-${a.id}`} data-kind={a.kind}>
      <CoverImage small keep code={`a${a.id}`} url={a.cover?.url ?? null} alt="" className="mrow__cover arow__cover" />
      <IonLabel>
        <h2 className="mrow__title"><Hl text={a.title} q={q} /></h2>
        {a.subtitle && <p className="arow__subtitle"><Hl text={a.subtitle} q={q} /></p>}
        <MetaLine groups={[t(`kind1.${a.kind}`), longDate(a.published_at, lang)]} />
        {badges.some(Boolean) && <MetaLine groups={badges} className="mrow__sub arow__badges" testId={`abadges-${a.id}`} />}
      </IonLabel>
    </IonItem>
  );
}
