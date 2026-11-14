export type SqlValue = string | number | null | Uint8Array;
export type Row = Record<string, SqlValue>;

/** The one SQL surface the app uses. Two adapters: sqlite-wasm (browser + Node tests) and the Capacitor plugin (device). */
export interface Db {
  /** Several statements, no parameters (DDL). */
  exec(sql: string): Promise<void>;
  run(sql: string, params?: SqlValue[]): Promise<void>;
  query<T extends object = Row>(sql: string, params?: SqlValue[]): Promise<T[]>;
  /** BEGIN … COMMIT, ROLLBACK on throw. Not re-entrant. */
  transaction(fn: () => Promise<void>): Promise<void>;
  close(): Promise<void>;
}
