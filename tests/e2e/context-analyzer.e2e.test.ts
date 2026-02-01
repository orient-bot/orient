/**
 * E2E Tests for Intelligent Context Control
 *
 * These tests verify the full integration of the context analyzer
 * with the OpenCode handlers (WhatsApp and Slack).
 *
 * Prerequisites:
 * - OpenCode server running (./run.sh dev)
 * - E2E_TESTS=true environment variable
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { execSync } from 'child_process';

// Import the handlers
import { createOpenCodeWhatsAppHandler } from '../../packages/bot-whatsapp/src/services/openCodeWhatsAppHandler.js';
import { createOpenCodeSlackHandler } from '../../packages/bot-slack/src/services/openCodeSlackHandler.js';

// Configuration
const OPENCODE_URL = process.env.OPENCODE_URL || 'http://localhost:4099';
const TEST_TIMEOUT = 60000; // 60 seconds for AI responses
const e2eEnabled = process.env.E2E_TESTS === 'true';

// Synchronous availability check at module load time
function isOpenCodeAvailableSync(): boolean {
  try {
    const result = execSync(`curl -s --connect-timeout 2 ${OPENCODE_URL}/global/health`, {
      encoding: 'utf-8',
      timeout: 5000,
    });
    const health = JSON.parse(result);
    return health.healthy === true;
  } catch {
    return false;
  }
}

const openCodeAvailable = isOpenCodeAvailableSync();

// Helper to generate unique context keys for test isolation
function generateTestContextKey(testName: string): string {
  return `test-e2e-context-${testName}-${Date.now()}`;
}

describe('Intelligent Context Control E2E Tests', () => {
  // Skip all tests if prerequisites not met
  describe.skipIf(!e2eEnabled || !openCodeAvailable)('WhatsApp Handler Context Analysis', () => {
    let handler: ReturnType<typeof createOpenCodeWhatsAppHandler>;
    const testPhone = '1234567890';

    beforeAll(() => {
      handler = createOpenCodeWhatsAppHandler({
        serverUrl: OPENCODE_URL,
        defaultModel: 'opencode/grok-code',
      });
      console.log(`E2E: WhatsApp handler initialized with OpenCode at ${OPENCODE_URL}`);
    });

    it(
      'should process message and track keywords in context',
      async () => {
        const context = {
          phone: testPhone,
          jid: `${generateTestContextKey('keywords')}@s.whatsapp.net`,
          isGroup: false,
        };

        // First message about databases
        const result1 = await handler.processMessage(
          'Help me create a database migration for the users table',
          context
        );

        expect(result1.text).toBeDefined();
        expect(result1.text.length).toBeGreaterThan(0);

        // Second message continuing the topic - should not get suggestion
        const result2 = await handler.processMessage(
          'Now add an index on the email column',
          context
        );

        expect(result2.text).toBeDefined();
        // Should NOT contain topic shift suggestion (same topic)
        expect(result2.text).not.toContain('/clear');
      },
      TEST_TIMEOUT
    );

    it(
      'should suggest clear on topic shift after sufficient history',
      async () => {
        const context = {
          phone: testPhone,
          jid: `${generateTestContextKey('topicshift')}@s.whatsapp.net`,
          isGroup: false,
        };

        // Build up conversation history about databases
        await handler.processMessage('Tell me about PostgreSQL indexes', context);
        await handler.processMessage('How do I optimize slow queries?', context);
        await handler.processMessage('What about table partitioning?', context);
        await handler.processMessage('Explain database replication', context);
        await handler.processMessage('How do I backup PostgreSQL?', context);

        // Now completely change topic
        const result = await handler.processMessage(
          'Can you write me a poem about the ocean?',
          context
        );

        // Should contain topic shift suggestion
        // Note: The suggestion is appended after the AI response
        expect(result.text).toContain('/clear');
      },
      TEST_TIMEOUT * 6 // Multiple messages
    );

    it(
      'should suggest compact on frustration detection',
      async () => {
        const context = {
          phone: testPhone,
          jid: `${generateTestContextKey('frustration')}@s.whatsapp.net`,
          isGroup: false,
        };

        // First establish some context
        await handler.processMessage('Help me with my code', context);

        // Express frustration
        const result = await handler.processMessage(
          "forget that, you're not understanding what I need",
          context
        );

        // Should contain frustration suggestion (compact)
        expect(result.text).toContain('/compact');
      },
      TEST_TIMEOUT * 2
    );

    it(
      'should reset context counters on /reset command',
      async () => {
        const context = {
          phone: testPhone,
          jid: `${generateTestContextKey('reset')}@s.whatsapp.net`,
          isGroup: false,
        };

        // Build some context
        await handler.processMessage('Talk about databases', context);
        await handler.processMessage('More about PostgreSQL', context);

        // Reset
        const resetResult = await handler.processMessage('/reset', context);
        expect(resetResult.text).toContain('Session cleared');

        // After reset, new topic should not trigger suggestion (fresh start)
        const newTopicResult = await handler.processMessage(
          'Now tell me about cooking recipes',
          context
        );

        // Should NOT suggest clear (context was reset)
        expect(newTopicResult.text).not.toContain('/clear');
      },
      TEST_TIMEOUT * 3
    );
  });

  describe.skipIf(!e2eEnabled || !openCodeAvailable)('Slack Handler Context Analysis', () => {
    let handler: ReturnType<typeof createOpenCodeSlackHandler>;

    beforeAll(() => {
      handler = createOpenCodeSlackHandler({
        serverUrl: OPENCODE_URL,
        defaultModel: 'opencode/grok-code',
      });
      console.log(`E2E: Slack handler initialized with OpenCode at ${OPENCODE_URL}`);
    });

    it(
      'should process Slack messages with context tracking',
      async () => {
        const context = {
          channelId: generateTestContextKey('slack-basic'),
          userId: 'U12345678',
          userName: 'TestUser',
          channelType: 'channel' as const,
        };

        const result = await handler.processMessage(
          'Help me understand the codebase architecture',
          context
        );

        expect(result.text).toBeDefined();
        expect(result.text.length).toBeGreaterThan(0);
      },
      TEST_TIMEOUT
    );

    it(
      'should use Slack-specific emoji for suggestions',
      async () => {
        const context = {
          channelId: generateTestContextKey('slack-emoji'),
          userId: 'U12345678',
          userName: 'TestUser',
          channelType: 'channel' as const,
        };

        // Build context
        for (let i = 0; i < 5; i++) {
          await handler.processMessage(`Database question ${i + 1}`, context);
        }

        // Trigger topic shift
        const result = await handler.processMessage('What is the meaning of life?', context);

        // Slack should use :bulb: emoji (not the WhatsApp emoji)
        if (result.text.includes('/clear')) {
          expect(result.text).toContain(':bulb:');
        }
      },
      TEST_TIMEOUT * 6
    );

    it(
      'should handle thread context separately',
      async () => {
        const channelId = generateTestContextKey('slack-thread');

        const mainContext = {
          channelId,
          userId: 'U12345678',
          userName: 'TestUser',
          channelType: 'channel' as const,
        };

        const threadContext = {
          channelId,
          userId: 'U12345678',
          userName: 'TestUser',
          channelType: 'channel' as const,
          threadTs: '1234567890.123456',
        };

        // Message in main channel
        await handler.processMessage('Main channel: database question', mainContext);

        // Message in thread (should have separate context)
        const threadResult = await handler.processMessage(
          'Thread: completely different topic about cooking',
          threadContext
        );

        // Thread should not trigger topic shift (separate context)
        expect(threadResult.text).not.toContain('/clear');
      },
      TEST_TIMEOUT * 2
    );
  });

  describe.skipIf(!e2eEnabled || !openCodeAvailable)('Cross-Platform Consistency', () => {
    let whatsappHandler: ReturnType<typeof createOpenCodeWhatsAppHandler>;
    let slackHandler: ReturnType<typeof createOpenCodeSlackHandler>;

    beforeAll(() => {
      whatsappHandler = createOpenCodeWhatsAppHandler({
        serverUrl: OPENCODE_URL,
        defaultModel: 'opencode/grok-code',
      });
      slackHandler = createOpenCodeSlackHandler({
        serverUrl: OPENCODE_URL,
        defaultModel: 'opencode/grok-code',
      });
    });

    it(
      'should detect same frustration patterns on both platforms',
      async () => {
        const frustrationMessage = "forget everything, let's start over";

        const whatsappContext = {
          phone: '1234567890',
          jid: `${generateTestContextKey('cross-wa')}@s.whatsapp.net`,
          isGroup: false,
        };

        const slackContext = {
          channelId: generateTestContextKey('cross-slack'),
          userId: 'U12345678',
          userName: 'TestUser',
          channelType: 'channel' as const,
        };

        const [waResult, slackResult] = await Promise.all([
          whatsappHandler.processMessage(frustrationMessage, whatsappContext),
          slackHandler.processMessage(frustrationMessage, slackContext),
        ]);

        // Both should detect frustration and suggest compact
        expect(waResult.text).toContain('/compact');
        expect(slackResult.text).toContain('/compact');
      },
      TEST_TIMEOUT * 2
    );
  });
});

// Availability status logging
if (!e2eEnabled) {
  console.log('E2E tests skipped: E2E_TESTS environment variable not set to "true"');
}
if (!openCodeAvailable) {
  console.log(`E2E tests skipped: OpenCode server not available at ${OPENCODE_URL}`);
  console.log('Start with: ./run.sh dev');
}
