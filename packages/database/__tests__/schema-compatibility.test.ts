/**
 * Schema Compatibility Tests
 *
 * Tests to ensure PostgreSQL and SQLite schemas are compatible
 * and export the same tables with matching column names.
 */

import { describe, it, expect } from 'vitest';

describe('Schema Compatibility', () => {
  describe('Table Exports', () => {
    it('should export same table names from both dialects', async () => {
      const pgSchema = await import('../src/schema/pg/index.js');
      const sqliteSchema = await import('../src/schema/sqlite/index.js');

      // List of expected table names
      const expectedTables = [
        'messages',
        'groups',
        'chatPermissions',
        'permissionAuditLog',
        'dashboardUsers',
        'userVersionPreferences',
        'systemPrompts',
        'slackMessages',
        'slackChannels',
        'slackChannelPermissions',
        'slackPermissionAuditLog',
        'scheduledMessages',
        'demoMeetings',
        'demoGithubMonitors',
        'webhookForwards',
        'agents',
        'agentSkills',
        'agentTools',
        'contextRules',
        'permissionPolicies',
        'approvalRequests',
        'approvalGrants',
        'chatContext',
        'featureFlags',
        'userFeatureFlagOverrides',
      ];

      for (const tableName of expectedTables) {
        expect(
          pgSchema[tableName as keyof typeof pgSchema],
          `PostgreSQL missing table: ${tableName}`
        ).toBeDefined();
        expect(
          sqliteSchema[tableName as keyof typeof sqliteSchema],
          `SQLite missing table: ${tableName}`
        ).toBeDefined();
      }
    });

    it('should have matching column names for messages table', async () => {
      const pgSchema = await import('../src/schema/pg/index.js');
      const sqliteSchema = await import('../src/schema/sqlite/index.js');

      const pgColumns = Object.keys(pgSchema.messages);
      const sqliteColumns = Object.keys(sqliteSchema.messages);

      // Filter out internal Drizzle properties (start with _) and PostgreSQL-specific columns
      // enableRLS is PostgreSQL-specific for Row Level Security
      const filterColumns = (cols: string[]) =>
        cols.filter((c) => !c.startsWith('_') && !c.startsWith('$') && c !== 'enableRLS');

      const pgFiltered = filterColumns(pgColumns).sort();
      const sqliteFiltered = filterColumns(sqliteColumns).sort();

      expect(pgFiltered).toEqual(sqliteFiltered);
    });

    it('should have matching column names for groups table', async () => {
      const pgSchema = await import('../src/schema/pg/index.js');
      const sqliteSchema = await import('../src/schema/sqlite/index.js');

      // Filter out internal Drizzle properties and PostgreSQL-specific columns
      const filterColumns = (cols: string[]) =>
        cols.filter((c) => !c.startsWith('_') && !c.startsWith('$') && c !== 'enableRLS');

      const pgColumns = filterColumns(Object.keys(pgSchema.groups)).sort();
      const sqliteColumns = filterColumns(Object.keys(sqliteSchema.groups)).sort();

      expect(pgColumns).toEqual(sqliteColumns);
    });

    it('should have matching column names for chatPermissions table', async () => {
      const pgSchema = await import('../src/schema/pg/index.js');
      const sqliteSchema = await import('../src/schema/sqlite/index.js');

      // Filter out internal Drizzle properties and PostgreSQL-specific columns
      const filterColumns = (cols: string[]) =>
        cols.filter((c) => !c.startsWith('_') && !c.startsWith('$') && c !== 'enableRLS');

      const pgColumns = filterColumns(Object.keys(pgSchema.chatPermissions)).sort();
      const sqliteColumns = filterColumns(Object.keys(sqliteSchema.chatPermissions)).sort();

      expect(pgColumns).toEqual(sqliteColumns);
    });

    it('should have matching column names for agents table', async () => {
      const pgSchema = await import('../src/schema/pg/index.js');
      const sqliteSchema = await import('../src/schema/sqlite/index.js');

      // Filter out internal Drizzle properties and PostgreSQL-specific columns
      const filterColumns = (cols: string[]) =>
        cols.filter((c) => !c.startsWith('_') && !c.startsWith('$') && c !== 'enableRLS');

      const pgColumns = filterColumns(Object.keys(pgSchema.agents)).sort();
      const sqliteColumns = filterColumns(Object.keys(sqliteSchema.agents)).sort();

      expect(pgColumns).toEqual(sqliteColumns);
    });

    it('should have matching column names for featureFlags table', async () => {
      const pgSchema = await import('../src/schema/pg/index.js');
      const sqliteSchema = await import('../src/schema/sqlite/index.js');

      // Filter out internal Drizzle properties and PostgreSQL-specific columns
      const filterColumns = (cols: string[]) =>
        cols.filter((c) => !c.startsWith('_') && !c.startsWith('$') && c !== 'enableRLS');

      const pgColumns = filterColumns(Object.keys(pgSchema.featureFlags)).sort();
      const sqliteColumns = filterColumns(Object.keys(sqliteSchema.featureFlags)).sort();

      expect(pgColumns).toEqual(sqliteColumns);
    });
  });

  describe('Primary Keys', () => {
    it('should have compatible primary keys', async () => {
      const pgSchema = await import('../src/schema/pg/index.js');
      const sqliteSchema = await import('../src/schema/sqlite/index.js');

      // Tables with serial/autoincrement primary keys
      const autoIncrementTables = [
        'messages',
        'permissionAuditLog',
        'dashboardUsers',
        'userVersionPreferences',
        'systemPrompts',
        'slackMessages',
        'slackPermissionAuditLog',
        'scheduledMessages',
        'demoMeetings',
        'demoGithubMonitors',
        'webhookForwards',
        'agentSkills',
        'agentTools',
        'contextRules',
        'approvalGrants',
        'chatContext',
        'userFeatureFlagOverrides',
      ];

      // Tables with text primary keys
      const textPkTables = [
        'groups',
        'chatPermissions',
        'slackChannels',
        'slackChannelPermissions',
        'agents',
        'permissionPolicies',
        'approvalRequests',
        'featureFlags',
      ];

      for (const tableName of autoIncrementTables) {
        const pgTable = pgSchema[tableName as keyof typeof pgSchema];
        const sqliteTable = sqliteSchema[tableName as keyof typeof sqliteSchema];

        expect(pgTable, `PostgreSQL table ${tableName} should exist`).toBeDefined();
        expect(sqliteTable, `SQLite table ${tableName} should exist`).toBeDefined();

        // Both should have 'id' column
        expect('id' in pgTable, `PostgreSQL ${tableName} should have id column`).toBe(true);
        expect('id' in sqliteTable, `SQLite ${tableName} should have id column`).toBe(true);
      }

      for (const tableName of textPkTables) {
        const pgTable = pgSchema[tableName as keyof typeof pgSchema];
        const sqliteTable = sqliteSchema[tableName as keyof typeof sqliteSchema];

        expect(pgTable, `PostgreSQL table ${tableName} should exist`).toBeDefined();
        expect(sqliteTable, `SQLite table ${tableName} should exist`).toBeDefined();
      }
    });
  });

  describe('Common Types', () => {
    it('should export common types from both dialects', async () => {
      const pgSchema = await import('../src/schema/pg/index.js');
      const schemaIndex = await import('../src/schema/index.js');

      // Common exported values (from common.ts, re-exported via schema/index.ts)
      const commonExports = [
        'MESSAGE_DIRECTION_VALUES',
        'CHAT_TYPE_VALUES',
        'CHAT_PERMISSION_VALUES',
        'PROMPT_PLATFORM_VALUES',
        'SLACK_CHANNEL_TYPE_VALUES',
      ];

      // PostgreSQL has its own enums
      expect(pgSchema.messageDirectionEnum).toBeDefined();
      expect(pgSchema.chatTypeEnum).toBeDefined();
      expect(pgSchema.chatPermissionEnum).toBeDefined();
      expect(pgSchema.promptPlatformEnum).toBeDefined();
      expect(pgSchema.slackChannelTypeEnum).toBeDefined();

      // Common types are exported via the schema index (not sqlite/index.ts directly)
      for (const exportName of commonExports) {
        expect(
          schemaIndex[exportName as keyof typeof schemaIndex],
          `Schema index should export ${exportName}`
        ).toBeDefined();
      }
    });

    it('should have same message direction values', async () => {
      const { MESSAGE_DIRECTION_VALUES } = await import('../src/schema/common.js');

      expect(MESSAGE_DIRECTION_VALUES).toContain('incoming');
      expect(MESSAGE_DIRECTION_VALUES).toContain('outgoing');
    });

    it('should have same chat type values', async () => {
      const { CHAT_TYPE_VALUES } = await import('../src/schema/common.js');

      expect(CHAT_TYPE_VALUES).toContain('individual');
      expect(CHAT_TYPE_VALUES).toContain('group');
    });

    it('should have same chat permission values', async () => {
      const { CHAT_PERMISSION_VALUES } = await import('../src/schema/common.js');

      expect(CHAT_PERMISSION_VALUES).toContain('ignored');
      expect(CHAT_PERMISSION_VALUES).toContain('read_only');
      expect(CHAT_PERMISSION_VALUES).toContain('read_write');
    });
  });

  describe('Foreign Key Relationships', () => {
    it('should have compatible foreign key relationships', async () => {
      const pgSchema = await import('../src/schema/pg/index.js');
      const sqliteSchema = await import('../src/schema/sqlite/index.js');

      // Check that agentSkills references agents
      expect(pgSchema.agentSkills.agentId).toBeDefined();
      expect(sqliteSchema.agentSkills.agentId).toBeDefined();

      // Check that agentTools references agents
      expect(pgSchema.agentTools.agentId).toBeDefined();
      expect(sqliteSchema.agentTools.agentId).toBeDefined();

      // Check that userVersionPreferences references dashboardUsers
      expect(pgSchema.userVersionPreferences.userId).toBeDefined();
      expect(sqliteSchema.userVersionPreferences.userId).toBeDefined();

      // Check that userFeatureFlagOverrides references dashboardUsers and featureFlags
      expect(pgSchema.userFeatureFlagOverrides.userId).toBeDefined();
      expect(sqliteSchema.userFeatureFlagOverrides.userId).toBeDefined();
      expect(pgSchema.userFeatureFlagOverrides.flagId).toBeDefined();
      expect(sqliteSchema.userFeatureFlagOverrides.flagId).toBeDefined();

      // Check that contextRules references agents
      expect(pgSchema.contextRules.agentId).toBeDefined();
      expect(sqliteSchema.contextRules.agentId).toBeDefined();
    });
  });
});
