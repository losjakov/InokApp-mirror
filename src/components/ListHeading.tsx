import { IonLabel, IonListHeader } from '@ionic/react';
import type { ReactNode, Ref } from 'react';

/**
 * A-88: THE section head inside a list («Зараз в ефірі», «Поруч», «Нове на сайті», «Онлайн · 3», «Трансляції»): an item of the list (a
 * list may own only items - axe `aria-required-children`) whose words are a level-2 heading under the page's h1 (TalkBack's heading
 * navigation jumps section to section); `end` = its own link («Усі»).
 */
export function ListHeading({ label, end, className, testId, headRef }: { label: ReactNode; end?: ReactNode; className?: string; testId?: string; headRef?: Ref<HTMLIonListHeaderElement> }) {
  return (
    <IonListHeader ref={headRef} role="listitem" className={className} data-testid={testId}>
      <IonLabel role="heading" aria-level={2}>{label}</IonLabel>{end}
    </IonListHeader>
  );
}

/** A-88: a control that sits INSIDE a list but is not a row (the «Ще N» button of «Головна», the channel search): an item of the list, so
 *  the list owns only items (axe `aria-required-children`); nothing changes on screen */
export function ListBox({ children }: { children: ReactNode }) {
  return <div role="listitem">{children}</div>;
}
