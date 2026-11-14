import type { Db } from '@/data/db/types';
import type { Lang } from '@/i18n';
import type { ChannelRow } from './types';

// the «єпархія, область» line /live/ prints under a channel (R-13: the house's when linked, else the channel's own)
const COLS = `c.*, e.name_uk AS eparchy_uk, e.name_ru AS eparchy_ru, e.name_en AS eparchy_en,
  o.name_uk AS oblast_uk, o.name_ru AS oblast_ru, o.name_en AS oblast_en`;
const FROM = `FROM channel c LEFT JOIN eparchy e ON e.id = c.eparchy_id LEFT JOIN oblast o ON o.id = c.oblast_id`;
const LANGS: Lang[] = ['uk', 'ru', 'en'];

/** The /live/ page's ONE order in the app's language (R-13 `sort_lang`; channels the page does not show come last). */
export const listChannels = (db: Db, lang: Lang): Promise<ChannelRow[]> => {
  const s = `c.sort_${LANGS.includes(lang) ? lang : 'uk'}`;
  return db.query<ChannelRow>(`SELECT ${COLS} ${FROM} ORDER BY ${s} IS NULL, ${s}, c.id`);
};

export const getChannelOfMonastery = async (db: Db, code: number): Promise<ChannelRow | null> =>
  (await db.query<ChannelRow>(`SELECT ${COLS} ${FROM} WHERE c.monastery_code = ? LIMIT 1`, [code]))[0] ?? null;
