/**
 * Database Client Type Definitions
 *
 * SQLite-only database client types.
 */

import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import * as schema from '../schema/sqlite/index.js';

/**
 * Database configuration options
 */
export interface DatabaseConfig {
  /** SQLite database file path */
  filename?: string;
}

/**
 * SQLite database instance type with full schema
 */
export type Database = BetterSQLite3Database<typeof schema>;

/**
 * Database client interface
 */
export interface DatabaseClient {
  /** Get the Drizzle database instance */
  db: Database;
  /** Check database connectivity */
  checkConnection(): Promise<boolean>;
  /** Close the database connection */
  close(): Promise<void>;
  /** Execute raw SQL query */
  executeRaw<T = unknown>(query: string, params?: unknown[]): Promise<T[]>;
}

/**
 * Get default database path for SQLite
 */
export function getDefaultSqlitePath(): string {
  return process.env.SQLITE_DATABASE || './data/orient.db';
}
