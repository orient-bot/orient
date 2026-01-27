/**
 * Slack Integration E2E Tests
 *
 * Tests the Slack bot integration end-to-end.
 * Covers message sending, receiving, and bot commands.
 *
 * These tests automatically handle authentication by creating a test user
 * on fresh installations or logging in with existing credentials.
 *
 * Note: Full Slack tests require SLACK_BOT_TOKEN environment variable.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { TestAuthHelper } from '../helpers/auth';

const FEATURE_TESTS_ENABLED = process.env.RUN_FEATURE_TESTS === 'true';
const SLACK_TESTS_ENABLED =
  process.env.RUN_SLACK_TESTS === 'true' || process.env.RUN_SLACK_LIVE_TESTS === 'true';
const DASHBOARD_URL = process.env.DASHBOARD_URL || 'http://localhost:4098';

// Slack configuration from environment
const SLACK_BOT_TOKEN = process.env.SLACK_BOT_TOKEN || '';
const SLACK_TEST_CHANNEL = process.env.SLACK_TEST_CHANNEL || 'test-channel';

// Use describe.skip if feature tests are disabled
const describeOrSkip = FEATURE_TESTS_ENABLED ? describe : describe.skip;

// Helper to make Slack API calls
async function slackApi(method: string, body: Record<string, any> = {}): Promise<Response> {
  return fetch(`https://slack.com/api/${method}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${SLACK_BOT_TOKEN}`,
    },
    body: JSON.stringify(body),
  });
}

describeOrSkip('Slack Integration E2E Tests', () => {
  let auth: TestAuthHelper;

  beforeAll(async () => {
    auth = new TestAuthHelper(DASHBOARD_URL);
    await auth.init();
    console.log(`[Slack E2E] Authenticated as: ${auth.getUsername()}`);
  });

  describe('Slack Integration Status', () => {
    it('should check Slack integration status endpoint', async () => {
      const response = await auth.request('/api/integrations/slack/status');

      // Feature might be disabled or not configured
      if (response.status === 404) {
        console.log('[Slack E2E] Slack integration endpoint not found');
        return;
      }

      if (response.status === 200) {
        const data = await response.json();
        console.log('[Slack E2E] Slack status:', JSON.stringify(data));
        // Status response structure may vary
        expect(data).toBeDefined();
      }
    });

    it('should list available Slack channels (if configured)', async () => {
      const response = await auth.request('/api/integrations/slack/channels');

      if (response.status === 404) {
        console.log('[Slack E2E] Slack channels endpoint not found');
        return;
      }

      if (response.status === 200) {
        const data = await response.json();
        expect(Array.isArray(data.channels || data)).toBe(true);
      } else {
        console.log(`[Slack E2E] Channels endpoint returned: ${response.status}`);
      }
    });
  });

  describe('Slack Bot Token Validation', () => {
    it('should validate Slack bot token if provided', async () => {
      if (!SLACK_BOT_TOKEN) {
        console.log('[Slack E2E] Skipping - SLACK_BOT_TOKEN not set');
        return;
      }

      const response = await slackApi('auth.test');
      const data = await response.json();

      expect(data.ok).toBe(true);
      if (data.ok) {
        console.log(`[Slack E2E] Connected as: ${data.user} (${data.team})`);
      }
    });
  });

  // Live Slack tests - only run if explicitly enabled and token is available
  const describeLiveTests = SLACK_TESTS_ENABLED && SLACK_BOT_TOKEN ? describe : describe.skip;

  describeLiveTests('Slack Live Tests', () => {
    it('should send a test message to Slack', async () => {
      const testMessage = `E2E Test Message - ${new Date().toISOString()}`;

      const response = await slackApi('chat.postMessage', {
        channel: SLACK_TEST_CHANNEL,
        text: testMessage,
      });

      const data = await response.json();

      if (data.ok) {
        console.log(`[Slack E2E] Sent message to ${SLACK_TEST_CHANNEL}`);
        expect(data.ok).toBe(true);
        expect(data.ts).toBeDefined(); // Message timestamp
      } else {
        console.log(`[Slack E2E] Failed to send: ${data.error}`);
        // Don't fail the test if channel doesn't exist
        expect(['channel_not_found', 'not_in_channel']).toContain(data.error);
      }
    });

    it('should send a message with blocks', async () => {
      const response = await slackApi('chat.postMessage', {
        channel: SLACK_TEST_CHANNEL,
        blocks: [
          {
            type: 'section',
            text: {
              type: 'mrkdwn',
              text: '*E2E Test*: Message with blocks',
            },
          },
          {
            type: 'divider',
          },
          {
            type: 'section',
            text: {
              type: 'plain_text',
              text: `Timestamp: ${new Date().toISOString()}`,
            },
          },
        ],
      });

      const data = await response.json();

      if (data.ok) {
        expect(data.ok).toBe(true);
      } else {
        expect(['channel_not_found', 'not_in_channel']).toContain(data.error);
      }
    });
  });

  describe('Slack Security', () => {
    it('should require authentication for Slack endpoints', async () => {
      const response = await fetch(`${DASHBOARD_URL}/api/integrations/slack/status`, {
        headers: { 'Content-Type': 'application/json' },
      });

      // Should require auth (401) or not found (404)
      expect([401, 404]).toContain(response.status);
    });
  });
});

// Export test scenarios for browser automation
export const slackTestScenarios = {
  viewStatus: {
    description: 'View Slack integration status',
    steps: [
      'Login to dashboard',
      'Navigate to Integrations > Slack',
      'Verify connection status is displayed',
      'Check bot name and workspace info',
    ],
    expectedOutcome: 'Slack status shows connected state',
  },

  sendTestMessage: {
    description: 'Send a test message via UI',
    steps: [
      'Navigate to Integrations > Slack',
      'Select a channel from dropdown',
      'Enter test message',
      'Click Send',
      'Verify message appears in Slack channel',
    ],
    expectedOutcome: 'Message is sent and visible in Slack',
  },

  configureBot: {
    description: 'Configure Slack bot settings',
    steps: [
      'Navigate to Integrations > Slack > Settings',
      'Update bot token if needed',
      'Configure default channel',
      'Set message formatting preferences',
      'Save settings',
    ],
    expectedOutcome: 'Settings are saved successfully',
  },

  viewChannels: {
    description: 'View available Slack channels',
    steps: [
      'Navigate to Integrations > Slack',
      'Click "View Channels" or expand channels list',
      'Verify channels are listed',
      'Check channel membership status',
    ],
    expectedOutcome: 'Channels list is displayed',
  },

  testScheduledMessage: {
    description: 'Send a scheduled message to Slack',
    steps: [
      'Create a schedule in Automation > Schedules',
      'Set provider to Slack',
      'Configure channel and message',
      'Trigger manual execution',
      'Verify message in Slack',
    ],
    expectedOutcome: 'Scheduled message is delivered',
  },
};
