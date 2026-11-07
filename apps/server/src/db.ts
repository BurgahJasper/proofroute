import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';

const SCHEMA = `
PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS sessions (
  id_hash TEXT PRIMARY KEY,
  csrf_token TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS cases (
  id TEXT PRIMARY KEY,
  owner_session TEXT NOT NULL,
  title TEXT NOT NULL,
  scenario_id TEXT,
  source_preference TEXT NOT NULL,
  input_mode TEXT NOT NULL,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  FOREIGN KEY (owner_session) REFERENCES sessions(id_hash)
);

CREATE TABLE IF NOT EXISTS case_versions (
  case_id TEXT NOT NULL,
  version INTEGER NOT NULL,
  reviewed_text TEXT NOT NULL,
  employer_id TEXT,
  role_reference TEXT,
  input_mode TEXT NOT NULL,
  created_at TEXT NOT NULL,
  latest_run_id TEXT,
  PRIMARY KEY (case_id, version),
  FOREIGN KEY (case_id) REFERENCES cases(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS runs (
  id TEXT PRIMARY KEY,
  case_id TEXT NOT NULL,
  version INTEGER NOT NULL,
  status TEXT NOT NULL,
  heartbeat_at TEXT,
  model_id TEXT,
  error_code TEXT,
  source_mode TEXT,
  analysis_mode TEXT,
  started_at TEXT NOT NULL,
  finished_at TEXT,
  idempotency_key TEXT,
  FOREIGN KEY (case_id, version) REFERENCES case_versions(case_id, version) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS evidence (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  FOREIGN KEY (run_id) REFERENCES runs(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS assessments (
  run_id TEXT PRIMARY KEY,
  payload_json TEXT NOT NULL,
  FOREIGN KEY (run_id) REFERENCES runs(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS events (
  run_id TEXT NOT NULL,
  sequence INTEGER NOT NULL,
  type TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY (run_id, sequence),
  FOREIGN KEY (run_id) REFERENCES runs(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS idempotency_keys (
  key TEXT PRIMARY KEY,
  owner_session TEXT NOT NULL,
  kind TEXT NOT NULL,
  response_json TEXT NOT NULL,
  created_at TEXT NOT NULL
);
`;

export type SqlValue = string | number | null;

export class Store {
  constructor(readonly db: DatabaseSync) {}

  get<T>(sql: string, ...params: SqlValue[]): T | undefined {
    return this.db.prepare(sql).get(...params) as T | undefined;
  }

  all<T>(sql: string, ...params: SqlValue[]): T[] {
    return this.db.prepare(sql).all(...params) as T[];
  }

  run(sql: string, ...params: SqlValue[]): void {
    this.db.prepare(sql).run(...params);
  }

  transaction<T>(fn: () => T): T {
    this.db.exec('BEGIN IMMEDIATE');
    try {
      const value = fn();
      this.db.exec('COMMIT');
      return value;
    } catch (error) {
      this.db.exec('ROLLBACK');
      throw error;
    }
  }

  close(): void {
    this.db.close();
  }
}

export function openDatabase(filePath: string): Store {
  mkdirSync(path.dirname(filePath), { recursive: true });
  const db = new DatabaseSync(filePath);
  db.exec('PRAGMA foreign_keys = ON');
  db.exec(SCHEMA);
  const now = new Date().toISOString();
  db.prepare(
    `UPDATE runs SET status = 'interrupted', error_code = 'INTERRUPTED', finished_at = COALESCE(finished_at, ?) WHERE status IN ('queued', 'running')`,
  ).run(now);
  purgeExpired(new Store(db), now);
  return new Store(db);
}

export function purgeExpired(store: Store, now = new Date().toISOString()): void {
  store.db.exec('PRAGMA foreign_keys = ON');
  store.run('DELETE FROM cases WHERE expires_at <= ?', now);
  store.run(
    'DELETE FROM sessions WHERE expires_at <= ? AND id_hash NOT IN (SELECT owner_session FROM cases)',
    now,
  );
  store.run('DELETE FROM idempotency_keys WHERE created_at <= ?', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString());
}

export function resolveDatabasePath(root: string, configured: string): string {
  return path.isAbsolute(configured) ? configured : path.resolve(root, configured);
}
