import { IonIcon } from '@ionic/react';

/**
 * THE toggle of the person's own marks on a card - «Обране» (the star) and «Я тут був» (A-133) - ONE component (A-15).
 * cloud_41 (measured): an `IonButton`'s `aria-pressed` reached its inner <button> only at load - after a tap the screen reader still said
 * the OLD state (host attribute moved once; `aria-pressed` inner = "false" after the toggle, browser probe). A native <button> carries its
 * own `aria-pressed`, so TalkBack / VoiceOver say «… , увімкнено / вимкнено» at every tap. 48 dp, the toolbar's colour, the focus ring.
 */
export function MarkToggle({ on, label, icon, onTap, testId, kind }: { on: boolean; label: string; icon: string; onTap: () => void; testId: string; kind: 'fav' | 'visited' }) {
  return (
    <button type="button" className={`mark-toggle mark-toggle--${kind}${on ? ' mark-toggle--on' : ''}`} aria-pressed={on} aria-label={label}
      data-on={on ? '1' : '0'} data-testid={testId} onClick={onTap}>
      <IonIcon icon={icon} aria-hidden="true" />
    </button>
  );
}
