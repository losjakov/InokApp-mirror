import { star, starOutline } from 'ionicons/icons';
import { useCallback } from 'react';
import { FLASH_MS, useToast } from './toast';
import { MarkToggle } from './MarkToggle';
import { useT } from '@/state/AppContext';
import { useReading } from '@/state/reading';

/**
 * A-141 AMENDMENT (owner 19.11 19:22, «сообщение как в монастырях»): THE message of BOTH stars - the monastery card's and the article's
 * (and the long-press sheets' «В обране» / «Прибрати»): the same keys, the same ~2 s toast above the tab bar (A-96 W-6, role status).
 */
export function useFavToast(): (added: boolean) => void {
  const { t } = useT();
  const toast = useToast();
  return useCallback((added: boolean) => toast(t(added ? 'card.favourite_added' : 'card.favourite_removed'), { duration: FLASH_MS, testId: 'fav-toast' }), [t, toast]);
}

/** A-133: THE message of «Я тут був» (the card's toggle and the row's sheet) - with the counter after the tap */
export function useVisitedToast(): (r: { on: boolean; n: number; m: number }) => void {
  const { t } = useT();
  const toast = useToast();
  return useCallback((r) => toast(t(r.on ? 'visited.marked_toast' : 'visited.removed_toast', { n: r.n, m: r.m }), { duration: FLASH_MS, testId: 'visited-toast' }), [t, toast]);
}

/** A-141 (1): the article screen's star after «A− A+» (phone toolbar; the wide screen's toolbar too) - THE card's toggle (`MarkToggle`). */
export function ArticleStar({ id }: { id: number }) {
  const { t } = useT();
  const { saved, toggleSaved } = useReading();
  const flash = useFavToast();
  const on = saved.has(id);
  const tap = async () => { const r = await toggleSaved(id); if (r !== null) flash(r); };
  return <MarkToggle kind="fav" on={on} label={on ? t('card.favourite_remove') : t('card.favourite_add')} icon={on ? star : starOutline} onTap={() => void tap()} testId="article-fav" />;
}
