/**
 * E2E Tests for System Prompts via MCP Tools
 *
 * These tests verify that the config_* MCP tools work correctly for managing
 * system prompts for WhatsApp and Slack platforms.
 *
 * Prerequisites:
 * - OpenCode server running on localhost:4099
 *
 * Run with:
 *   E2E_TESTS=true npm run test:e2e -- tests/e2e/system-prompts.e2e.test.ts
 *
 * Note: Agent tests are slow (10-60s per message). The quick tests verify
 * tool discovery, while the slow tests verify the full set/confirm flow.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { execSync } from 'child_process';

// Configuration
const OPENCODE_URL = process.env.OPENCODE_URL || 'http://localhost:4099';
const TEST_TIMEOUT = 120000; // 120 seconds for agent responses
const e2eEnabled = process.env.E2E_TESTS === 'true';
const runSlowTests = process.env.RUN_SLOW_TESTS === 'true';

// Check if OpenCode is available
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

const openCodeAvailable = e2eEnabled && isOpenCodeAvailableSync();

// Helper to send message to OpenCode and get response
async function sendMessage(sessionId: string, message: string): Promise<string> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 90000);

  try {
    const response = await fetch(`${OPENCODE_URL}/session/${sessionId}/message`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        parts: [{ type: 'text', text: message }],
        agent: 'onboarder',
      }),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      throw new Error(`Failed to send message: ${response.statusText}`);
    }

    const result = await response.json();
    const textParts = result.parts?.filter((p: { type: string }) => p.type === 'text') || [];
    return textParts.map((p: { text: string }) => p.text).join('\n');
  } catch (error) {
    clearTimeout(timeoutId);
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error('Request timed out after 90 seconds');
    }
    throw error;
  }
}

// Helper to create a session
async function createSession(title: string): Promise<string> {
  const response = await fetch(`${OPENCODE_URL}/session`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ title }),
  });

  if (!response.ok) {
    throw new Error(`Failed to create session: ${response.statusText}`);
  }

  const session = await response.json();
  return session.id;
}

// Helper to delete a session
async function deleteSession(sessionId: string): Promise<void> {
  await fetch(`${OPENCODE_URL}/session/${sessionId}`, { method: 'DELETE' });
}

describe('System Prompts E2E Tests', () => {
  let testSessionId: string;

  beforeAll(async () => {
    if (openCodeAvailable) {
      testSessionId = await createSession(`E2E Test: System Prompts ${Date.now()}`);
      console.log(`Created test session: ${testSessionId}`);
    }
  });

  afterAll(async () => {
    if (openCodeAvailable && testSessionId) {
      await deleteSession(testSessionId);
      console.log(`Deleted test session: ${testSessionId}`);
    }
  });

  describe.skipIf(!e2eEnabled || !openCodeAvailable)('Quick: Tool Discovery', () => {
    it(
      'should discover config tools in system category',
      async () => {
        const response = await sendMessage(
          testSessionId,
          'Use discover_tools with mode=browse and category=system. Show the tool names only.'
        );

        // Verify config tools are present in the response
        expect(response).toContain('config_set_prompt');
        expect(response).toContain('config_get_prompt');
        expect(response).toContain('config_confirm_action');
        expect(response).toContain('config_list_prompts');
      },
      TEST_TIMEOUT
    );
  });

  describe.skipIf(!e2eEnabled || !openCodeAvailable || !runSlowTests)(
    'Slow: Prompt Management',
    () => {
      // These tests are slow because they require multiple agent interactions

      it(
        'should set and verify WhatsApp prompt',
        async () => {
          const timestamp = Date.now();
          const testPrompt = `E2E Test WhatsApp - ${timestamp}`;

          // Set the prompt with immediate confirmation
          const setResponse = await sendMessage(
            testSessionId,
            `Set the WhatsApp platform prompt to "${testPrompt}". Use config_set_prompt then immediately use config_confirm_action to execute it. Do not wait for approval.`
          );

          console.log('Set response:', setResponse.substring(0, 200));

          // Wait for persistence
          await new Promise((r) => setTimeout(r, 1000));

          // Verify the prompt was saved
          const getResponse = await sendMessage(
            testSessionId,
            'Get the WhatsApp platform prompt using config_get_prompt.'
          );

          console.log('Get response:', getResponse.substring(0, 200));
          expect(getResponse).toContain(String(timestamp));
        },
        TEST_TIMEOUT * 2
      );

      it(
        'should set and verify Slack prompt',
        async () => {
          const timestamp = Date.now();
          const testPrompt = `E2E Test Slack - ${timestamp}`;

          const setResponse = await sendMessage(
            testSessionId,
            `Update the Slack platform prompt to "${testPrompt}". Call config_set_prompt then config_confirm_action immediately.`
          );

          console.log('Set response:', setResponse.substring(0, 200));
          await new Promise((r) => setTimeout(r, 1000));

          const getResponse = await sendMessage(
            testSessionId,
            'Show the current Slack platform prompt.'
          );

          console.log('Get response:', getResponse.substring(0, 200));
          expect(getResponse).toContain(String(timestamp));
        },
        TEST_TIMEOUT * 2
      );
    }
  );
});

describe('System Prompts - Availability Check', () => {
  it('should report service availability', async () => {
    console.log(`OpenCode available: ${openCodeAvailable} (${OPENCODE_URL})`);
    console.log(`Slow tests enabled: ${runSlowTests}`);

    if (!e2eEnabled) {
      console.log(`
        ========================================
        System Prompts E2E tests are DISABLED.
        Set E2E_TESTS=true to enable them.
        ========================================
      `);
    } else if (!openCodeAvailable) {
      console.log(`
        ========================================
        OpenCode not available at ${OPENCODE_URL}.
        Start OpenCode first with: opencode serve
        ========================================
      `);
    } else if (!runSlowTests) {
      console.log(`
        ========================================
        Slow tests are skipped by default.
        Set RUN_SLOW_TESTS=true to run them.
        ========================================
      `);
    }

    expect(true).toBe(true);
  });
});
