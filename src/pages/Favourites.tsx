import { IonContent, IonList, IonPage } from '@ionic/react';
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { PageHeader } from '@/components/PageHeader';
import { MonasteryRow } from '@/components/MonasteryRow';
import { getMonasteriesInOrder } from '@/data/repo/monasteries';
import type { MonasteryListRow as Row } from '@/data/repo/types';
import { useApp } from '@/state/AppContext';

export function FavouritesPage() {
  const { db, t, favourites } = useApp();
  const navigate = useNavigate();
  const [rows, setRows] = useState<Row[]>([]);
  useEffect(() => {
    const codes = Array.from(favourites);
    getMonasteriesInOrder(db, codes).then(setRows); // A-44: the lavras first, the rest newest first
  }, [db, favourites]);
  return (
    <IonPage>
      <PageHeader title={t('favourites.title')} />
      <IonContent>
        {rows.length === 0 ? <div className="empty" data-testid="fav-empty">{t('favourites.empty')}</div> : (
          <IonList>{rows.map((r) => <MonasteryRow key={r.code} row={r} onSelect={(c) => navigate(`/monasteries/${c}`)} />)}</IonList>
        )}
      </IonContent>
    </IonPage>
  );
}
