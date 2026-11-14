import { IonNote } from '@ionic/react';

/**
 * A-88: THE quiet state line of a list («Немає мережі - показано збережене», «Дані ефіру можуть бути застарілі»): a polite live region
 * that is ALWAYS in the page (TalkBack announces a change of its text; a region inserted together with its text is often not read).
 */
export function StatusNote({ text, testId }: { text: string | null | false; testId?: string }) {
  return <div role="status" className="status-note">{text && <IonNote className="ion-padding-horizontal" color="medium" data-testid={testId}>{text}</IonNote>}</div>;
}
