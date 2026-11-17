import { IonList } from '@ionic/react';
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { Article } from '@/data/api/types';
import { readAlso } from '@/data/repo/readAlso';
import { online } from '@/native/network';
import { useApp } from '@/state/AppContext';
import { ArticleRow } from './ArticleRow';

/**
 * A-130 (1), R-54: «Читайте також» (a publication, a news item) / «Дивіться також» (a video) under ONE opened item.
 * - asked only AFTER the item is shown (this mounts with the shown item; its effect runs after the paint) - it never holds the text;
 * - a publication / video: a compact bulleted list - a bold dot, «title — subtitle» in one font, the app's link colour, no photo / date /
 *   stars; a news item: up to four rows of the news list (THE `ArticleRow`, A-15);
 * - without a network, on an error, an empty answer or without the site's flag: NOTHING - no heading, no message, no empty space (A-130).
 */
export function ReadAlso({ a }: { a: Pick<Article, 'id' | 'kind'> }) {
  const { t, lang, config } = useApp();
  const navigate = useNavigate();
  const key = `${a.id}|${lang}`;
  const [got, setGot] = useState<{ key: string; items: Article[] } | null>(null); // the answer FOR this item (another item's never shows)
  const on = config?.features?.articles_related === true;
  useEffect(() => {
    if (!on) return;
    let live = true;
    void (async () => {
      if (!(await online())) return; // offline: no block, no request
      const items = await readAlso(a, lang).catch(() => [] as Article[]);
      if (live) setGot({ key, items });
    })();
    return () => { live = false; };
  }, [key, a.kind, on]); // eslint-disable-line react-hooks/exhaustive-deps
  const items = on && got?.key === key ? got.items : [];
  if (!items.length) return null;
  const open = (id: number) => navigate(`/articles?id=${id}`);
  const title = t(a.kind === 'video' ? 'articles.watch_also' : 'articles.read_also');
  return (
    <section className={`read-also read-also--${a.kind === 'news' ? 'rows' : 'list'}`} data-testid="read-also" data-kind={a.kind} aria-label={title}>
      <h2 className="inok-heading">{title}</h2>
      {a.kind === 'news'
        ? <IonList>{items.map((x) => <ArticleRow key={x.id} a={x} onSelect={open} />)}</IonList>
        : <ul className="read-also__list">{items.map((x) => (
          <li key={x.id}>
            <a href={`/articles?id=${x.id}`} className="read-also__link" data-testid={`read-also-${x.id}`} onClick={(e) => { e.preventDefault(); open(x.id); }}>
              {x.subtitle ? `${x.title} — ${x.subtitle}` : x.title}
            </a>
          </li>))}
        </ul>}
    </section>
  );
}
