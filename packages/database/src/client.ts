/**
 * Drizzle Database Client
 *
 * Provides a type-safe database client using Drizzle ORM with SQLite.
 * SQLite is used for both development and production - simple, fast, reliable.
 */

import { createServiceLogger } from '@orient-bot/core';
import type BetterSqlite3 from 'better-sqlite3';
import type { DatabaseConfig, Database, DatabaseClient } from './clients/types.js';
import { getDefaultSqlitePath } from './clients/types.js';
import {
  createSqliteClient,
  getSqliteDatabase,
  getSqliteRawDb,
  resetSqliteInstance,
} from './clients/sqlite.js';

// Re-export types
export type { DatabaseConfig, Database, DatabaseClient } from './clients/types.js';
export { getDefaultSqlitePath } from './clients/types.js';

const logger = createServiceLogger('drizzle-db');

// Database client cache
let cachedClient: DatabaseClient | null = null;

/**
 * Get or create the database client
 * Uses a singleton pattern for connection reuse
 *
 * Note: This is a synchronous function since SQLite operations are synchronous.
 * For backwards compatibility, it can also be called with await.
 */
export function getDatabase(config?: DatabaseConfig): Database {
  if (cachedClient) {
    return cachedClient.db;
  }

  cachedClient = createSqliteClient({
    filename: config?.filename || getDefaultSqlitePath(),
  });

  logger.info('Using SQLite database');
  return cachedClient.db;
}

/**
 * Get the database client (for advanced operations)
 */
export function getDatabaseClient(config?: DatabaseConfig): DatabaseClient {
  if (!cachedClient) {
    getDatabase(config);
  }
  return cachedClient!;
}

/**
 * Close the database connection
 * Should be called on application shutdown
 */
export async function closeDatabase(): Promise<void> {
  if (cachedClient) {
    await cachedClient.close();
    cachedClient = null;
    logger.info('Database connection closed');
  }
}

/**
 * Reset the database instance (for testing)
 */
export function resetDatabaseInstance(): void {
  resetSqliteInstance();
  cachedClient = null;
}

/**
 * Check database connectivity
 */
export async function checkDatabaseConnection(): Promise<boolean> {
  try {
    if (!cachedClient) {
      getDatabase();
    }
    return await cachedClient!.checkConnection();
  } catch (error) {
    logger.error('Database connection check failed', { error });
    return false;
  }
}

/**
 * Execute raw SQL (for migrations and complex queries)
 */
export async function executeRawSql<T = unknown>(
  query: string,
  params: unknown[] = []
): Promise<T[]> {
  if (!cachedClient) {
    getDatabase();
  }
  return cachedClient!.executeRaw<T>(query, params);
}

/**
 * Get the raw SQLite database for advanced operations
 */
export function getRawSqliteDb(): BetterSqlite3.Database {
  return getSqliteRawDb();
}

// Export schema (SQLite tables + common types)
export * as schema from './schema/index.js';

// Export Drizzle utilities
export {
  eq,
  and,
  or,
  desc,
  asc,
  sql,
  count,
  sum,
  avg,
  min,
  max,
  like,
  inArray,
  isNull,
  isNotNull,
  lt,
  lte,
  gt,
  gte,
} from 'drizzle-orm';

// Re-export for backwards compatibility
export { getSqliteDatabase, getSqliteRawDb };
