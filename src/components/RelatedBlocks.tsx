import { IonList } from '@ionic/react';
import { MoreButton } from './MoreButton';
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArticleRow } from './ArticleRow';
import { loadRelated, moreRelated, type RelatedBlock } from '@/data/repo/articles';
import { useApp } from '@/state/AppContext';

/** A-18 / R-17: under the history — «Публікації», «Відео», «Новини» of THIS card in the interface language, as the card page:
 *  5 rows each, «Показати більше» while the site has more; a block with no rows is not drawn. Tap → the article in the app. */
export function RelatedBlocks({ code }: { code: number }) {
  const { db, t, lang } = useApp();
  const navigate = useNavigate();
  const [blocks, setBlocks] = useState<RelatedBlock[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  useEffect(() => {
    let on = true;
    loadRelated(db, code, lang).then((b) => on && setBlocks(b));
    return () => { on = false; };
  }, [db, code, lang]);
  const more = async (b: RelatedBlock) => {
    if (!b.next) return;
    setBusy(b.kind);
    try {
      const p = await moreRelated(code, b.kind, lang, b.next);
      setBlocks((all) => all.map((x) => (x.kind === b.kind ? { ...x, items: [...x.items, ...p.items], next: p.next } : x)));
    } catch { /* offline: the button stays */ }
    setBusy(null);
  };
  return (
    <>
      {blocks.map((b) => (
        <section key={b.kind} data-testid={`related-${b.kind}`}>
          <h2 className="inok-heading">{t(`kind.${b.kind}`)}</h2>
          <IonList>{b.items.map((a) => <ArticleRow key={a.id} a={a} onSelect={(id) => navigate(`/articles?id=${id}`)} />)}</IonList>
          {b.next && (
            <MoreButton label={t('articles.more')} busy={busy === b.kind} onClick={() => void more(b)} testId={`related-more-${b.kind}`} />
          )}
        </section>
      ))}
    </>
  );
}
