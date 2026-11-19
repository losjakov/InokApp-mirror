import { IonContent, IonList, IonNote, IonPage } from '@ionic/react';
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { PageHeader } from '@/components/PageHeader';
import { MonasteryRow } from '@/components/MonasteryRow';
import { getMonasteriesInOrder } from '@/data/repo/monasteries';
import type { MonasteryListRow as Row } from '@/data/repo/types';
import { useApp } from '@/state/AppContext';
import { useReading } from '@/state/reading';
import { ArticleRow } from '@/components/ArticleRow';

/** THE page of the person's own marks (A-15: one component) - «Обрані» (the star) and «Я тут був» (A-133: the counter in its head, the
 *  same rows; empty = one inviting line). Both lists are local and work offline. */
function MarkedPage({ codes, title, empty, emptyId, counter }: { codes: Set<number>; title: string; empty: string; emptyId: string; counter?: string }) {
  const { db } = useApp();
  const navigate = useNavigate();
  const [rows, setRows] = useState<Row[]>([]);
  useEffect(() => {
    getMonasteriesInOrder(db, Array.from(codes)).then(setRows); // A-44: the lavras first, the rest newest first
  }, [db, codes]);
  return (
    <IonPage>
      <PageHeader title={title} />
      <IonContent>
        {counter && <div className="list-pin"><div className="filters__row"><IonNote className="filters__count" data-testid="visited-count" aria-live="polite">{counter}</IonNote></div></div>}
        {rows.length === 0 ? <div className="empty" data-testid={emptyId}>{empty}</div> : (
          <IonList>{rows.map((r) => <MonasteryRow key={r.code} row={r} onSelect={(c) => navigate(`/monasteries/${c}`)} />)}</IonList>
        )}
      </IonContent>
    </IonPage>
  );
}

export function FavouritesPage() {
  const { t, favourites } = useApp();
  return <MarkedPage codes={favourites} title={t('favourites.title')} empty={t('favourites.empty')} emptyId="fav-empty" />;
}

/** A-133: «Я тут був» under «Ще» - «Відвідано {n} з {m}» above the marked houses (newest mark first, the lavras on top as everywhere) */
export function VisitedPage() {
  const { t, visited, visitedStat } = useApp();
  return <MarkedPage codes={visited} title={t('visited.title')} empty={t('visited.empty')} emptyId="visited-empty" counter={t('visited.count', visitedStat)} />;
}

/** A-141 (3) «Недочитані» («ще N ›» of the continue card): every unfinished article, the latest first, THE article rows with their bars; offline. */
export function UnfinishedPage() {
  const { t } = useApp();
  const { unfinished } = useReading();
  const navigate = useNavigate();
  return (
    <IonPage>
      <PageHeader title={t('reading.unfinished')} />
      <IonContent>
        {unfinished.length === 0 ? <div className="empty" data-testid="unfinished-empty">{t('reading.unfinished_empty')}</div> : (
          <IonList data-testid="unfinished">{unfinished.map((p) => <ArticleRow key={p.id} a={{ ...p.snap, body: null }} onSelect={(id) => navigate(`/articles?id=${id}`)} />)}</IonList>
        )}
      </IonContent>
    </IonPage>
  );
}
