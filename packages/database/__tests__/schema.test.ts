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

  describe('Enums', () => {
    it('should export messageDirectionEnum', async () => {
      const { messageDirectionEnum } = await import('../src/schema/index.js');
      expect(messageDirectionEnum).toBeDefined();
    });

    it('should export chatTypeEnum', async () => {
      const { chatTypeEnum } = await import('../src/schema/index.js');
      expect(chatTypeEnum).toBeDefined();
    });

    it('should export chatPermissionEnum', async () => {
      const { chatPermissionEnum } = await import('../src/schema/index.js');
      expect(chatPermissionEnum).toBeDefined();
    });
  });
});
