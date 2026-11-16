import { IonIcon } from '@ionic/react';
import { useId } from 'react';
import { tileRow } from '@/components/sideRow';
import { SOCIAL_LINKS } from '@/data/links/social';
import { openLink } from '@/native/intents';
import { useApp } from '@/state/AppContext';

/**
 * A-120 (1), variant В: «У соціальних мережах» - THE block of both «Ще» screens («Про комісію», «Про застосунок»), the LAST of their content:
 * a level-2 heading and three captioned buttons in one row (the home tiles' look and rule, D56: a caption that does not fit its tile = one
 * per row). Each button is a LINK named by its caption (TalkBack / VoiceOver: «Telegram, посилання»), the logo hidden from the reader;
 * the address opens by THE openLink (the system's browser tab; the network's app where the system hands it over).
 */
export function SocialLinks() {
  const { t, lang } = useApp();
  const head = useId();
  return (
    <section className="social" aria-labelledby={head} data-testid="social">
      <h2 id={head} className="inok-heading">{t('social.title')}</h2>
      <div className="tiles tiles--3" ref={tileRow} data-testid="social-row">
        {SOCIAL_LINKS.map((s) => (
          <a key={s.id} href={s.url} className={`tile social__btn social__btn--${s.id}`} data-testid={`social-${s.id}`}
            onClick={(e) => { e.preventDefault(); void openLink(s.url, lang); }}>
            <IonIcon icon={s.icon} aria-hidden="true" />
            <span>{s.name}</span>
          </a>
        ))}
      </div>
    </section>
  );
}
