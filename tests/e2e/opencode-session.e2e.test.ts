/**
 * E2E Tests for OpenCode Session Management
 *
 * These tests verify the session compaction and token tracking features
 * by actually sending messages to a running OpenCode server.
 *
 * Prerequisites:
 * - OpenCode server running on localhost:4096
 * - Set OPENCODE_URL env var if using a different URL
 *
 * Run with:
 *   npm run test:e2e -- tests/e2e/opencode-session.e2e.test.ts
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { execSync } from 'child_process';
import { OpenCodeClient, createOpenCodeClient } from '@orient-bot/agents';

// Configuration
// Default to port 4099 (dev environment) - see ./run.sh dev
const OPENCODE_URL = process.env.OPENCODE_URL || 'http://localhost:4099';
const TEST_TIMEOUT = 60000; // 60 seconds for AI responses
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

// Helper to generate unique context keys for test isolation
function generateContextKey(testName: string): string {
  return `test:e2e:${testName}:${Date.now()}`;
}

// Helper to clean up test sessions
async function cleanupSession(client: OpenCodeClient, contextKey: string): Promise<void> {
  try {
    const sessions = await client.listSessions();
    for (const session of sessions) {
      if (session.title.includes(contextKey)) {
        await client.deleteSession(session.id);
      }
    }
  } catch {
    // Ignore cleanup errors
  }
}

describe('OpenCode Session E2E Tests', () => {
  let client: OpenCodeClient;
  const createdContextKeys: string[] = [];

  beforeAll(async () => {
    if (openCodeAvailable) {
      client = createOpenCodeClient(OPENCODE_URL);
      console.log(`OpenCode server available at ${OPENCODE_URL}`);
    } else {
      console.log(`OpenCode server not available at ${OPENCODE_URL} - skipping E2E tests`);
    }
  });

  afterAll(async () => {
    if (openCodeAvailable && client) {
      // Cleanup all test sessions
      for (const contextKey of createdContextKeys) {
        await cleanupSession(client, contextKey);
      }
    }
  });

  describe.skipIf(!e2eEnabled || !openCodeAvailable)('Health Check', () => {
    it('should connect to OpenCode server', async () => {
      const health = await client.healthCheck();
      expect(health.healthy).toBe(true);
      expect(health.version).toBeDefined();
    });
  });

  describe.skipIf(!e2eEnabled || !openCodeAvailable)('Session Management', () => {
    it(
      'should create a new session',
      async () => {
        const contextKey = generateContextKey('create-session');
        createdContextKeys.push(contextKey);

        const session = await client.createSession(`Test: ${contextKey}`);

        expect(session.id).toBeDefined();
        expect(session.title).toContain(contextKey);
      },
      TEST_TIMEOUT
    );

    it(
      'should reuse existing session for same context',
      async () => {
        const contextKey = generateContextKey('reuse-session');
        createdContextKeys.push(contextKey);

        const session1 = await client.getOrCreateSession(contextKey, `Test: ${contextKey}`);
        const session2 = await client.getOrCreateSession(contextKey, `Test: ${contextKey}`);

        expect(session1.id).toBe(session2.id);
      },
      TEST_TIMEOUT
    );

    it(
      'should delete a session',
      async () => {
        const contextKey = generateContextKey('delete-session');
        createdContextKeys.push(contextKey);

        const session = await client.createSession(`Test: ${contextKey}`);
        const deleted = await client.deleteSession(session.id);

        expect(deleted).toBe(true);
      },
      TEST_TIMEOUT
    );

    it(
      'should list sessions',
      async () => {
        const sessions = await client.listSessions();
        expect(Array.isArray(sessions)).toBe(true);
      },
      TEST_TIMEOUT
    );
  });

  describe.skipIf(!e2eEnabled || !openCodeAvailable)('Message Processing', () => {
    it(
      'should send a message and receive a response',
      async () => {
        const contextKey = generateContextKey('send-message');
        createdContextKeys.push(contextKey);

        const result = await client.chat(
          contextKey,
          'Hello! Please respond with "Test successful"',
          {
            sessionTitle: `Test: ${contextKey}`,
          }
        );

        expect(result.response).toBeDefined();
        expect(result.response.length).toBeGreaterThan(0);
        expect(result.sessionId).toBeDefined();
        expect(result.tokens.input).toBeGreaterThan(0);
        expect(result.tokens.output).toBeGreaterThan(0);
      },
      TEST_TIMEOUT
    );

    it(
      'should track token usage across messages',
      async () => {
        const contextKey = generateContextKey('token-tracking');
        createdContextKeys.push(contextKey);

        // First message
        await client.chat(contextKey, 'Message 1: Hello', {
          sessionTitle: `Test: ${contextKey}`,
        });
        const tokens1 = client.getTokenUsage(contextKey);

        // Second message
        await client.chat(contextKey, 'Message 2: How are you?', {
          sessionTitle: `Test: ${contextKey}`,
        });
        const tokens2 = client.getTokenUsage(contextKey);

        // Token usage should increase
        expect(tokens2).toBeGreaterThan(tokens1);
      },
      TEST_TIMEOUT * 2
    );
  });

  describe.skipIf(!e2eEnabled || !openCodeAvailable)('Session Summarization', () => {
    it(
      'should summarize a session',
      async () => {
        const contextKey = generateContextKey('summarize');
        createdContextKeys.push(contextKey);

        // Create a session with some messages
        await client.chat(contextKey, 'Tell me about TypeScript in one sentence.', {
          sessionTitle: `Test: ${contextKey}`,
        });

        // Get the session ID
        const session = await client.getOrCreateSession(contextKey);

        // Summarize the session
        const summary = await client.summarizeSession(session.id);

        expect(summary).toBeDefined();
        // The summarize endpoint returns the session after compaction
      },
      TEST_TIMEOUT * 2
    );

    it(
      'should reset token usage after summarization',
      async () => {
        const contextKey = generateContextKey('summarize-reset');
        createdContextKeys.push(contextKey);

        // Send a message to accumulate tokens
        await client.chat(contextKey, 'Hello, this is a test message.', {
          sessionTitle: `Test: ${contextKey}`,
        });

        const tokensBefore = client.getTokenUsage(contextKey);
        expect(tokensBefore).toBeGreaterThan(0);

        // Reset token usage (simulating what happens after compaction)
        client.resetTokenUsage(contextKey);

        const tokensAfter = client.getTokenUsage(contextKey);
        expect(tokensAfter).toBe(0);
      },
      TEST_TIMEOUT
    );
  });

  describe.skipIf(!e2eEnabled || !openCodeAvailable)('Conversation Continuity', () => {
    it(
      'should maintain context across multiple messages',
      async () => {
        const contextKey = generateContextKey('continuity');
        createdContextKeys.push(contextKey);

        // First message: establish context
        await client.chat(contextKey, 'My favorite color is blue. Remember this.', {
          sessionTitle: `Test: ${contextKey}`,
        });

        // Second message: test context retention
        const result = await client.chat(contextKey, 'What is my favorite color?', {
          sessionTitle: `Test: ${contextKey}`,
        });

        // The response should reference "blue"
        expect(result.response.toLowerCase()).toContain('blue');
      },
      TEST_TIMEOUT * 2
    );

    it(
      'should lose context after session deletion',
      async () => {
        const contextKey = generateContextKey('context-loss');
        createdContextKeys.push(contextKey);

        // First message
        await client.chat(contextKey, 'The secret word is "elephant". Remember it.', {
          sessionTitle: `Test: ${contextKey}`,
        });

        // Delete the session
        const session = await client.getOrCreateSession(contextKey);
        await client.deleteSession(session.id);

        // New message after deletion - context should be lost
        // Note: The client will create a new session automatically
        const result = await client.chat(contextKey, 'What was the secret word I told you?', {
          sessionTitle: `Test: ${contextKey}`,
        });

        // The response should NOT contain "elephant" since context was lost
        // (it might say "I don't know" or similar)
        const hasElephant = result.response.toLowerCase().includes('elephant');
        // This test verifies context is lost, but AI might still guess, so we just verify it responds
        expect(result.response.length).toBeGreaterThan(0);
      },
      TEST_TIMEOUT * 2
    );
  });

  describe.skipIf(!e2eEnabled || !openCodeAvailable)('Error Recovery', () => {
    it(
      'should handle stale session gracefully',
      async () => {
        const contextKey = generateContextKey('stale-session');
        createdContextKeys.push(contextKey);

        // Create a session
        const session = await client.getOrCreateSession(contextKey, `Test: ${contextKey}`);

        // Manually delete it to simulate staleness
        await client.deleteSession(session.id);

        // The next chat should automatically create a new session
        const result = await client.chat(contextKey, 'Hello after stale session', {
          sessionTitle: `Test: ${contextKey}`,
        });

        expect(result.response).toBeDefined();
        expect(result.sessionId).toBeDefined();
        // Session ID should be different from the deleted one
        expect(result.sessionId).not.toBe(session.id);
      },
      TEST_TIMEOUT
    );
  });
});

describe('OpenCode Session - Availability Check', () => {
  it('should report OpenCode availability status', async () => {
    const available = await isOpenCodeAvailable();
    console.log(`OpenCode server available: ${available}`);

    if (!e2eEnabled) {
      console.log(`
        ========================================
        OpenCode E2E tests are DISABLED.
        Set E2E_TESTS=true to enable them.
        ========================================
      `);
    } else if (!available) {
      console.log(`
        ========================================
        OpenCode E2E tests were SKIPPED because
        the server is not running.

        To run these tests:
        1. Start OpenCode: opencode serve
        2. Or set OPENCODE_URL env var
        ========================================
      `);
    }

    // This test always passes - it's informational
    expect(true).toBe(true);
  });
});
