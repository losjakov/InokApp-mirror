import { useMemo, useState } from 'react';
import { calendarStrip, calendarView } from '@/data/live/streams';
import { useApp } from '@/state/AppContext';
import { HtmlLite } from './HtmlLite';
import { MoreButton } from './MoreButton';
import { openLink } from '@/native/intents';

/** A-152 (cloud_43): the calendar's source - the site takes it from blagovist.info; shown only under the EXPANDED calendar */
export const CALENDAR_SOURCE = 'https://blagovist.info/';

/**
 * THE church calendar of the app (home and streams, A-15). A-25 #5 (R-24): the paragraphs and emphasis of /live/ on a phone —
 * folded = its summary paragraphs, «Читати повністю» = every paragraph (D41: the shared MoreButton); after 16:00 Kyiv the site already shows tomorrow, and the strip says so.
 * Without the body (an older export / cache): the one-line title strip (REVIEW cloud_02 D7, D3).
 */
export function CalendarStrip() {
  const { t, lang, live } = useApp();
  const [open, setOpen] = useState(false);
  const cal = live?.status.calendar ?? null;
  const view = useMemo(() => calendarView(cal, lang), [cal, lang]);
  const line = useMemo(() => (view ? null : calendarStrip(cal, lang)), [view, cal, lang]);
  if (view) {
    const shown = open ? view.paragraphs : view.paragraphs.slice(0, view.summary);
    return (
      <section className="streams__cal cal" aria-label={t('streams.calendar')} data-testid="calendar">
        {view.tomorrow && <p className="cal__note" data-testid="calendar-tomorrow">{t('calendar.tomorrow')}</p>}
        <HtmlLite html={shown.join('')} className="cal__body selectable" />
        {/* A-152 (variant A): «Джерело: blagovist.info» at the right, small and muted, ONLY when expanded; the link through THE external opener */}
        {open && (
          <p className="cal__source" data-testid="calendar-source"><span aria-hidden="true">{t('calendar.source')}</span>
            <a href={CALENDAR_SOURCE} onClick={(e) => { e.preventDefault(); void openLink(CALENDAR_SOURCE, lang); }} aria-label={`${t('calendar.source')}blagovist.info`} data-testid="calendar-source-link">blagovist.info</a>
          </p>
        )}
        {/* D41: THE more button (as the history, the related blocks, «Зараз в ефірі»); on «Головна» it folds back too */}
        {view.paragraphs.length > view.summary && (
          <MoreButton label={open ? t('common.collapse') : t('card.read_full')} onClick={() => setOpen((o) => !o)} expanded={open} testId="calendar-toggle" />
        )}
      </section>
    );
  }
  if (!line) return null;
  return (
    <button type="button" className={`streams__cal${open ? ' streams__cal--open' : ''}`} onClick={() => setOpen((o) => !o)} aria-expanded={open} aria-label={t('streams.calendar')} data-testid="calendar">
      <strong>{line.date}</strong> · {line.first}
      {line.rest && (open ? <> {line.rest} <span className="streams__more">{t('streams.less')}</span></> : <span className="streams__more"> {t('streams.more')}</span>)}
    </button>
  );
}
