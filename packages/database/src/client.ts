/**
 * Drizzle Database Client
 *
 * Provides a type-safe database client using Drizzle ORM with PostgreSQL.
 * Uses connection pooling and automatic reconnection.
 */

import { drizzle, PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { createServiceLogger } from '@orient/core';
import * as schema from './schema/index.js';

const logger = createServiceLogger('drizzle-db');

// Default database URL
const DEFAULT_DATABASE_URL = 'postgresql://aibot:aibot123@localhost:5432/whatsapp_bot_0';

// Database instance cache
let dbInstance: PostgresJsDatabase<typeof schema> | null = null;
let sqlClient: postgres.Sql | null = null;

/**
 * Database configuration options
 */
export interface DatabaseConfig {
  connectionString?: string;
  maxConnections?: number;
  idleTimeout?: number;
  connectTimeout?: number;
}

/**
 * Get or create the database instance
 * Uses a singleton pattern for connection pooling
 */
export function getDatabase(config?: DatabaseConfig): PostgresJsDatabase<typeof schema> {
  if (dbInstance) {
    return dbInstance;
  }

  const connectionString =
    config?.connectionString || process.env.DATABASE_URL || DEFAULT_DATABASE_URL;

  // Create postgres.js client with connection pooling
  sqlClient = postgres(connectionString, {
    max: config?.maxConnections ?? 10,
    idle_timeout: config?.idleTimeout ?? 30,
    connect_timeout: config?.connectTimeout ?? 5,
    onnotice: () => {}, // Suppress notices
  });

  // Create Drizzle instance with schema
  dbInstance = drizzle(sqlClient, { schema });

  logger.info('Database connection established', {
    connectionString: connectionString.replace(/:[^:@]+@/, ':****@'),
  });

  return dbInstance;
}

/**
 * Get the raw SQL client for advanced queries
 */
export function getSqlClient(): postgres.Sql {
  if (!sqlClient) {
    getDatabase(); // Initialize if not already
  }
  return sqlClient!;
}

/**
 * Close the database connection
 * Should be called on application shutdown
 */
export async function closeDatabase(): Promise<void> {
  if (sqlClient) {
    await sqlClient.end();
    sqlClient = null;
    dbInstance = null;
    logger.info('Database connection closed');
  }
}

/**
 * Reset the database instance (for testing)
 */
export function resetDatabaseInstance(): void {
  dbInstance = null;
  sqlClient = null;
}

/**
 * Check database connectivity
 */
export async function checkDatabaseConnection(): Promise<boolean> {
  try {
    const sql = getSqlClient();
    await sql`SELECT 1`;
    return true;
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
  const client = getSqlClient();
  // Use unsafe for raw SQL execution
  return client.unsafe(query, params as never[]) as unknown as T[];
}

// Export schema for use in queries
export { schema };

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
  ilike,
  inArray,
  isNull,
  isNotNull,
} from 'drizzle-orm';
