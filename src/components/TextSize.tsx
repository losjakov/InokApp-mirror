import { IonButton, IonIcon } from '@ionic/react';
import { textDecrease, textIncrease } from './icons';
import { ARTICLE_SCALES } from '@/state/settings';
import { useApp } from '@/state/AppContext';

/**
 * A-23 #8: «A−» / «A+» at the right of an article's toolbar — five steps (85–150 %) ON TOP of the system font scale (rem-based),
 * remembered for every article; the end steps disable their button. Only the article's text follows (lead, body, captions).
 */
export function TextSizeButtons() {
  const { t, settings, setSettings } = useApp();
  const i = settings.articleScale;
  return (
    <>
      <IonButton onClick={() => void setSettings({ articleScale: i - 1 })} disabled={i <= 0} aria-label={t('articles.text_smaller')} title={t('articles.text_smaller')} data-testid="text-smaller">
        <IonIcon slot="icon-only" icon={textDecrease} aria-hidden="true" />
      </IonButton>
      <IonButton onClick={() => void setSettings({ articleScale: i + 1 })} disabled={i >= ARTICLE_SCALES.length - 1} aria-label={t('articles.text_larger')} title={t('articles.text_larger')} data-testid="text-larger">
        <IonIcon slot="icon-only" icon={textIncrease} aria-hidden="true" />
      </IonButton>
    </>
  );
}

/** The article text's scale factor for the current setting (a CSS variable on the article). */
export const articleScaleStyle = (i: number) => ({ '--inok-article-scale': String(ARTICLE_SCALES[i] ?? 1) }) as React.CSSProperties;
