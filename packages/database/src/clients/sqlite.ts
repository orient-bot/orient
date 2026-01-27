/**
 * SQLite Database Client
 *
 * Provides a type-safe database client using Drizzle ORM with SQLite.
 * Uses better-sqlite3 for synchronous operations with WAL mode for performance.
 */

import { drizzle } from 'drizzle-orm/better-sqlite3';
import Database from 'better-sqlite3';
import { createServiceLogger } from '@orientbot/core';
import * as schema from '../schema/sqlite/index.js';
import type { DatabaseConfig, DatabaseClient, Database as DrizzleDatabase } from './types.js';
import { getDefaultSqlitePath } from './types.js';
import { existsSync, mkdirSync } from 'fs';
import { dirname } from 'path';

const logger = createServiceLogger('sqlite-client');

// Database instance cache
let dbInstance: DrizzleDatabase | null = null;
let sqliteDb: Database.Database | null = null;

/**
 * Create a SQLite database client
 */
export function createSqliteClient(config?: DatabaseConfig): DatabaseClient {
  const filename = config?.filename || getDefaultSqlitePath();

  // Return cached instance if available
  if (dbInstance && sqliteDb) {
    return {
      db: dbInstance,
      checkConnection: checkSqliteConnection,
      close: closeSqliteConnection,
      executeRaw: executeSqliteRaw,
    };
  }

  // Ensure the directory exists
  const dir = dirname(filename);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
    logger.info('Created SQLite database directory', { dir });
  }

  // Create better-sqlite3 database with WAL mode for performance
  sqliteDb = new Database(filename);

  // Enable WAL mode for better concurrent read/write performance
  sqliteDb.pragma('journal_mode = WAL');

  // Enable foreign keys
  sqliteDb.pragma('foreign_keys = ON');

  // Optimize for performance
  sqliteDb.pragma('synchronous = NORMAL');
  sqliteDb.pragma('cache_size = -64000'); // 64MB cache
  sqliteDb.pragma('temp_store = MEMORY');

  // Create Drizzle instance with schema
  dbInstance = drizzle(sqliteDb, { schema });

  logger.info('SQLite connection established', { filename });

  return {
    db: dbInstance,
    checkConnection: checkSqliteConnection,
    close: closeSqliteConnection,
    executeRaw: executeSqliteRaw,
  };
}

/**
 * Get the SQLite database instance (singleton pattern)
 */
export function getSqliteDatabase(config?: DatabaseConfig): DrizzleDatabase {
  if (dbInstance) {
    return dbInstance;
  }

  const client = createSqliteClient(config);
  return client.db;
}

/**
 * Get the raw SQLite database for advanced queries
 */
export function getSqliteRawDb(): Database.Database {
  if (!sqliteDb) {
    createSqliteClient();
  }
  return sqliteDb!;
}

/**
 * Check database connectivity
 */
async function checkSqliteConnection(): Promise<boolean> {
  try {
    if (!sqliteDb) {
      return false;
    }
    sqliteDb.exec('SELECT 1');
    return true;
  } catch (error) {
    logger.error('SQLite connection check failed', { error });
    return false;
  }
}

/**
 * Close the database connection
 */
async function closeSqliteConnection(): Promise<void> {
  if (sqliteDb) {
    sqliteDb.close();
    sqliteDb = null;
    dbInstance = null;
    logger.info('SQLite connection closed');
  }
}

/**
 * Execute raw SQL query
 */
async function executeSqliteRaw<T = unknown>(query: string, params: unknown[] = []): Promise<T[]> {
  if (!sqliteDb) {
    throw new Error('SQLite client not initialized');
  }

  // Check if it's a SELECT query
  const isSelect = query.trim().toUpperCase().startsWith('SELECT');

  if (isSelect) {
    const stmt = sqliteDb.prepare(query);
    return stmt.all(...params) as T[];
  } else {
    const stmt = sqliteDb.prepare(query);
    stmt.run(...params);
    return [] as T[];
  }
}

/**
 * Reset the database instance (for testing)
 */
export function resetSqliteInstance(): void {
  if (sqliteDb) {
    sqliteDb.close();
  }
  dbInstance = null;
  sqliteDb = null;
}

// Export schema for use in queries
export { schema };
