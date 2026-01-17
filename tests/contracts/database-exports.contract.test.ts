/**
 * Contract Tests for @orient/database
 *
 * These tests verify that the public API of @orient/database remains stable.
 */

import { describe, it, expect } from 'vitest';

describe('@orient/database Public API Contract', () => {
  describe('Client Exports', () => {
    it('should export getDatabase function', async () => {
      const { getDatabase } = await import('@orient/database');
      expect(typeof getDatabase).toBe('function');
    });

    it('should export closeDatabase function', async () => {
      const { closeDatabase } = await import('@orient/database');
      expect(typeof closeDatabase).toBe('function');
    });

    it('should export checkDatabaseConnection function', async () => {
      const { checkDatabaseConnection } = await import('@orient/database');
      expect(typeof checkDatabaseConnection).toBe('function');
    });
  });

  describe('Schema Exports', () => {
    it('should export messages table', async () => {
      const { messages } = await import('@orient/database');
      expect(messages).toBeDefined();
    });

    it('should export groups table', async () => {
      const { groups } = await import('@orient/database');
      expect(groups).toBeDefined();
    });

    it('should export chatPermissions table', async () => {
      const { chatPermissions } = await import('@orient/database');
      expect(chatPermissions).toBeDefined();
    });

    it('should export slackMessages table', async () => {
      const { slackMessages } = await import('@orient/database');
      expect(slackMessages).toBeDefined();
    });

    it('should export scheduledMessages table', async () => {
      const { scheduledMessages } = await import('@orient/database');
      expect(scheduledMessages).toBeDefined();
    });
  });

  describe('Query Helper Exports', () => {
    it('should export eq helper', async () => {
      const { eq } = await import('@orient/database');
      expect(typeof eq).toBe('function');
    });

    it('should export and helper', async () => {
      const { and } = await import('@orient/database');
      expect(typeof and).toBe('function');
    });

    it('should export or helper', async () => {
      const { or } = await import('@orient/database');
      expect(typeof or).toBe('function');
    });

    it('should export desc helper', async () => {
      const { desc } = await import('@orient/database');
      expect(typeof desc).toBe('function');
    });
  });
});
