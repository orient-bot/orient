/**
 * SQLite Client Tests
 *
 * Tests for the SQLite database client implementation.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { existsSync, unlinkSync, mkdirSync, rmSync } from 'fs';
import { dirname, join } from 'path';
import { tmpdir } from 'os';

// Generate unique test database path
const TEST_DB_DIR = join(tmpdir(), 'orient-test-sqlite');
const TEST_DB_PATH = join(
  TEST_DB_DIR,
  `test-${Date.now()}-${Math.random().toString(36).slice(2)}.db`
);

describe('SQLite Client', () => {
  beforeEach(() => {
    // Reset module state before each test
    vi.resetModules();
    // Ensure clean test directory
    if (!existsSync(TEST_DB_DIR)) {
      mkdirSync(TEST_DB_DIR, { recursive: true });
    }
    // Set environment for SQLite
    process.env.DATABASE_TYPE = 'sqlite';
    process.env.SQLITE_DATABASE = TEST_DB_PATH;
  });

  afterEach(async () => {
    // Clean up test database
    try {
      const { resetSqliteInstance } = await import('../src/clients/sqlite.js');
      resetSqliteInstance();
    } catch {
      // Ignore if not loaded
    }

    // Remove test database file
    if (existsSync(TEST_DB_PATH)) {
      unlinkSync(TEST_DB_PATH);
    }
    // Also remove WAL and SHM files
    if (existsSync(`${TEST_DB_PATH}-wal`)) {
      unlinkSync(`${TEST_DB_PATH}-wal`);
    }
    if (existsSync(`${TEST_DB_PATH}-shm`)) {
      unlinkSync(`${TEST_DB_PATH}-shm`);
    }
  });

  it('should create a new SQLite database file', async () => {
    const { createSqliteClient } = await import('../src/clients/sqlite.js');

    const client = createSqliteClient({ filename: TEST_DB_PATH });

    expect(client).toBeDefined();
    expect(client.db).toBeDefined();
    expect(existsSync(TEST_DB_PATH)).toBe(true);
  });

  it('should connect to existing database', async () => {
    const { createSqliteClient, resetSqliteInstance } = await import('../src/clients/sqlite.js');

    // Create first connection
    const client1 = createSqliteClient({ filename: TEST_DB_PATH });
    expect(existsSync(TEST_DB_PATH)).toBe(true);

    // Reset and reconnect
    resetSqliteInstance();
    const client2 = createSqliteClient({ filename: TEST_DB_PATH });

    expect(client2).toBeDefined();
    expect(client2.db).toBeDefined();
  });

  it('should enable WAL mode', async () => {
    const { createSqliteClient, getSqliteRawDb } = await import('../src/clients/sqlite.js');

    createSqliteClient({ filename: TEST_DB_PATH });
    const rawDb = getSqliteRawDb();

    const result = rawDb.pragma('journal_mode');
    expect(result).toEqual([{ journal_mode: 'wal' }]);
  });

  it('should enable foreign keys', async () => {
    const { createSqliteClient, getSqliteRawDb } = await import('../src/clients/sqlite.js');

    createSqliteClient({ filename: TEST_DB_PATH });
    const rawDb = getSqliteRawDb();

    const result = rawDb.pragma('foreign_keys');
    expect(result).toEqual([{ foreign_keys: 1 }]);
  });

  it('should execute basic CRUD operations', async () => {
    const { createSqliteClient, getSqliteRawDb } = await import('../src/clients/sqlite.js');

    const client = createSqliteClient({ filename: TEST_DB_PATH });
    const rawDb = getSqliteRawDb();

    // Create a test table
    rawDb.exec(`
      CREATE TABLE IF NOT EXISTS test_table (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        value INTEGER
      )
    `);

    // Insert
    const insertStmt = rawDb.prepare('INSERT INTO test_table (name, value) VALUES (?, ?)');
    insertStmt.run('test1', 100);
    insertStmt.run('test2', 200);

    // Select
    const selectStmt = rawDb.prepare('SELECT * FROM test_table');
    const rows = selectStmt.all();

    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({ name: 'test1', value: 100 });
    expect(rows[1]).toMatchObject({ name: 'test2', value: 200 });

    // Update
    const updateStmt = rawDb.prepare('UPDATE test_table SET value = ? WHERE name = ?');
    updateStmt.run(150, 'test1');

    const updated = rawDb.prepare('SELECT value FROM test_table WHERE name = ?').get('test1');
    expect(updated).toMatchObject({ value: 150 });

    // Delete
    const deleteStmt = rawDb.prepare('DELETE FROM test_table WHERE name = ?');
    deleteStmt.run('test1');

    const remaining = rawDb.prepare('SELECT * FROM test_table').all();
    expect(remaining).toHaveLength(1);
  });

  it('should handle timestamps correctly', async () => {
    const { createSqliteClient, getSqliteRawDb } = await import('../src/clients/sqlite.js');

    createSqliteClient({ filename: TEST_DB_PATH });
    const rawDb = getSqliteRawDb();

    // Create table with timestamp column
    rawDb.exec(`
      CREATE TABLE IF NOT EXISTS timestamp_test (
        id INTEGER PRIMARY KEY,
        created_at INTEGER NOT NULL
      )
    `);

    const now = new Date();
    const timestamp = Math.floor(now.getTime() / 1000);

    // Insert timestamp
    rawDb.prepare('INSERT INTO timestamp_test (id, created_at) VALUES (?, ?)').run(1, timestamp);

    // Retrieve and verify
    const row = rawDb.prepare('SELECT created_at FROM timestamp_test WHERE id = 1').get() as {
      created_at: number;
    };
    expect(row.created_at).toBe(timestamp);

    // Convert back to date
    const retrievedDate = new Date(row.created_at * 1000);
    expect(retrievedDate.getFullYear()).toBe(now.getFullYear());
    expect(retrievedDate.getMonth()).toBe(now.getMonth());
    expect(retrievedDate.getDate()).toBe(now.getDate());
  });

  it('should serialize/deserialize JSON arrays', async () => {
    const { createSqliteClient, getSqliteRawDb } = await import('../src/clients/sqlite.js');

    createSqliteClient({ filename: TEST_DB_PATH });
    const rawDb = getSqliteRawDb();

    // Create table with JSON column
    rawDb.exec(`
      CREATE TABLE IF NOT EXISTS json_test (
        id INTEGER PRIMARY KEY,
        tags TEXT
      )
    `);

    const testTags = ['tag1', 'tag2', 'tag3'];
    const jsonStr = JSON.stringify(testTags);

    // Insert JSON
    rawDb.prepare('INSERT INTO json_test (id, tags) VALUES (?, ?)').run(1, jsonStr);

    // Retrieve and parse
    const row = rawDb.prepare('SELECT tags FROM json_test WHERE id = 1').get() as { tags: string };
    const parsedTags = JSON.parse(row.tags);

    expect(parsedTags).toEqual(testTags);
  });

  it('should close connection gracefully', async () => {
    const { createSqliteClient, getSqliteRawDb, resetSqliteInstance } =
      await import('../src/clients/sqlite.js');

    const client = createSqliteClient({ filename: TEST_DB_PATH });

    // Check connection works
    const connected = await client.checkConnection();
    expect(connected).toBe(true);

    // Close connection
    await client.close();

    // After close, the singleton is reset
    // Attempting to get raw db should recreate the connection
    resetSqliteInstance();
  });

  it('should check connection status', async () => {
    const { createSqliteClient } = await import('../src/clients/sqlite.js');

    const client = createSqliteClient({ filename: TEST_DB_PATH });

    const isConnected = await client.checkConnection();
    expect(isConnected).toBe(true);
  });

  it('should execute raw SQL queries', async () => {
    const { createSqliteClient, getSqliteRawDb } = await import('../src/clients/sqlite.js');

    const client = createSqliteClient({ filename: TEST_DB_PATH });
    const rawDb = getSqliteRawDb();

    // Create test table
    rawDb.exec(`
      CREATE TABLE IF NOT EXISTS raw_test (
        id INTEGER PRIMARY KEY,
        data TEXT
      )
    `);

    // Insert using raw execute
    await client.executeRaw('INSERT INTO raw_test (id, data) VALUES (?, ?)', [1, 'test']);

    // Select using raw execute
    const results = await client.executeRaw<{ id: number; data: string }>(
      'SELECT * FROM raw_test WHERE id = ?',
      [1]
    );

    expect(results).toHaveLength(1);
    expect(results[0]).toMatchObject({ id: 1, data: 'test' });
  });

  it('should cache database connection (singleton pattern)', async () => {
    const { createSqliteClient, getSqliteDatabase } = await import('../src/clients/sqlite.js');

    const client1 = createSqliteClient({ filename: TEST_DB_PATH });
    const db1 = getSqliteDatabase();
    const db2 = getSqliteDatabase();

    // Should return the same instance
    expect(db1).toBe(db2);
  });

  it('should create directory if it does not exist', async () => {
    const { resetSqliteInstance } = await import('../src/clients/sqlite.js');
    resetSqliteInstance();

    const nestedPath = join(TEST_DB_DIR, 'nested', 'deep', `test-${Date.now()}.db`);

    // Remove the directory if it exists
    const nestedDir = dirname(nestedPath);
    if (existsSync(nestedDir)) {
      rmSync(nestedDir, { recursive: true });
    }

    const { createSqliteClient } = await import('../src/clients/sqlite.js');

    const client = createSqliteClient({ filename: nestedPath });

    expect(existsSync(nestedPath)).toBe(true);
    expect(client.db).toBeDefined();

    // Cleanup
    await client.close();
    resetSqliteInstance();
    if (existsSync(nestedPath)) {
      unlinkSync(nestedPath);
    }
    if (existsSync(`${nestedPath}-wal`)) {
      unlinkSync(`${nestedPath}-wal`);
    }
    if (existsSync(`${nestedPath}-shm`)) {
      unlinkSync(`${nestedPath}-shm`);
    }
    if (existsSync(dirname(nestedPath))) {
      rmSync(dirname(nestedPath), { recursive: true });
    }
  });
});
