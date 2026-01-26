/**
 * Database Client Tests
 *
 * Tests for the SQLite database client.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { existsSync, unlinkSync, mkdirSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

// Generate unique test database path
const TEST_DB_DIR = join(tmpdir(), 'orient-test-client');
const TEST_DB_PATH = join(
  TEST_DB_DIR,
  `test-${Date.now()}-${Math.random().toString(36).slice(2)}.db`
);

describe('Database Client', () => {
  beforeEach(() => {
    // Reset module state before each test
    vi.resetModules();
    // Ensure clean test directory
    if (!existsSync(TEST_DB_DIR)) {
      mkdirSync(TEST_DB_DIR, { recursive: true });
    }
    // Clear environment variables
    delete process.env.SQLITE_DATABASE;
  });

  afterEach(async () => {
    // Clean up SQLite test database
    try {
      const { resetDatabaseInstance } = await import('../src/client.js');
      resetDatabaseInstance();
    } catch {
      // Ignore if not loaded
    }

    // Remove test database files
    for (const ext of ['', '-wal', '-shm']) {
      const filePath = `${TEST_DB_PATH}${ext}`;
      if (existsSync(filePath)) {
        unlinkSync(filePath);
      }
    }
  });

  describe('getDefaultSqlitePath', () => {
    it('should return SQLITE_DATABASE env var if set', async () => {
      process.env.SQLITE_DATABASE = '/custom/path/db.sqlite';

      const { getDefaultSqlitePath } = await import('../src/clients/types.js');
      expect(getDefaultSqlitePath()).toBe('/custom/path/db.sqlite');
    });

    it('should return default path if SQLITE_DATABASE not set', async () => {
      delete process.env.SQLITE_DATABASE;

      const { getDefaultSqlitePath } = await import('../src/clients/types.js');
      expect(getDefaultSqlitePath()).toBe('./data/orient.db');
    });
  });

  describe('SQLite Database Operations', () => {
    beforeEach(() => {
      process.env.SQLITE_DATABASE = TEST_DB_PATH;
    });

    it('should create database on getDatabase()', async () => {
      const { getDatabase } = await import('../src/client.js');

      const db = getDatabase();
      expect(db).toBeDefined();
    });

    it('should cache database connection', async () => {
      const { getDatabase } = await import('../src/client.js');

      const db1 = getDatabase();
      const db2 = getDatabase();

      // Should return the same instance
      expect(db1).toBe(db2);
    });

    it('should support connection close', async () => {
      const { getDatabase, closeDatabase, getDatabaseClient } = await import('../src/client.js');

      getDatabase();
      const clientBefore = getDatabaseClient();
      expect(clientBefore.db).toBeDefined();

      await closeDatabase();

      // After closing, getDatabase should create new connection
      vi.resetModules();
      const { getDatabase: getDb2 } = await import('../src/client.js');
      const db = getDb2({ filename: TEST_DB_PATH });
      expect(db).toBeDefined();
    });

    it('should support raw SQL execution', async () => {
      const { getDatabase, executeRawSql } = await import('../src/client.js');

      getDatabase();

      // Create a test table
      await executeRawSql(`
        CREATE TABLE IF NOT EXISTS client_test (
          id INTEGER PRIMARY KEY,
          name TEXT
        )
      `);

      // Insert data
      await executeRawSql('INSERT INTO client_test (id, name) VALUES (?, ?)', [1, 'test']);

      // Select data
      const results = await executeRawSql<{ id: number; name: string }>(
        'SELECT * FROM client_test'
      );

      expect(results).toHaveLength(1);
      expect(results[0]).toMatchObject({ id: 1, name: 'test' });
    });

    it('should check database connection', async () => {
      const { checkDatabaseConnection } = await import('../src/client.js');

      const isConnected = await checkDatabaseConnection();

      expect(isConnected).toBe(true);
    });

    it('should get database client with advanced operations', async () => {
      const { getDatabaseClient } = await import('../src/client.js');

      const client = getDatabaseClient();

      expect(client).toBeDefined();
      expect(client.db).toBeDefined();
      expect(typeof client.checkConnection).toBe('function');
      expect(typeof client.close).toBe('function');
      expect(typeof client.executeRaw).toBe('function');
    });
  });

  describe('Schema Exports', () => {
    beforeEach(() => {
      process.env.SQLITE_DATABASE = TEST_DB_PATH;
    });

    it('should export schema for query building', async () => {
      const { schema } = await import('../src/client.js');

      expect(schema).toBeDefined();
      expect(schema.messages).toBeDefined();
      expect(schema.groups).toBeDefined();
      expect(schema.chatPermissions).toBeDefined();
    });

    it('should export Drizzle utilities', async () => {
      const { eq, and, or, desc, asc, sql, count, like, inArray, isNull, isNotNull } =
        await import('../src/client.js');

      expect(eq).toBeDefined();
      expect(and).toBeDefined();
      expect(or).toBeDefined();
      expect(desc).toBeDefined();
      expect(asc).toBeDefined();
      expect(sql).toBeDefined();
      expect(count).toBeDefined();
      expect(like).toBeDefined();
      expect(inArray).toBeDefined();
      expect(isNull).toBeDefined();
      expect(isNotNull).toBeDefined();
    });
  });

  describe('DatabaseConfig Interface', () => {
    it('should accept custom SQLite filename', async () => {
      const customPath = join(TEST_DB_DIR, `custom-${Date.now()}.db`);
      const { getDatabase, closeDatabase } = await import('../src/client.js');

      getDatabase({ filename: customPath });

      expect(existsSync(customPath)).toBe(true);

      // Cleanup
      await closeDatabase();
      if (existsSync(customPath)) {
        unlinkSync(customPath);
      }
      if (existsSync(`${customPath}-wal`)) {
        unlinkSync(`${customPath}-wal`);
      }
      if (existsSync(`${customPath}-shm`)) {
        unlinkSync(`${customPath}-shm`);
      }
    });
  });
});
