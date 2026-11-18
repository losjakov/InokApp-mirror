import type { Db } from '@/data/db/types';
import { DIRECTORY_TABLES } from '@/data/db/schema';

/**
 * A-132 (contract R-58 action `reset_data`): the person's downloaded data goes, the person's OWN things stay. Cleared: the directory
 * tables (+ the search index), what the downloads remember (`export_version` & co., the last check), the kept answers of the live
 * endpoints (`cache`, the kept config included - the next start reads it anew), the article cache. KEPT, never touched: «Обрані»
 * (`favourite`), «Я тут був» (`visited`), the settings (Preferences), the person's own ratings / hidden comments, the install's App Attest
 * key (meta `install_id`, `attest_*`). The saved photo files are cleared by the caller (`clearSavedPhotos`, the device's file store).
 */
export const RESET_TABLES: readonly string[] = [...DIRECTORY_TABLES, 'monastery_fts', 'cache', 'article'];
export const RESET_META: readonly string[] = ['export_version', 'contract_version', 'imported_at', 'last_check'];
/** never cleared by a reset (the unit pins it) */
export const KEPT_TABLES: readonly string[] = ['favourite', 'visited', 'settings', 'article_rating', 'comment_hidden', 'meta'];

export async function resetData(db: Db): Promise<void> {
  const have = new Set((await db.query<{ name: string }>("SELECT name FROM sqlite_master WHERE type IN ('table')")).map((r) => r.name));
  for (const t of RESET_TABLES) if (have.has(t)) await db.run(`DELETE FROM ${t}`);
  for (const k of RESET_META) await db.run('DELETE FROM meta WHERE key = ?', [k]);
}
