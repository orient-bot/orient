/**
 * Storage Database Service
 *
 * SQLite database for storing mini-app key-value data using Drizzle ORM.
 * Provides persistent storage for apps that declare the storage capability.
 */

import { createServiceLogger } from '@orientbot/core';
import { getDatabase, eq, and, schema } from '@orientbot/database';
import type { Database } from '@orientbot/database';

const logger = createServiceLogger('storage-db');

export interface StorageEntry {
  appName: string;
  key: string;
  value: unknown;
  createdAt: Date;
  updatedAt: Date;
}

export class StorageDatabase {
  private _db: Database | null = null;

  private get db(): Database {
    if (!this._db) {
      this._db = getDatabase();
    }
    return this._db;
  }

  /**
   * Initialize the database (no-op for SQLite - schema managed via migrations)
   */
  async initialize(): Promise<void> {
    logger.info('Storage database initialized (SQLite)');
  }

  // ============================================
  // STORAGE OPERATIONS
  // ============================================

  /**
   * Set a value for a key
   */
  async set(appName: string, key: string, value: unknown): Promise<void> {
    const jsonValue = JSON.stringify(value);

    await this.db
      .insert(schema.appStorage)
      .values({
        appName,
        key,
        value: jsonValue,
      })
      .onConflictDoUpdate({
        target: [schema.appStorage.appName, schema.appStorage.key],
        set: {
          value: jsonValue,
          updatedAt: new Date(),
        },
      });

    logger.debug('Storage set', { appName, key });
  }

  /**
   * Get a value by key
   */
  async get(appName: string, key: string): Promise<unknown | null> {
    const result = await this.db
      .select({ value: schema.appStorage.value })
      .from(schema.appStorage)
      .where(and(eq(schema.appStorage.appName, appName), eq(schema.appStorage.key, key)))
      .limit(1);

    if (result.length === 0) {
      return null;
    }

    try {
      return JSON.parse(result[0].value);
    } catch {
      return result[0].value;
    }
  }

  /**
   * Delete a key
   */
  async delete(appName: string, key: string): Promise<boolean> {
    const result = await this.db
      .delete(schema.appStorage)
      .where(and(eq(schema.appStorage.appName, appName), eq(schema.appStorage.key, key)))
      .returning({ id: schema.appStorage.id });

    const deleted = result.length > 0;
    if (deleted) {
      logger.debug('Storage deleted', { appName, key });
    }
    return deleted;
  }

  /**
   * List all keys for an app
   */
  async list(appName: string): Promise<string[]> {
    const result = await this.db
      .select({ key: schema.appStorage.key })
      .from(schema.appStorage)
      .where(eq(schema.appStorage.appName, appName))
      .orderBy(schema.appStorage.key);

    return result.map((row) => row.key);
  }

  /**
   * Clear all storage for an app
   */
  async clear(appName: string): Promise<number> {
    const result = await this.db
      .delete(schema.appStorage)
      .where(eq(schema.appStorage.appName, appName))
      .returning({ id: schema.appStorage.id });

    const count = result.length;
    if (count > 0) {
      logger.info('Storage cleared', { appName, keysDeleted: count });
    }
    return count;
  }

  /**
   * Get all entries for an app (for debugging/admin)
   */
  async getAll(appName: string): Promise<StorageEntry[]> {
    const result = await this.db
      .select()
      .from(schema.appStorage)
      .where(eq(schema.appStorage.appName, appName))
      .orderBy(schema.appStorage.key);

    return result.map((row) => ({
      appName: row.appName,
      key: row.key,
      value: (() => {
        try {
          return JSON.parse(row.value);
        } catch {
          return row.value;
        }
      })(),
      createdAt: row.createdAt || new Date(),
      updatedAt: row.updatedAt || new Date(),
    }));
  }

  /**
   * Close the database connection (no-op for SQLite singleton)
   */
  async close(): Promise<void> {
    logger.info('Storage database connection closed');
  }
}

/**
 * Create a StorageDatabase instance
 */
export function createStorageDatabase(): StorageDatabase {
  return new StorageDatabase();
}
