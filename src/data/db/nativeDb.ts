import { CapacitorSQLite, SQLiteConnection, type SQLiteDBConnection } from '@capacitor-community/sqlite';
import type { Db, Row, SqlValue } from './types';

const DB_NAME = 'inok';

/** @capacitor-community/sqlite on the device (Android bundles its own SQLite via sqlcipher-android). */
export async function openNativeDb(): Promise<Db> {
  const sqlite = new SQLiteConnection(CapacitorSQLite);
  const consistent = (await sqlite.checkConnectionsConsistency()).result ?? false;
  const exists = (await sqlite.isConnection(DB_NAME, false)).result ?? false;
  const conn: SQLiteDBConnection =
    consistent && exists
      ? await sqlite.retrieveConnection(DB_NAME, false)
      : await sqlite.createConnection(DB_NAME, false, 'no-encryption', 1, false);
  await conn.open();
  let inTx = false;
  return {
    async exec(sql) {
      await conn.execute(sql, !inTx);
    },
    async run(sql, params = []) {
      await conn.run(sql, params as any[], !inTx);
    },
    async query<T extends object = Row>(sql: string, params: SqlValue[] = []) {
      const r = await conn.query(sql, params as any[]);
      return (r.values ?? []) as T[];
    },
    async transaction(fn) {
      if (inTx) throw new Error('nested transaction');
      inTx = true;
      await conn.beginTransaction();
      try {
        await fn();
        await conn.commitTransaction();
      } catch (e) {
        await conn.rollbackTransaction();
        throw e;
      } finally {
        inTx = false;
      }
    },
    async close() {
      await sqlite.closeConnection(DB_NAME, false);
    },
  };
}
