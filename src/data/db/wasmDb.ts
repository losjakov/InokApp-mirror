import type { Db, Row, SqlValue } from './types';

type Sqlite3 = any;
let modulePromise: Promise<Sqlite3> | null = null;

async function loadSqlite3(): Promise<Sqlite3> {
  if (!modulePromise) {
    modulePromise = import('@sqlite.org/sqlite-wasm').then((m: any) => m.default());
  }
  return modulePromise;
}

/** sqlite-wasm in the main thread: in-memory. Used by the browser build (fixtures mode) and by unit tests. */
export async function openWasmDb(): Promise<Db> {
  const sqlite3 = await loadSqlite3();
  const db = new sqlite3.oo1.DB(':memory:', 'c');
  let inTx = false;
  const api: Db = {
    async exec(sql) {
      db.exec(sql);
    },
    async run(sql, params = []) {
      db.exec({ sql, bind: params });
    },
    async query<T extends object = Row>(sql: string, params: SqlValue[] = []) {
      const rows: T[] = [];
      db.exec({ sql, bind: params, rowMode: 'object', callback: (r: T) => rows.push({ ...r }) });
      return rows;
    },
    async transaction(fn) {
      if (inTx) throw new Error('nested transaction');
      inTx = true;
      db.exec('BEGIN');
      try {
        await fn();
        db.exec('COMMIT');
      } catch (e) {
        db.exec('ROLLBACK');
        throw e;
      } finally {
        inTx = false;
      }
    },
    async close() {
      db.close();
    },
  };
  return api;
}
