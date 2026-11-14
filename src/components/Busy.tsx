import { IonSpinner } from '@ionic/react';
import type { ComponentProps } from 'react';
import { langFromTag, makeT } from '@/i18n';
import { useMaybeApp } from '@/state/AppContext';

/**
 * A-88: THE busy indicator - Ionic's spinner with a spoken name («Завантаження…»; axe `aria-progressbar-name`, TalkBack reads it).
 * Outside the app's context (the splash before the database) the device language names it.
 */
export function Busy(props: ComponentProps<typeof IonSpinner>) {
  const app = useMaybeApp();
  const t = app ? app.t : makeT(langFromTag(typeof navigator === 'undefined' ? undefined : navigator.language));
  return <IonSpinner {...props} aria-label={t('common.loading')} role="progressbar" />;
}
