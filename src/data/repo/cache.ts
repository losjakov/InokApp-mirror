import type { Db } from '@/data/db/types';

/** The last answer of a live endpoint, so it renders offline (REF_app_architecture §2.3). */
export async function cacheGet<T>(db: Db, key: string): Promise<{ value: T; fetchedAt: number } | null> {
  const r = await db.query<{ json: string; fetched_at: number }>('SELECT json, fetched_at FROM cache WHERE key = ?', [key]);
  if (!r[0]) return null;
  try {
    return { value: JSON.parse(r[0].json) as T, fetchedAt: r[0].fetched_at };
  } catch {
    return null;
  }
}

export const cacheSet = (db: Db, key: string, value: unknown): Promise<void> =>
  db.run('INSERT OR REPLACE INTO cache(key, json, fetched_at) VALUES (?,?,?)', [key, JSON.stringify(value), Date.now()]);
