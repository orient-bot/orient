/**
 * Contract Tests for @orientbot/database
 *
 * These tests verify that the public API of @orientbot/database remains stable.
 */

import { describe, it, expect } from 'vitest';

describe('@orientbot/database Public API Contract', () => {
  describe('Client Exports', () => {
    it('should export getDatabase function', async () => {
      const { getDatabase } = await import('@orientbot/database');
      expect(typeof getDatabase).toBe('function');
    });

    it('should export closeDatabase function', async () => {
      const { closeDatabase } = await import('@orientbot/database');
      expect(typeof closeDatabase).toBe('function');
    });

    it('should export checkDatabaseConnection function', async () => {
      const { checkDatabaseConnection } = await import('@orientbot/database');
      expect(typeof checkDatabaseConnection).toBe('function');
    });
  });

  describe('Schema Exports', () => {
    it('should export messages table', async () => {
      const { messages } = await import('@orientbot/database');
      expect(messages).toBeDefined();
    });

    it('should export groups table', async () => {
      const { groups } = await import('@orientbot/database');
      expect(groups).toBeDefined();
    });

    it('should export chatPermissions table', async () => {
      const { chatPermissions } = await import('@orientbot/database');
      expect(chatPermissions).toBeDefined();
    });

    it('should export slackMessages table', async () => {
      const { slackMessages } = await import('@orientbot/database');
      expect(slackMessages).toBeDefined();
    });

    it('should export scheduledMessages table', async () => {
      const { scheduledMessages } = await import('@orientbot/database');
      expect(scheduledMessages).toBeDefined();
    });
  });

  describe('Query Helper Exports', () => {
    it('should export eq helper', async () => {
      const { eq } = await import('@orientbot/database');
      expect(typeof eq).toBe('function');
    });

    it('should export and helper', async () => {
      const { and } = await import('@orientbot/database');
      expect(typeof and).toBe('function');
    });

    it('should export or helper', async () => {
      const { or } = await import('@orientbot/database');
      expect(typeof or).toBe('function');
    });

    it('should export desc helper', async () => {
      const { desc } = await import('@orientbot/database');
      expect(typeof desc).toBe('function');
    });
  });
});
