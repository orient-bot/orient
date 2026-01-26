/**
 * Feature Flags Service Tests
 *
 * Tests cascade logic, user overrides, and hierarchy handling.
 * Uses an in-memory SQLite database for testing.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { existsSync, unlinkSync, mkdirSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

// Test database path
const TEST_DB_DIR = join(tmpdir(), 'orient-test-feature-flags');
const TEST_DB_PATH = join(
  TEST_DB_DIR,
  `test-${Date.now()}-${Math.random().toString(36).slice(2)}.db`
);

describe('FeatureFlagsService', () => {
  beforeEach(async () => {
    vi.resetModules();

    // Ensure clean test directory
    if (!existsSync(TEST_DB_DIR)) {
      mkdirSync(TEST_DB_DIR, { recursive: true });
    }

    // Set environment for SQLite
    process.env.SQLITE_DATABASE = TEST_DB_PATH;

    // Set up test database with required tables
    const { executeRawSql, getDatabase } = await import('@orientbot/database');
    getDatabase();

    // Create feature flags table
    await executeRawSql(`
      CREATE TABLE IF NOT EXISTS feature_flags (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        description TEXT,
        enabled INTEGER NOT NULL DEFAULT 1,
        category TEXT NOT NULL DEFAULT 'ui',
        sort_order INTEGER NOT NULL DEFAULT 0,
        created_at INTEGER DEFAULT (strftime('%s', 'now')),
        updated_at INTEGER DEFAULT (strftime('%s', 'now'))
      )
    `);

    // Create user overrides table (matches Drizzle schema)
    await executeRawSql(`
      CREATE TABLE IF NOT EXISTS user_feature_flag_overrides (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        flag_id TEXT NOT NULL,
        enabled INTEGER NOT NULL,
        created_at INTEGER DEFAULT (strftime('%s', 'now')),
        updated_at INTEGER DEFAULT (strftime('%s', 'now')),
        UNIQUE (user_id, flag_id)
      )
    `);
  });

  afterEach(async () => {
    // Clean up
    try {
      const { resetDatabaseInstance } = await import('@orientbot/database');
      resetDatabaseInstance();
    } catch {
      // Ignore if not loaded
    }

    // Remove test database files
    for (const ext of ['', '-wal', '-shm']) {
      const filePath = `${TEST_DB_PATH}${ext}`;
      if (existsSync(filePath)) {
        try {
          unlinkSync(filePath);
        } catch {
          // Ignore
        }
      }
    }
  });

  describe('getAllFlags', () => {
    it('should return all feature flags', async () => {
      const { executeRawSql } = await import('@orientbot/database');
      const { createFeatureFlagsService } = await import('../src/featureFlagsService.js');

      // Insert test data
      await executeRawSql(`
        INSERT INTO feature_flags (id, name, description, enabled, category, sort_order)
        VALUES
          ('mini_apps', 'Mini-Apps', 'AI-generated web applications', 1, 'ui', 10),
          ('mini_apps.create', 'Create App', 'Create new mini-apps', 1, 'ui', 11)
      `);

      const service = createFeatureFlagsService();
      const result = await service.getAllFlags();

      expect(result).toHaveLength(2);
      expect(result[0].id).toBe('mini_apps');
      expect(result[0].name).toBe('Mini-Apps');
      expect(result[0].enabled).toBe(true);
    });

    it('should return empty array when no flags exist', async () => {
      const { createFeatureFlagsService } = await import('../src/featureFlagsService.js');
      const service = createFeatureFlagsService();

      const result = await service.getAllFlags();

      expect(result).toHaveLength(0);
    });
  });

  describe('getAllFlagsWithOverrides', () => {
    it('should return flags with user overrides applied', async () => {
      const { executeRawSql } = await import('@orientbot/database');
      const { createFeatureFlagsService } = await import('../src/featureFlagsService.js');

      // Insert test data
      await executeRawSql(`
        INSERT INTO feature_flags (id, name, enabled, category, sort_order)
        VALUES ('mini_apps', 'Mini-Apps', 1, 'ui', 10)
      `);

      // Insert user override to disable the flag
      await executeRawSql(`
        INSERT INTO user_feature_flag_overrides (user_id, flag_id, enabled)
        VALUES (1, 'mini_apps', 0)
      `);

      const service = createFeatureFlagsService();
      const result = await service.getAllFlagsWithOverrides(1);

      expect(result).toHaveLength(1);
      expect(result[0].enabled).toBe(true); // Global setting
      expect(result[0].userOverride).toBe(false); // User override
      expect(result[0].effectiveValue).toBe(false); // Effective value
    });

    it('should return flags without overrides when user has none', async () => {
      const { executeRawSql } = await import('@orientbot/database');
      const { createFeatureFlagsService } = await import('../src/featureFlagsService.js');

      // Insert test data
      await executeRawSql(`
        INSERT INTO feature_flags (id, name, enabled, category, sort_order)
        VALUES ('mini_apps', 'Mini-Apps', 1, 'ui', 10)
      `);

      const service = createFeatureFlagsService();
      const result = await service.getAllFlagsWithOverrides(1);

      expect(result).toHaveLength(1);
      expect(result[0].userOverride).toBeNull();
      expect(result[0].effectiveValue).toBe(true);
    });
  });

  describe('setUserOverride', () => {
    it('should set a user override', async () => {
      const { executeRawSql } = await import('@orientbot/database');
      const { createFeatureFlagsService } = await import('../src/featureFlagsService.js');

      // Insert test data
      await executeRawSql(`
        INSERT INTO feature_flags (id, name, enabled, category, sort_order)
        VALUES ('mini_apps', 'Mini-Apps', 1, 'ui', 10)
      `);

      const service = createFeatureFlagsService();
      await service.setUserOverride(1, 'mini_apps', false);

      const result = await service.getAllFlagsWithOverrides(1);
      expect(result[0].userOverride).toBe(false);
    });

    it('should throw error if flag does not exist', async () => {
      const { createFeatureFlagsService } = await import('../src/featureFlagsService.js');
      const service = createFeatureFlagsService();

      await expect(service.setUserOverride(1, 'nonexistent', true)).rejects.toThrow(
        /does not exist/
      );
    });
  });

  describe('removeUserOverride', () => {
    it('should remove a user override', async () => {
      const { executeRawSql } = await import('@orientbot/database');
      const { createFeatureFlagsService } = await import('../src/featureFlagsService.js');

      // Insert test data
      await executeRawSql(`
        INSERT INTO feature_flags (id, name, enabled, category, sort_order)
        VALUES ('mini_apps', 'Mini-Apps', 1, 'ui', 10)
      `);
      await executeRawSql(`
        INSERT INTO user_feature_flag_overrides (user_id, flag_id, enabled)
        VALUES (1, 'mini_apps', 0)
      `);

      const service = createFeatureFlagsService();

      // Verify override exists
      let result = await service.getAllFlagsWithOverrides(1);
      expect(result[0].userOverride).toBe(false);

      // Remove override
      await service.removeUserOverride(1, 'mini_apps');

      // Verify override is removed
      result = await service.getAllFlagsWithOverrides(1);
      expect(result[0].userOverride).toBeNull();
    });
  });

  describe('getEffectiveFlags', () => {
    it('should return a flat record of effective flag values', async () => {
      const { executeRawSql } = await import('@orientbot/database');
      const { createFeatureFlagsService } = await import('../src/featureFlagsService.js');

      // Insert test data
      await executeRawSql(`
        INSERT INTO feature_flags (id, name, enabled, category, sort_order)
        VALUES
          ('mini_apps', 'Mini-Apps', 1, 'ui', 10),
          ('mini_apps.create', 'Create', 1, 'ui', 11)
      `);

      const service = createFeatureFlagsService();
      const result = await service.getEffectiveFlags(1);

      expect(result).toEqual({
        mini_apps: true,
        'mini_apps.create': true,
      });
    });
  });

  describe('hierarchy logic', () => {
    it('should disable children when parent is disabled', async () => {
      const { executeRawSql } = await import('@orientbot/database');
      const { createFeatureFlagsService } = await import('../src/featureFlagsService.js');

      // Insert test data with parent disabled
      await executeRawSql(`
        INSERT INTO feature_flags (id, name, enabled, category, sort_order)
        VALUES
          ('mini_apps', 'Mini-Apps', 0, 'ui', 10),
          ('mini_apps.create', 'Create', 1, 'ui', 11)
      `);

      const service = createFeatureFlagsService();
      const result = await service.getEffectiveFlags(1);

      expect(result['mini_apps']).toBe(false);
      expect(result['mini_apps.create']).toBe(false); // Disabled because parent is disabled
    });

    it('should respect user override on parent flag', async () => {
      const { executeRawSql } = await import('@orientbot/database');
      const { createFeatureFlagsService } = await import('../src/featureFlagsService.js');

      // Insert test data
      await executeRawSql(`
        INSERT INTO feature_flags (id, name, enabled, category, sort_order)
        VALUES
          ('mini_apps', 'Mini-Apps', 1, 'ui', 10),
          ('mini_apps.create', 'Create', 1, 'ui', 11)
      `);

      // User disables parent
      await executeRawSql(`
        INSERT INTO user_feature_flag_overrides (user_id, flag_id, enabled)
        VALUES (1, 'mini_apps', 0)
      `);

      const service = createFeatureFlagsService();
      const result = await service.getEffectiveFlags(1);

      expect(result['mini_apps']).toBe(false);
      expect(result['mini_apps.create']).toBe(false); // Disabled because parent override is disabled
    });
  });

  describe('getParentId', () => {
    it('should return parent ID for nested flag', async () => {
      const { createFeatureFlagsService } = await import('../src/featureFlagsService.js');
      const service = createFeatureFlagsService();

      expect(service.getParentId('mini_apps.create')).toBe('mini_apps');
      expect(service.getParentId('a.b.c')).toBe('a.b');
    });

    it('should return null for root level flag', async () => {
      const { createFeatureFlagsService } = await import('../src/featureFlagsService.js');
      const service = createFeatureFlagsService();

      expect(service.getParentId('mini_apps')).toBeNull();
    });
  });

  describe('getAncestorIds', () => {
    it('should return all ancestor IDs including self', async () => {
      const { createFeatureFlagsService } = await import('../src/featureFlagsService.js');
      const service = createFeatureFlagsService();

      expect(service.getAncestorIds('a.b.c')).toEqual(['a', 'a.b', 'a.b.c']);
      expect(service.getAncestorIds('mini_apps')).toEqual(['mini_apps']);
    });
  });

  describe('close', () => {
    it('should close the database connection', async () => {
      const { createFeatureFlagsService } = await import('../src/featureFlagsService.js');
      const service = createFeatureFlagsService();

      // Should not throw
      await expect(service.close()).resolves.not.toThrow();
    });
  });
});
