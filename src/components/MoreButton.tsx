import { IonButton } from '@ionic/react';
import { Busy } from '@/components/Busy';

/**
 * THE «more» button of the app (A-15; owner 01.11 A-23 #5: «Читати повністю» in the style of «Показати більше»): the feed's
 * «Показати більше», a card block's «Показати більше», the history's «Читати повністю», the calendar (D41) and «Зараз в ефірі» — one look,
 * one place in the layout. `expanded` (a block that folds back, on «Головна»): the button says so to a screen reader.
 */
export function MoreButton({ label, onClick, busy, testId, expanded }: { label: string; onClick: () => void; busy?: boolean; testId?: string; expanded?: boolean }) {
  return (
    <div className="more-btn">
      <IonButton fill="outline" expand="block" disabled={busy} onClick={onClick} data-testid={testId} aria-expanded={expanded === undefined ? undefined : String(expanded) as 'true' | 'false'}>{busy ? <Busy /> : label}</IonButton>
    </div>
  );
}
