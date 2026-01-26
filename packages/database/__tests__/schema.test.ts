/**
 * Schema Definition Tests
 */

import { describe, it, expect } from 'vitest';

describe('Database Schema', () => {
  describe('Schema Exports', () => {
    it('should export messages table', async () => {
      const { messages } = await import('../src/schema/index.js');
      expect(messages).toBeDefined();
    });

    it('should export groups table', async () => {
      const { groups } = await import('../src/schema/index.js');
      expect(groups).toBeDefined();
    });

    it('should export chatPermissions table', async () => {
      const { chatPermissions } = await import('../src/schema/index.js');
      expect(chatPermissions).toBeDefined();
    });

    it('should export slackMessages table', async () => {
      const { slackMessages } = await import('../src/schema/index.js');
      expect(slackMessages).toBeDefined();
    });

    it('should export slackChannels table', async () => {
      const { slackChannels } = await import('../src/schema/index.js');
      expect(slackChannels).toBeDefined();
    });

    it('should export scheduledMessages table', async () => {
      const { scheduledMessages } = await import('../src/schema/index.js');
      expect(scheduledMessages).toBeDefined();
    });

    it('should export webhookForwards table', async () => {
      const { webhookForwards } = await import('../src/schema/index.js');
      expect(webhookForwards).toBeDefined();
    });
  });

  describe('Type Value Arrays (SQLite uses const arrays instead of enums)', () => {
    it('should export MESSAGE_DIRECTION_VALUES', async () => {
      const { MESSAGE_DIRECTION_VALUES } = await import('../src/schema/index.js');
      expect(MESSAGE_DIRECTION_VALUES).toBeDefined();
      expect(MESSAGE_DIRECTION_VALUES).toContain('incoming');
      expect(MESSAGE_DIRECTION_VALUES).toContain('outgoing');
    });

    it('should export CHAT_TYPE_VALUES', async () => {
      const { CHAT_TYPE_VALUES } = await import('../src/schema/index.js');
      expect(CHAT_TYPE_VALUES).toBeDefined();
      expect(CHAT_TYPE_VALUES).toContain('individual');
      expect(CHAT_TYPE_VALUES).toContain('group');
    });

    it('should export CHAT_PERMISSION_VALUES', async () => {
      const { CHAT_PERMISSION_VALUES } = await import('../src/schema/index.js');
      expect(CHAT_PERMISSION_VALUES).toBeDefined();
      expect(CHAT_PERMISSION_VALUES).toContain('read_only');
      expect(CHAT_PERMISSION_VALUES).toContain('read_write');
      expect(CHAT_PERMISSION_VALUES).toContain('ignored');
    });
  });
});
