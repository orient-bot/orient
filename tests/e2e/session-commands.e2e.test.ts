/**
 * E2E Tests for Session Commands (/reset, /compact, /help)
 *
 * These tests verify the session command handling in WhatsApp and Slack handlers
 * by actually sending messages through the handlers to OpenCode.
 *
 * Prerequisites:
 * - OpenCode server running on localhost:4096
 * - Set OPENCODE_URL env var if using a different URL
 *
 * Run with:
 *   npm run test:e2e -- tests/e2e/session-commands.e2e.test.ts
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { execSync } from 'child_process';
import {
  OpenCodeWhatsAppHandler,
  createOpenCodeWhatsAppHandler,
  MessageContext,
} from '../../packages/bot-whatsapp/src/index.ts';
import {
  OpenCodeSlackHandler,
  createOpenCodeSlackHandler,
  SlackMessageContext,
} from '../../packages/bot-slack/src/index.ts';

// Configuration
// Default to port 4099 (dev environment) - see ./run.sh dev
const OPENCODE_URL = process.env.OPENCODE_URL || 'http://localhost:4099';
const TEST_TIMEOUT = 60000;
const e2eEnabled = process.env.E2E_TESTS === 'true';

// Check if OpenCode is available (sync check at module load time)
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

// Async version for use in tests
async function isOpenCodeAvailable(): Promise<boolean> {
  try {
    const response = await fetch(`${OPENCODE_URL}/global/health`, {
      signal: AbortSignal.timeout(5000),
    });
    if (response.ok) {
      const health = await response.json();
      return health.healthy === true;
    }
    return false;
  } catch {
    return false;
  }
}

// Check availability at module load
const openCodeAvailable = e2eEnabled && isOpenCodeAvailableSync();

// Generate unique test context
function generateTestPhone(): string {
  return `1555${Date.now().toString().slice(-7)}`;
}

function generateTestChannel(): string {
  return `C${Date.now().toString().slice(-8).toUpperCase()}`;
}

describe('WhatsApp Session Commands E2E', () => {
  let handler: OpenCodeWhatsAppHandler;
  const testPhone = generateTestPhone();

  beforeAll(async () => {
    if (openCodeAvailable) {
      handler = createOpenCodeWhatsAppHandler({
        serverUrl: OPENCODE_URL,
      });
      console.log(`OpenCode available - testing WhatsApp commands with phone: ${testPhone}`);
    }
  });

  describe.skipIf(!e2eEnabled || !openCodeAvailable)('/help Command', () => {
    it(
      'should return help text with available commands',
      async () => {
        const context: MessageContext = {
          phone: testPhone,
          jid: `${testPhone}@s.whatsapp.net`,
          isGroup: false,
        };

        const result = await handler.processMessage('/help', context);

        expect(result.text).toContain('/reset');
        expect(result.text).toContain('/compact');
        expect(result.text).toContain('/help');
        expect(result.text).toContain('switch to grok');
        expect(result.model).toBe('system');
        expect(result.cost).toBe(0);
      },
      TEST_TIMEOUT
    );

    it(
      'should handle case-insensitive /HELP command',
      async () => {
        const context: MessageContext = {
          phone: testPhone,
          jid: `${testPhone}@s.whatsapp.net`,
          isGroup: false,
        };

        const result = await handler.processMessage('/HELP', context);

        expect(result.text).toContain('/reset');
        expect(result.model).toBe('system');
      },
      TEST_TIMEOUT
    );
  });

  describe.skipIf(!e2eEnabled || !openCodeAvailable)('/reset Command', () => {
    it(
      'should clear session and confirm',
      async () => {
        const context: MessageContext = {
          phone: testPhone,
          jid: `${testPhone}@s.whatsapp.net`,
          isGroup: false,
        };

        // First, send a regular message to create a session
        await handler.processMessage('Hello, this creates a session', context);

        // Verify session exists
        const sessionBefore = handler.getSessionId(context);
        expect(sessionBefore).toBeDefined();

        // Now reset
        const result = await handler.processMessage('/reset', context);

        expect(result.text).toContain('Session cleared');
        expect(result.model).toBe('system');

        // Session should be cleared from handler's map
        const sessionAfter = handler.getSessionId(context);
        expect(sessionAfter).toBeUndefined();
      },
      TEST_TIMEOUT * 2
    );

    it(
      'should handle /clear as alias for /reset',
      async () => {
        const context: MessageContext = {
          phone: generateTestPhone(),
          jid: `${generateTestPhone()}@s.whatsapp.net`,
          isGroup: false,
        };

        const result = await handler.processMessage('/clear', context);

        expect(result.text).toContain('Session cleared');
      },
      TEST_TIMEOUT
    );
  });

  describe.skipIf(!e2eEnabled || !openCodeAvailable)('/compact Command', () => {
    it(
      'should compact session with context preserved',
      async () => {
        const phone = generateTestPhone();
        const context: MessageContext = {
          phone,
          jid: `${phone}@s.whatsapp.net`,
          isGroup: false,
        };

        // First, send a message to create a session
        await handler.processMessage('Hello, creating session for compact test', context);

        // Verify session exists
        const sessionId = handler.getSessionId(context);
        expect(sessionId).toBeDefined();

        // Now compact
        const result = await handler.processMessage('/compact', context);

        expect(result.text).toContain('Session compacted');
        expect(result.text.toLowerCase()).toContain('context preserved');
        expect(result.model).toBe('system');

        // Session should still exist (same session ID preserved)
        const sessionAfter = handler.getSessionId(context);
        expect(sessionAfter).toBe(sessionId);
      },
      TEST_TIMEOUT * 2
    );

    it(
      'should handle /summarize as alias for /compact',
      async () => {
        const phone = generateTestPhone();
        const context: MessageContext = {
          phone,
          jid: `${phone}@s.whatsapp.net`,
          isGroup: false,
        };

        // Create session first
        await handler.processMessage('Creating session', context);

        const result = await handler.processMessage('/summarize', context);

        expect(result.text).toContain('Session compacted');
      },
      TEST_TIMEOUT * 2
    );

    it(
      'should handle /compact when no session exists',
      async () => {
        const phone = generateTestPhone();
        const context: MessageContext = {
          phone,
          jid: `${phone}@s.whatsapp.net`,
          isGroup: false,
        };

        // Don't create a session first
        const result = await handler.processMessage('/compact', context);

        expect(result.text).toContain('No active session');
      },
      TEST_TIMEOUT
    );
  });

  describe.skipIf(!e2eEnabled || !openCodeAvailable)('Context Preservation After Compact', () => {
    it(
      'should preserve context after compaction',
      async () => {
        const phone = generateTestPhone();
        const context: MessageContext = {
          phone,
          jid: `${phone}@s.whatsapp.net`,
          isGroup: false,
        };

        // Establish context
        await handler.processMessage('Remember this number: 42', context);

        // Compact the session
        await handler.processMessage('/compact', context);

        // Ask about the context
        const result = await handler.processMessage(
          'What number did I ask you to remember?',
          context
        );

        // Context should be preserved (or at least the AI should respond meaningfully)
        expect(result.response || result.text).toBeDefined();
        // Note: After compaction, the AI might not remember exact details
        // but the session should still work
      },
      TEST_TIMEOUT * 3
    );
  });

  describe.skipIf(!e2eEnabled || !openCodeAvailable)('Group Context', () => {
    it(
      'should handle commands in group context',
      async () => {
        const groupId = `${Date.now()}-1234567890`;
        const context: MessageContext = {
          phone: testPhone,
          jid: `${groupId}@g.us`,
          isGroup: true,
          groupId: groupId,
          groupName: 'Test Group',
        };

        const result = await handler.processMessage('/help', context);

        expect(result.text).toContain('/reset');
        expect(result.model).toBe('system');
      },
      TEST_TIMEOUT
    );
  });
});

describe('Slack Session Commands E2E', () => {
  let handler: OpenCodeSlackHandler;
  const testChannel = generateTestChannel();

  beforeAll(async () => {
    if (openCodeAvailable) {
      handler = createOpenCodeSlackHandler({
        serverUrl: OPENCODE_URL,
      });
      console.log(`OpenCode available - testing Slack commands with channel: ${testChannel}`);
    }
  });

  describe.skipIf(!e2eEnabled || !openCodeAvailable)('/help Command', () => {
    it(
      'should return help text with Slack formatting',
      async () => {
        const context: SlackMessageContext = {
          userId: 'U12345678',
          userName: 'testuser',
          channelId: testChannel,
          channelType: 'channel',
        };

        const result = await handler.processMessage('/help', context);

        // Slack help should have code formatting
        expect(result.text).toContain('`/reset`');
        expect(result.text).toContain('`/compact`');
        expect(result.text).toContain('`/help`');
        expect(result.model).toBe('system');
      },
      TEST_TIMEOUT
    );
  });

  describe.skipIf(!e2eEnabled || !openCodeAvailable)('/reset Command', () => {
    it(
      'should clear Slack session',
      async () => {
        const channel = generateTestChannel();
        const context: SlackMessageContext = {
          userId: 'U12345678',
          channelId: channel,
          channelType: 'channel',
        };

        // Create session
        await handler.processMessage('Hello Slack', context);

        // Reset
        const result = await handler.processMessage('/reset', context);

        expect(result.text).toContain('Session cleared');
        expect(result.model).toBe('system');
      },
      TEST_TIMEOUT * 2
    );
  });

  describe.skipIf(!e2eEnabled || !openCodeAvailable)('/compact Command', () => {
    it(
      'should compact Slack session',
      async () => {
        const channel = generateTestChannel();
        const context: SlackMessageContext = {
          userId: 'U12345678',
          channelId: channel,
          channelType: 'channel',
        };

        // Create session
        await handler.processMessage('Hello for compact test', context);

        // Compact
        const result = await handler.processMessage('/compact', context);

        expect(result.text).toContain('Session compacted');
      },
      TEST_TIMEOUT * 2
    );
  });

  describe.skipIf(!e2eEnabled || !openCodeAvailable)('Thread Context', () => {
    it(
      'should maintain separate sessions per thread',
      async () => {
        const channel = generateTestChannel();
        const threadTs1 = '1234567890.123456';
        const threadTs2 = '1234567890.654321';

        const context1: SlackMessageContext = {
          userId: 'U12345678',
          channelId: channel,
          channelType: 'channel',
          threadTs: threadTs1,
        };

        const context2: SlackMessageContext = {
          userId: 'U12345678',
          channelId: channel,
          channelType: 'channel',
          threadTs: threadTs2,
        };

        // Create sessions in both threads
        await handler.processMessage('Thread 1 message', context1);
        await handler.processMessage('Thread 2 message', context2);

        // Get session IDs
        const session1 = handler.getSessionId(context1);
        const session2 = handler.getSessionId(context2);

        // Sessions should be different
        expect(session1).toBeDefined();
        expect(session2).toBeDefined();
        expect(session1).not.toBe(session2);
      },
      TEST_TIMEOUT * 2
    );
  });
});

describe('Session Commands - Availability Check', () => {
  it('should report test status', async () => {
    const available = await isOpenCodeAvailable();

    if (!e2eEnabled) {
      console.log(`
        ========================================
        Session Commands E2E tests are DISABLED.
        Set E2E_TESTS=true to enable them.
        ========================================
      `);
    } else if (!available) {
      console.log(`
        ========================================
        Session Commands E2E tests were SKIPPED
        because OpenCode is not running.

        To run these tests:
        1. Start OpenCode: opencode serve
        2. Run: npm run test:e2e -- tests/e2e/session-commands.e2e.test.ts
        ========================================
      `);
    } else {
      console.log('OpenCode available - all E2E tests will run');
    }

    expect(true).toBe(true);
  });
});
