import type { Db } from '@/data/db/types';

/**
 * A-133 «Я ТУТ БУВ» - the person's marks, ONLY on the phone (nothing is sent): the house's code + the date of the mark, in their own table
 * beside «Обрані» (`favourite`). Kept through a data refresh (the import rebuilds the directory tables only), an app update and A-132's
 * reset_data (src/data/repo/resetData.ts). A mark of a house no longer in the directory is KEPT (it may come back) and simply not counted.
 */
export const listVisited = async (db: Db): Promise<number[]> =>
  (await db.query<{ code: number }>('SELECT code FROM visited ORDER BY at DESC, code')).map((r) => r.code);

/** On -> off -> on: one row per house at most (PRIMARY KEY); returns the state after the tap. */
export async function toggleVisited(db: Db, code: number, now: number = Date.now()): Promise<boolean> {
  if ((await db.query('SELECT 1 AS x FROM visited WHERE code = ?', [code])).length > 0) {
    await db.run('DELETE FROM visited WHERE code = ?', [code]);
    return false;
  }
  await db.run('INSERT OR REPLACE INTO visited(code, at) VALUES (?, ?)', [code, now]);
  return true;
}

/** «Відвідано {n} з {m}»: n = marked houses that ARE in the directory, m = the directory's houses. */
export async function visitedCount(db: Db): Promise<{ n: number; m: number }> {
  const n = (await db.query<{ n: number }>('SELECT COUNT(*) AS n FROM visited v JOIN monastery m ON m.code = v.code'))[0]?.n ?? 0;
  const m = (await db.query<{ n: number }>('SELECT COUNT(*) AS n FROM monastery'))[0]?.n ?? 0;
  return { n, m };
}
