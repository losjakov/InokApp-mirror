/** The ONE long-date formatter of the app (A-15): «25 жовтня 2026 р.» / «25 октября 2026 г.» / «October 25, 2026» -
 *  articles, comments, the card's «Відомості уточнено», the refresh line. N3 (REVIEW cloud_21): the year mark never stands
 *  alone on a line - the space before «р.» / «г.» is a no-break space (U+00A0). An unparsable ISO string comes back as is.
 *  F1 (REVIEW cloud_24, A-79 3): a date FROM THE SITE is the site's day - formatted in Kyiv time whatever the device's zone
 *  (1832 `2026-05-23T21:00:00Z` = «24 травня 2026 р.», as inok.info prints it). Only the refresh line (the device's own clock)
 *  passes `DEVICE_TZ`. */
/**
 * A-48 (the reference phone's white screen): THE time zone of Kyiv is written `Europe/Kiev`. The name `Europe/Kyiv` exists only
 * since IANA tzdata 2022b (08.2022); Chrome 98 (02.2022, our floor 89-98) throws «RangeError: Invalid time zone» on it - and the
 * calendar strip on Home called it when the live status arrived, 2-3 s after Home, every launch. `Europe/Kiev` is valid in every
 * engine (the canonical name before 2022b, a kept link after it). eslint.config.js forbids the new spelling.
 */
export const KYIV_TZ = 'Europe/Kiev';

/** The device's own zone (Intl's default) - for the app's own moments only (the refresh line), never for a site date. */
export const DEVICE_TZ = undefined;

const YEAR_MARK = /\s+(р\.|г\.)/gu;

export function longDate(at: string | number | Date, lang: string, timeZone: string | undefined = KYIV_TZ): string {
  const d = at instanceof Date ? at : new Date(at);
  if (Number.isNaN(d.getTime())) return String(at);
  return new Intl.DateTimeFormat(lang, { day: 'numeric', month: 'long', year: 'numeric', timeZone }).format(d).replace(YEAR_MARK, '\u00a0$1');
}
