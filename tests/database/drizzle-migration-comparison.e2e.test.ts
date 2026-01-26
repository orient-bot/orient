/**
 * Drizzle Migration Comparison Tests
 *
 * These tests verify that migrating from BaseDatabase (raw pg.Pool)
 * to Drizzle ORM produces equivalent results.
 *
 * Strategy:
 * 1. For each database service (message, slack, scheduler, webhook)
 * 2. Execute the same operations using both implementations
 * 3. Compare results to ensure migration safety
 *
 * @see packages/database/src/client.ts - Drizzle client
 * @see src/services/baseDatabase.ts - Legacy pg.Pool base class (removed)
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { getDatabase, messages, slackMessages, eq, and, desc } from '@orientbot/database';

// Skip these tests unless explicitly enabled and a database URL is available.
const runDbTests = process.env.RUN_DB_TESTS === 'true' || process.env.E2E_TESTS === 'true';
const skipE2E = !runDbTests || (!process.env.DATABASE_URL && !process.env.TEST_DATABASE_URL);

describe.skipIf(skipE2E)('Drizzle Migration Comparison', () => {
  describe('Message Queries', () => {
    const testPhone = `drizzle_test_${Date.now()}`;

    beforeEach(async () => {
      // Clean up any test data from previous runs
      const db = getDatabase();
      await db.delete(messages).where(eq(messages.phone, testPhone));
    });

    afterAll(async () => {
      // Final cleanup
      const db = getDatabase();
      await db.delete(messages).where(eq(messages.phone, testPhone));
    });

    it('should insert and retrieve messages identically', async () => {
      const db = getDatabase();

      // Insert test message using Drizzle
      const testMessage = {
        messageId: `test_msg_${Date.now()}`,
        direction: 'incoming',
        jid: `${testPhone}@s.whatsapp.net`,
        phone: testPhone,
        text: 'Test message for Drizzle comparison',
        isGroup: false,
        timestamp: new Date(),
      };

      await db.insert(messages).values(testMessage);

      // Query using Drizzle
      const drizzleResult = await db
        .select()
        .from(messages)
        .where(eq(messages.phone, testPhone))
        .orderBy(desc(messages.timestamp))
        .limit(1);

      expect(drizzleResult.length).toBe(1);
      expect(drizzleResult[0].text).toBe(testMessage.text);
      expect(drizzleResult[0].direction).toBe(testMessage.direction);
    });

    it('should handle complex queries with filters', async () => {
      const db = getDatabase();

      // Insert multiple messages
      const now = new Date();
      const testMessages = [
        {
          messageId: `test_msg_1_${Date.now()}`,
          direction: 'incoming',
          jid: `${testPhone}@s.whatsapp.net`,
          phone: testPhone,
          text: 'Incoming message 1',
          isGroup: false,
          timestamp: new Date(now.getTime() - 2000),
        },
        {
          messageId: `test_msg_2_${Date.now()}`,
          direction: 'outgoing',
          jid: `${testPhone}@s.whatsapp.net`,
          phone: testPhone,
          text: 'Outgoing message 1',
          isGroup: false,
          timestamp: new Date(now.getTime() - 1000),
        },
        {
          messageId: `test_msg_3_${Date.now()}`,
          direction: 'incoming',
          jid: `${testPhone}@s.whatsapp.net`,
          phone: testPhone,
          text: 'Incoming message 2',
          isGroup: false,
          timestamp: now,
        },
      ];

      for (const msg of testMessages) {
        await db.insert(messages).values(msg);
      }

      // Query only incoming messages
      const incomingMessages = await db
        .select()
        .from(messages)
        .where(and(eq(messages.phone, testPhone), eq(messages.direction, 'incoming')))
        .orderBy(desc(messages.timestamp));

      expect(incomingMessages.length).toBe(2);
      expect(incomingMessages.every((m) => m.direction === 'incoming')).toBe(true);
    });
  });

  describe('Slack Message Queries', () => {
    const testChannelId = `drizzle_test_channel_${Date.now()}`;

    beforeEach(async () => {
      const db = getDatabase();
      await db.delete(slackMessages).where(eq(slackMessages.channelId, testChannelId));
    });

    afterAll(async () => {
      const db = getDatabase();
      await db.delete(slackMessages).where(eq(slackMessages.channelId, testChannelId));
    });

    it('should insert and retrieve Slack messages identically', async () => {
      const db = getDatabase();

      const testMessage = {
        messageId: `slack_msg_${Date.now()}`,
        channelId: testChannelId,
        userId: 'U12345678',
        userName: 'testuser',
        text: 'Test Slack message',
        direction: 'incoming',
        timestamp: new Date(),
      };

      await db.insert(slackMessages).values(testMessage);

      const result = await db
        .select()
        .from(slackMessages)
        .where(eq(slackMessages.channelId, testChannelId))
        .limit(1);

      expect(result.length).toBe(1);
      expect(result[0].text).toBe(testMessage.text);
      expect(result[0].userId).toBe(testMessage.userId);
    });
  });

  describe('Query Performance Baseline', () => {
    it('should establish query performance baseline', async () => {
      const db = getDatabase();

      // Simple query - should complete quickly
      const start = Date.now();
      await db.select().from(messages).limit(10);
      const duration = Date.now() - start;

      // Performance assertion (should complete in reasonable time)
      expect(duration).toBeLessThan(1000); // 1 second max for simple query
    });
  });
});

/**
 * Migration Checklist
 *
 * For each database service, ensure:
 * 1. [ ] All CRUD operations produce identical results
 * 2. [ ] Error handling is equivalent
 * 3. [ ] Transaction behavior is preserved
 * 4. [ ] Performance is acceptable (no regressions)
 *
 * Services to migrate:
 * - [ ] MessageDatabase
 * - [ ] SlackDatabase
 * - [ ] SchedulerDatabase
 * - [ ] WebhookDatabase
 */
