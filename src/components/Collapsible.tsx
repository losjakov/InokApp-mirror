import { MoreButton } from './MoreButton';
import { useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { useT } from '@/state/AppContext';

/** A-18: a long text shows its first paragraphs and «Читати повністю» (as the card page of the site); a short one shows whole.
 *  A-23 #5: everything inside (the history AND its «Джерела») opens together; the button is THE more button. */
export function Collapsible({ children, testId }: { children: ReactNode; testId?: string }) {
  const { t } = useT();
  const box = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [long, setLong] = useState(false);
  useLayoutEffect(() => {
    const el = box.current;
    if (el && !open) setLong(el.scrollHeight > el.clientHeight + 24);
  }, [children, open]);
  return (
    <div className="collapsible" data-open={open ? '1' : '0'} data-testid={testId}>
      <div ref={box} className={open ? undefined : 'collapsible__box'}>{children}</div>
      {long && !open && (
        <MoreButton label={t('card.read_full')} onClick={() => setOpen(true)} testId={testId && `${testId}-more`} />
      )}
    </div>
  );
}
