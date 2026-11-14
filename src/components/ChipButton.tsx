import { IonChip } from '@ionic/react';
import type { ComponentProps, KeyboardEvent } from 'react';

/**
 * A-88: THE tappable chip (the filters' «clear one», the radius chips, «Єпархії», the map's scope): Ionic's `ion-chip` is a plain box -
 * TalkBack hears its words but not that it is a button, and a keyboard cannot reach it. Here: role button, in the focus order, Enter /
 * Space press it; `pressed` = the chosen one of a set (the radius).
 */
export function ChipButton({ pressed, onClick, ...rest }: Omit<ComponentProps<typeof IonChip>, 'onClick'> & { onClick: () => void; pressed?: boolean }) {
  const key = (e: KeyboardEvent) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick(); } };
  return <IonChip role="button" tabIndex={0} aria-pressed={pressed === undefined ? undefined : pressed ? 'true' : 'false'} onClick={onClick} onKeyDown={key} {...rest} />;
}
