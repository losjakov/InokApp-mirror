import { IonIcon } from '@ionic/react';
import { openOutline } from 'ionicons/icons';
import type { ReactNode } from 'react';
import { openLink } from '@/native/intents';
import { useT } from '@/state/AppContext';

interface FactProps {
  /** the leading column: an icon, a number (a source's n) or nothing — the column is ALWAYS there (D25: one text edge) */
  lead?: string | number;
  label?: string;
  children: ReactNode;
  /** a muted line under the value (the contacts' messenger note, a source's publication) */
  caption?: string;
  onClick?: () => void;
  /** a mark at the end (the external-link sign) */
  end?: ReactNode;
  className?: string;
  /** A-88: words only a screen reader hears, after the visible ones (where the tap leads); the name stays the visible text + this */
  hint?: string;
  testId?: string;
}

/** THE fact row (A-15, D25): every row of a card, the contacts, the links — lead column · label over value (+ caption) · end mark. */
function FactRow({ lead, label, children, caption, onClick, end, className, hint, testId }: FactProps) {
  const body = (
    <>
      <span className="info__lead" aria-hidden="true">
        {typeof lead === 'number' ? <span className="info__num">{lead}</span> : lead ? <IonIcon icon={lead} className="info__icon" aria-hidden="true" /> : null}
      </span>
      <span className="info__text">
        {label && <span className="info__label">{label}</span>}
        <span className="info__value">{children}</span>
        {caption && <span className="info__label">{caption}</span>}
        {hint && <span className="sr-only">{` (${hint})`}</span>}
      </span>
      {end}
    </>
  );
  const cls = ['info', onClick ? 'info--tap' : '', className ?? ''].filter(Boolean).join(' ');
  return onClick
    ? <button type="button" className={cls} onClick={onClick} data-testid={testId}>{body}</button>
    : <div className={cls} data-testid={testId}>{body}</div>;
}

/** A card / contacts fact (the site's «Офіційна назва: …», «Телефони: …», «GPS …»); a tappable one is a button. */
export function InfoRow({ label, children, onClick, icon, caption, testId }: {
  label?: string; children: ReactNode; onClick?: () => void; icon?: string; caption?: string; testId?: string;
}) {
  return <FactRow lead={icon} label={label} caption={caption} onClick={onClick} testId={testId}>{children}</FactRow>;
}

/**
 * THE row of a link that LEAVES the app (A-23 #1, A-15): the card's «Сайт», «Додаткова інформація на інтернет-ресурсах», the
 * history's «Джерела», «Відкрити на inok.info» (D28). The fact row + the external-link mark at the end (Material open_in_new);
 * ≥ 48 dp to tap; the screen reader hears that it opens in the browser.
 */
export function ExternalLinkRow({ url, onOpen, title, label, caption, lead, testId }: {
  /** absent (and no onOpen): the same row, not tappable (a source without a link) */
  url?: string | null;
  /** D37: a way out that is not a URL — the chooser of the maps apps («Відкрити в застосунку карт») */
  onOpen?: () => void;
  title: string; label?: string; caption?: string; lead?: string | number; testId?: string;
}) {
  const { t, lang } = useT();
  const open = onOpen ?? (url ? () => void openLink(url, lang) : undefined);
  return (
    <FactRow lead={lead} label={label} caption={caption} className="info--ext" testId={testId}
      onClick={open}
      hint={open ? t(onOpen ? 'common.opens_app' : 'common.opens_browser') : undefined}
      end={open ? <IonIcon icon={openOutline} className="info__ext" aria-hidden="true" /> : undefined}>
      {title}
    </FactRow>
  );
}
