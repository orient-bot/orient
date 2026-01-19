/**
 * Storage Database Service
 *
 * PostgreSQL database for storing mini-app key-value data.
 * Provides persistent storage for apps that declare the storage capability.
 */

import pg from 'pg';
import { createServiceLogger } from '@orient/core';

const { Pool } = pg;
const logger = createServiceLogger('storage-db');

export interface StorageEntry {
  appName: string;
  key: string;
  value: unknown;
  createdAt: Date;
  updatedAt: Date;
}

export class StorageDatabase {
  private pool: pg.Pool;
  private initialized: boolean = false;

  constructor(connectionString?: string) {
    const dbUrl =
      connectionString ||
      process.env.DATABASE_URL ||
      'postgresql://aibot:aibot123@localhost:5432/whatsapp_bot_0';

    this.pool = new Pool({
      connectionString: dbUrl,
      max: 10,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 5000,
    });

    this.pool.on('error', (err: Error) => {
      logger.error('Unexpected database pool error', { error: err.message });
    });

    logger.info('Storage database pool created', {
      connectionString: dbUrl.replace(/:[^:@]+@/, ':****@'),
    });
  }

  /**
   * Initialize the database (must be called before using)
   */
  async initialize(): Promise<void> {
    if (this.initialized) return;

    await this.initializeTables();
    this.initialized = true;
  }

  /**
   * Initialize database tables for storage
   */
  private async initializeTables(): Promise<void> {
    const client = await this.pool.connect();

    try {
      await client.query('BEGIN');

      // App storage table
      await client.query(`
        CREATE TABLE IF NOT EXISTS app_storage (
          id SERIAL PRIMARY KEY,
          app_name VARCHAR(255) NOT NULL,
          key VARCHAR(255) NOT NULL,
          value JSONB NOT NULL,
          created_at TIMESTAMPTZ DEFAULT NOW(),
          updated_at TIMESTAMPTZ DEFAULT NOW(),
          UNIQUE(app_name, key)
        )
      `);

      // Create indexes
      await client.query(`
        CREATE INDEX IF NOT EXISTS idx_app_storage_app_key ON app_storage(app_name, key);
        CREATE INDEX IF NOT EXISTS idx_app_storage_app_name ON app_storage(app_name);
      `);

      await client.query('COMMIT');
      logger.info('Storage database tables initialized');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  // ============================================
  // STORAGE OPERATIONS
  // ============================================

  /**
   * Set a value for a key
   */
  async set(appName: string, key: string, value: unknown): Promise<void> {
    await this.pool.query(
      `
      INSERT INTO app_storage (app_name, key, value)
      VALUES ($1, $2, $3)
      ON CONFLICT (app_name, key)
      DO UPDATE SET value = $3, updated_at = NOW()
    `,
      [appName, key, JSON.stringify(value)]
    );

    logger.debug('Storage set', { appName, key });
  }

  /**
   * Get a value by key
   */
  async get(appName: string, key: string): Promise<unknown | null> {
    const result = await this.pool.query(
      'SELECT value FROM app_storage WHERE app_name = $1 AND key = $2',
      [appName, key]
    );

    if (result.rows.length === 0) {
      return null;
    }

    return result.rows[0].value;
  }

  /**
   * Delete a key
   */
  async delete(appName: string, key: string): Promise<boolean> {
    const result = await this.pool.query(
      'DELETE FROM app_storage WHERE app_name = $1 AND key = $2',
      [appName, key]
    );

    const deleted = (result.rowCount || 0) > 0;
    if (deleted) {
      logger.debug('Storage deleted', { appName, key });
    }
    return deleted;
  }

  /**
   * List all keys for an app
   */
  async list(appName: string): Promise<string[]> {
    const result = await this.pool.query(
      'SELECT key FROM app_storage WHERE app_name = $1 ORDER BY key',
      [appName]
    );

    return result.rows.map((row) => row.key);
  }

  /**
   * Clear all storage for an app
   */
  async clear(appName: string): Promise<number> {
    const result = await this.pool.query('DELETE FROM app_storage WHERE app_name = $1', [appName]);

    const count = result.rowCount || 0;
    if (count > 0) {
      logger.info('Storage cleared', { appName, keysDeleted: count });
    }
    return count;
  }

  /**
   * Get all entries for an app (for debugging/admin)
   */
  async getAll(appName: string): Promise<StorageEntry[]> {
    const result = await this.pool.query(
      'SELECT app_name, key, value, created_at, updated_at FROM app_storage WHERE app_name = $1 ORDER BY key',
      [appName]
    );

    return result.rows.map((row) => ({
      appName: row.app_name,
      key: row.key,
      value: row.value,
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at),
    }));
  }

  /**
   * Close the database connection pool
   */
  async close(): Promise<void> {
    await this.pool.end();
    logger.info('Storage database connection pool closed');
  }
}

/**
 * Create a StorageDatabase instance
 */
export function createStorageDatabase(connectionString?: string): StorageDatabase {
  return new StorageDatabase(connectionString);
}
