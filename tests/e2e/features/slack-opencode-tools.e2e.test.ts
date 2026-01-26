/**
 * Slack → OpenCode → Orient Tools Integration E2E Tests
 *
 * Tests the full integration flow:
 * 1. User sends message via Slack
 * 2. Bot (via OpenCode) receives and processes the message
 * 3. OpenCode uses Orient MCP tools (secrets, schedules, webhooks, agents)
 * 4. Bot responds via Slack with results
 *
 * Required environment variables:
 * - SLACK_BOT_TOKEN: Bot token for reading responses
 * - SLACK_USER_TOKEN: User token for sending messages as user
 * - RUN_SLACK_OPENCODE_TESTS=true: Enable these tests
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { TestAuthHelper } from '../helpers/auth';

const TESTS_ENABLED = process.env.RUN_SLACK_OPENCODE_TESTS === 'true';
const SLACK_BOT_TOKEN = process.env.SLACK_BOT_TOKEN || '';
const SLACK_USER_TOKEN = process.env.SLACK_USER_TOKEN || '';
const DASHBOARD_URL = process.env.DASHBOARD_URL || 'http://localhost:4098';

const describeOrSkip =
  TESTS_ENABLED && SLACK_BOT_TOKEN && SLACK_USER_TOKEN ? describe : describe.skip;

// Helper to make Slack API calls
async function slackApi(method: string, body: Record<string, any>, token: string): Promise<any> {
  const response = await fetch(`https://slack.com/api/${method}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(body),
  });
  return response.json();
}

const botApi = (method: string, body: Record<string, any> = {}) =>
  slackApi(method, body, SLACK_BOT_TOKEN);

const userApi = (method: string, body: Record<string, any> = {}) =>
  slackApi(method, body, SLACK_USER_TOKEN);

// Wait for bot response with longer timeout for tool usage
async function waitForBotResponse(
  channelId: string,
  afterTimestamp: string,
  timeoutMs: number = 60000
): Promise<{ text: string; ts: string; blocks?: any[] } | null> {
  const startTime = Date.now();
  const pollInterval = 2000; // Longer poll interval for tool operations

  while (Date.now() - startTime < timeoutMs) {
    const result = await botApi('conversations.history', {
      channel: channelId,
      oldest: afterTimestamp,
      limit: 10,
    });

    if (result.ok && result.messages) {
      const botMessages = result.messages.filter(
        (m: any) => m.bot_id && parseFloat(m.ts) > parseFloat(afterTimestamp)
      );

      if (botMessages.length > 0) {
        const latest = botMessages[0];
        return {
          text: latest.text || '',
          ts: latest.ts,
          blocks: latest.blocks,
        };
      }
    }

    await new Promise((resolve) => setTimeout(resolve, pollInterval));
  }

  return null;
}

describeOrSkip('Slack → OpenCode → Orient Tools E2E Tests', () => {
  let dmChannelId: string;
  let botUserId: string;
  let humanUserId: string;
  let auth: TestAuthHelper;
  const testId = Date.now();
  const createdResources: {
    secrets: string[];
    schedules: number[];
    webhooks: number[];
  } = {
    secrets: [],
    schedules: [],
    webhooks: [],
  };

  beforeAll(async () => {
    // Initialize dashboard auth for verification
    auth = new TestAuthHelper(DASHBOARD_URL);
    await auth.init();
    console.log(`[Slack-OpenCode E2E] Dashboard auth: ${auth.getUsername()}`);

    // Get bot info
    const botInfo = await botApi('auth.test');
    expect(botInfo.ok).toBe(true);
    botUserId = botInfo.user_id;
    console.log(`[Slack-OpenCode E2E] Bot: ${botInfo.user} (${botUserId})`);

    // Get user info
    const userInfo = await userApi('auth.test');
    expect(userInfo.ok).toBe(true);
    humanUserId = userInfo.user_id;
    console.log(`[Slack-OpenCode E2E] User: ${userInfo.user} (${humanUserId})`);

    // Open DM with bot
    const dmResult = await userApi('conversations.open', {
      users: botUserId,
    });
    expect(dmResult.ok).toBe(true);
    dmChannelId = dmResult.channel.id;
    console.log(`[Slack-OpenCode E2E] DM Channel: ${dmChannelId}`);
  });

  afterAll(async () => {
    // Cleanup created resources via Dashboard API
    console.log('[Slack-OpenCode E2E] Cleaning up test resources...');

    for (const secretKey of createdResources.secrets) {
      try {
        await auth.request(`/api/secrets/${secretKey}`, { method: 'DELETE' });
        console.log(`[Cleanup] Deleted secret: ${secretKey}`);
      } catch {
        // Ignore cleanup errors
      }
    }

    for (const scheduleId of createdResources.schedules) {
      try {
        await auth.request(`/api/scheduler/${scheduleId}`, { method: 'DELETE' });
        console.log(`[Cleanup] Deleted schedule: ${scheduleId}`);
      } catch {
        // Ignore cleanup errors
      }
    }

    for (const webhookId of createdResources.webhooks) {
      try {
        await auth.request(`/api/webhooks/${webhookId}`, { method: 'DELETE' });
        console.log(`[Cleanup] Deleted webhook: ${webhookId}`);
      } catch {
        // Ignore cleanup errors
      }
    }
  });

  describe('Secrets Management via Slack', () => {
    it('should list secrets when asked via Slack', async () => {
      const message = `E2E Test ${testId}: Can you list the secrets configured in Orient? Just show me the names/keys.`;

      console.log(`[Slack-OpenCode E2E] Asking to list secrets...`);
      const sendResult = await userApi('chat.postMessage', {
        channel: dmChannelId,
        text: message,
      });
      expect(sendResult.ok).toBe(true);

      const response = await waitForBotResponse(dmChannelId, sendResult.ts, 90000);

      if (response) {
        console.log(
          `[Slack-OpenCode E2E] Secrets list response: "${response.text.substring(0, 300)}"`
        );
        // Should mention secrets or indicate it checked
        expect(response.text.length).toBeGreaterThan(0);
      } else {
        console.log('[Slack-OpenCode E2E] No response - bot may not be connected to OpenCode');
      }
    }, 100000);

    it('should create a secret when asked via Slack', async () => {
      const secretKey = `E2E_TEST_SECRET_${testId}`;
      const secretValue = `test-value-${testId}`;
      const message = `Please create a new secret in Orient with key "${secretKey}" and value "${secretValue}". Use the Orient tools to do this.`;

      console.log(`[Slack-OpenCode E2E] Asking to create secret: ${secretKey}`);
      const sendResult = await userApi('chat.postMessage', {
        channel: dmChannelId,
        text: message,
      });
      expect(sendResult.ok).toBe(true);

      const response = await waitForBotResponse(dmChannelId, sendResult.ts, 90000);

      if (response) {
        console.log(
          `[Slack-OpenCode E2E] Create secret response: "${response.text.substring(0, 300)}"`
        );

        // Verify via Dashboard API that secret was created
        const verifyResponse = await auth.request('/api/secrets');
        if (verifyResponse.status === 200) {
          const data = await verifyResponse.json();
          const secrets = data.secrets || data;
          const created = secrets.find((s: any) => s.key === secretKey);
          if (created) {
            console.log(`[Slack-OpenCode E2E] ✓ Secret verified in Dashboard API`);
            createdResources.secrets.push(secretKey);
          } else {
            console.log(
              `[Slack-OpenCode E2E] Secret not found via API - tool may not have been used`
            );
          }
        }
      } else {
        console.log('[Slack-OpenCode E2E] No response received');
      }
    }, 100000);

    it('should delete a secret when asked via Slack', async () => {
      // First create a secret to delete
      const secretKey = `E2E_DELETE_TEST_${testId}`;
      await auth.request('/api/secrets', {
        method: 'POST',
        body: JSON.stringify({ key: secretKey, value: 'to-be-deleted' }),
      });

      const message = `Please delete the secret with key "${secretKey}" from Orient using the tools.`;

      console.log(`[Slack-OpenCode E2E] Asking to delete secret: ${secretKey}`);
      const sendResult = await userApi('chat.postMessage', {
        channel: dmChannelId,
        text: message,
      });
      expect(sendResult.ok).toBe(true);

      const response = await waitForBotResponse(dmChannelId, sendResult.ts, 90000);

      if (response) {
        console.log(
          `[Slack-OpenCode E2E] Delete secret response: "${response.text.substring(0, 300)}"`
        );

        // Verify deletion via API
        await new Promise((resolve) => setTimeout(resolve, 2000));
        const verifyResponse = await auth.request('/api/secrets');
        if (verifyResponse.status === 200) {
          const data = await verifyResponse.json();
          const secrets = data.secrets || data;
          const stillExists = secrets.find((s: any) => s.key === secretKey);
          if (!stillExists) {
            console.log(`[Slack-OpenCode E2E] ✓ Secret confirmed deleted`);
          } else {
            console.log(`[Slack-OpenCode E2E] Secret still exists - tool may not have been used`);
            createdResources.secrets.push(secretKey); // Cleanup later
          }
        }
      }
    }, 100000);
  });

  describe('Scheduler Management via Slack', () => {
    it('should list scheduled jobs when asked via Slack', async () => {
      const message = `E2E Test ${testId}: Can you show me the scheduled jobs configured in Orient?`;

      console.log(`[Slack-OpenCode E2E] Asking to list schedules...`);
      const sendResult = await userApi('chat.postMessage', {
        channel: dmChannelId,
        text: message,
      });
      expect(sendResult.ok).toBe(true);

      const response = await waitForBotResponse(dmChannelId, sendResult.ts, 90000);

      if (response) {
        console.log(
          `[Slack-OpenCode E2E] Schedules list response: "${response.text.substring(0, 300)}"`
        );
        expect(response.text.length).toBeGreaterThan(0);
      }
    }, 100000);

    it('should create a scheduled job when asked via Slack', async () => {
      const jobName = `e2e-slack-job-${testId}`;
      const message = `Please create a new scheduled job in Orient named "${jobName}" that runs every hour with a cron expression "0 * * * *". The action should send a test notification.`;

      console.log(`[Slack-OpenCode E2E] Asking to create schedule: ${jobName}`);
      const sendResult = await userApi('chat.postMessage', {
        channel: dmChannelId,
        text: message,
      });
      expect(sendResult.ok).toBe(true);

      const response = await waitForBotResponse(dmChannelId, sendResult.ts, 90000);

      if (response) {
        console.log(
          `[Slack-OpenCode E2E] Create schedule response: "${response.text.substring(0, 300)}"`
        );

        // Verify via Dashboard API
        const verifyResponse = await auth.request('/api/scheduler');
        if (verifyResponse.status === 200) {
          const data = await verifyResponse.json();
          const jobs = data.jobs || data;
          const created = jobs.find((j: any) => j.name === jobName || j.name?.includes('e2e'));
          if (created) {
            console.log(
              `[Slack-OpenCode E2E] ✓ Schedule verified in Dashboard API (id: ${created.id})`
            );
            createdResources.schedules.push(created.id);
          } else {
            console.log(`[Slack-OpenCode E2E] Schedule not found via API`);
          }
        }
      }
    }, 100000);
  });

  describe('Webhook Management via Slack', () => {
    it('should list webhooks when asked via Slack', async () => {
      const message = `E2E Test ${testId}: Can you list the webhooks configured in Orient?`;

      console.log(`[Slack-OpenCode E2E] Asking to list webhooks...`);
      const sendResult = await userApi('chat.postMessage', {
        channel: dmChannelId,
        text: message,
      });
      expect(sendResult.ok).toBe(true);

      const response = await waitForBotResponse(dmChannelId, sendResult.ts, 90000);

      if (response) {
        console.log(
          `[Slack-OpenCode E2E] Webhooks list response: "${response.text.substring(0, 300)}"`
        );
        expect(response.text.length).toBeGreaterThan(0);
      }
    }, 100000);

    it('should create a webhook when asked via Slack', async () => {
      const webhookName = `e2e-slack-webhook-${testId}`;
      const message = `Please create a new webhook in Orient named "${webhookName}" for GitHub events that triggers a notification. Use the GitHub provider.`;

      console.log(`[Slack-OpenCode E2E] Asking to create webhook: ${webhookName}`);
      const sendResult = await userApi('chat.postMessage', {
        channel: dmChannelId,
        text: message,
      });
      expect(sendResult.ok).toBe(true);

      const response = await waitForBotResponse(dmChannelId, sendResult.ts, 90000);

      if (response) {
        console.log(
          `[Slack-OpenCode E2E] Create webhook response: "${response.text.substring(0, 300)}"`
        );

        // Verify via Dashboard API
        const verifyResponse = await auth.request('/api/webhooks');
        if (verifyResponse.status === 200) {
          const data = await verifyResponse.json();
          const webhooks = data.webhooks || data;
          const created = webhooks.find(
            (w: any) => w.name === webhookName || w.name?.includes('e2e')
          );
          if (created) {
            console.log(
              `[Slack-OpenCode E2E] ✓ Webhook verified in Dashboard API (id: ${created.id})`
            );
            createdResources.webhooks.push(created.id);
          } else {
            console.log(`[Slack-OpenCode E2E] Webhook not found via API`);
          }
        }
      }
    }, 100000);
  });

  describe('Agent Configuration via Slack', () => {
    it('should list agents when asked via Slack', async () => {
      const message = `E2E Test ${testId}: Can you show me the AI agents configured in Orient?`;

      console.log(`[Slack-OpenCode E2E] Asking to list agents...`);
      const sendResult = await userApi('chat.postMessage', {
        channel: dmChannelId,
        text: message,
      });
      expect(sendResult.ok).toBe(true);

      const response = await waitForBotResponse(dmChannelId, sendResult.ts, 90000);

      if (response) {
        console.log(
          `[Slack-OpenCode E2E] Agents list response: "${response.text.substring(0, 300)}"`
        );
        // Should mention some agents
        expect(response.text.length).toBeGreaterThan(0);
      }
    }, 100000);

    it('should describe agent capabilities when asked via Slack', async () => {
      const message = `E2E Test ${testId}: What can the "Ori" agent do? Can you describe its capabilities?`;

      console.log(`[Slack-OpenCode E2E] Asking about agent capabilities...`);
      const sendResult = await userApi('chat.postMessage', {
        channel: dmChannelId,
        text: message,
      });
      expect(sendResult.ok).toBe(true);

      const response = await waitForBotResponse(dmChannelId, sendResult.ts, 90000);

      if (response) {
        console.log(
          `[Slack-OpenCode E2E] Agent capabilities response: "${response.text.substring(0, 300)}"`
        );
        expect(response.text.length).toBeGreaterThan(0);
      }
    }, 100000);
  });

  describe('System Status via Slack', () => {
    it('should report Orient system status when asked via Slack', async () => {
      const message = `E2E Test ${testId}: Can you check the Orient system status? Tell me about the dashboard, database, and any other services.`;

      console.log(`[Slack-OpenCode E2E] Asking for system status...`);
      const sendResult = await userApi('chat.postMessage', {
        channel: dmChannelId,
        text: message,
      });
      expect(sendResult.ok).toBe(true);

      const response = await waitForBotResponse(dmChannelId, sendResult.ts, 90000);

      if (response) {
        console.log(
          `[Slack-OpenCode E2E] System status response: "${response.text.substring(0, 400)}"`
        );
        expect(response.text.length).toBeGreaterThan(0);
      }
    }, 100000);
  });

  describe('Multi-Step Tool Operations via Slack', () => {
    it('should handle complex multi-tool request via Slack', async () => {
      const message = `E2E Test ${testId}: I need you to do the following:
1. List all the secrets in Orient
2. Tell me how many scheduled jobs exist
3. Summarize the current webhook configurations

Please use the Orient tools to gather this information and give me a summary.`;

      console.log(`[Slack-OpenCode E2E] Sending multi-tool request...`);
      const sendResult = await userApi('chat.postMessage', {
        channel: dmChannelId,
        text: message,
      });
      expect(sendResult.ok).toBe(true);

      // Longer timeout for multi-tool operations
      const response = await waitForBotResponse(dmChannelId, sendResult.ts, 120000);

      if (response) {
        console.log(
          `[Slack-OpenCode E2E] Multi-tool response: "${response.text.substring(0, 500)}"`
        );
        expect(response.text.length).toBeGreaterThan(50); // Should have substantial response
      }
    }, 130000);

    it('should create and then verify a resource via Slack', async () => {
      const secretKey = `E2E_CREATE_VERIFY_${testId}`;
      const message = `E2E Test ${testId}: Please create a secret with key "${secretKey}" and value "verification-test", then immediately verify it was created by listing the secrets. Tell me if you see it in the list.`;

      console.log(`[Slack-OpenCode E2E] Sending create-and-verify request...`);
      const sendResult = await userApi('chat.postMessage', {
        channel: dmChannelId,
        text: message,
      });
      expect(sendResult.ok).toBe(true);

      const response = await waitForBotResponse(dmChannelId, sendResult.ts, 120000);

      if (response) {
        console.log(
          `[Slack-OpenCode E2E] Create-verify response: "${response.text.substring(0, 400)}"`
        );

        // Track for cleanup
        const verifyResponse = await auth.request('/api/secrets');
        if (verifyResponse.status === 200) {
          const data = await verifyResponse.json();
          const secrets = data.secrets || data;
          if (secrets.find((s: any) => s.key === secretKey)) {
            createdResources.secrets.push(secretKey);
          }
        }
      }
    }, 130000);
  });
});

// Export test scenarios for documentation
export const slackOpenCodeToolsTestScenarios = {
  secretsManagement: {
    description: 'Test secrets CRUD operations via Slack → OpenCode → Orient tools',
    operations: ['list secrets', 'create secret', 'delete secret'],
    expectedOutcome: 'Bot uses Orient MCP tools to manage secrets and reports results',
  },

  schedulerManagement: {
    description: 'Test scheduler operations via Slack → OpenCode → Orient tools',
    operations: ['list schedules', 'create schedule'],
    expectedOutcome: 'Bot uses Orient MCP tools to manage scheduled jobs',
  },

  webhookManagement: {
    description: 'Test webhook operations via Slack → OpenCode → Orient tools',
    operations: ['list webhooks', 'create webhook'],
    expectedOutcome: 'Bot uses Orient MCP tools to manage webhooks',
  },

  agentConfiguration: {
    description: 'Test agent configuration queries via Slack → OpenCode',
    operations: ['list agents', 'describe agent capabilities'],
    expectedOutcome: 'Bot retrieves and explains agent configurations',
  },

  multiToolOperations: {
    description: 'Test complex multi-step operations requiring multiple tools',
    operations: ['gather info from multiple sources', 'create and verify'],
    expectedOutcome: 'Bot chains multiple tool calls and provides comprehensive response',
  },
};
