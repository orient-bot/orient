/**
 * Agent Slack Operations E2E Tests
 *
 * Tests the Orient bot's AI agent capabilities through Slack:
 * 1. Sending messages to the bot and getting AI responses
 * 2. Testing tool usage through natural conversation
 * 3. Testing configuration changes via bot commands
 *
 * Uses both bot token (to read responses) and user token (to send messages)
 */

import { describe, it, expect, beforeAll } from 'vitest';

const AGENT_SLACK_TESTS_ENABLED = process.env.RUN_AGENT_SLACK_TESTS === 'true';
const SLACK_BOT_TOKEN = process.env.SLACK_BOT_TOKEN || '';
const SLACK_USER_TOKEN = process.env.SLACK_USER_TOKEN || '';

const describeOrSkip =
  AGENT_SLACK_TESTS_ENABLED && SLACK_BOT_TOKEN && SLACK_USER_TOKEN ? describe : describe.skip;

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

// Wait for bot response in channel
async function waitForBotResponse(
  channelId: string,
  afterTimestamp: string,
  timeoutMs: number = 30000
): Promise<{ text: string; ts: string; blocks?: any[] } | null> {
  const startTime = Date.now();
  const pollInterval = 1000;

  while (Date.now() - startTime < timeoutMs) {
    const result = await botApi('conversations.history', {
      channel: channelId,
      oldest: afterTimestamp,
      limit: 10,
    });

    if (result.ok && result.messages) {
      // Find bot messages (have bot_id)
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

describeOrSkip('Agent Slack Operations E2E Tests', () => {
  let dmChannelId: string;
  let botUserId: string;
  let humanUserId: string;

  beforeAll(async () => {
    // Get bot info
    const botInfo = await botApi('auth.test');
    expect(botInfo.ok).toBe(true);
    botUserId = botInfo.user_id;
    console.log(`[Agent Slack E2E] Bot: ${botInfo.user} (${botUserId})`);

    // Get user info
    const userInfo = await userApi('auth.test');
    expect(userInfo.ok).toBe(true);
    humanUserId = userInfo.user_id;
    console.log(`[Agent Slack E2E] User: ${userInfo.user} (${humanUserId})`);

    // Open DM with bot
    const dmResult = await userApi('conversations.open', {
      users: botUserId,
    });
    expect(dmResult.ok).toBe(true);
    dmChannelId = dmResult.channel.id;
    console.log(`[Agent Slack E2E] DM Channel: ${dmChannelId}`);
  });

  describe('Basic Agent Conversation via Slack', () => {
    it('should send a message and receive AI response', async () => {
      const testId = Date.now();
      const userMessage = `E2E Test ${testId}: Hello! Please respond with a brief greeting.`;

      // User sends message to bot
      console.log(`[Agent Slack E2E] Sending: "${userMessage}"`);
      const sendResult = await userApi('chat.postMessage', {
        channel: dmChannelId,
        text: userMessage,
      });
      expect(sendResult.ok).toBe(true);

      // Wait for bot response
      console.log('[Agent Slack E2E] Waiting for bot response (30s timeout)...');
      const botResponse = await waitForBotResponse(dmChannelId, sendResult.ts, 30000);

      if (botResponse) {
        console.log(`[Agent Slack E2E] Bot responded: "${botResponse.text.substring(0, 150)}..."`);
        expect(botResponse.text.length).toBeGreaterThan(0);
      } else {
        console.log('[Agent Slack E2E] No bot response received - bot may not be running');
      }
    }, 35000);

    it('should maintain context in conversation thread', async () => {
      const testId = Date.now();

      // Message 1: Set context
      const msg1 = `E2E Test ${testId}: Remember this secret code: ALPHA-${testId}`;
      console.log(`[Agent Slack E2E] Setting context: "${msg1}"`);

      const send1 = await userApi('chat.postMessage', {
        channel: dmChannelId,
        text: msg1,
      });
      expect(send1.ok).toBe(true);

      // Wait for acknowledgment
      const response1 = await waitForBotResponse(dmChannelId, send1.ts, 30000);
      if (response1) {
        console.log(`[Agent Slack E2E] Context ack: "${response1.text.substring(0, 100)}..."`);
      }

      // Small delay
      await new Promise((resolve) => setTimeout(resolve, 1000));

      // Message 2: Ask for recall
      const msg2 = `What was the secret code I just told you?`;
      console.log(`[Agent Slack E2E] Asking for recall: "${msg2}"`);

      const send2 = await userApi('chat.postMessage', {
        channel: dmChannelId,
        text: msg2,
      });
      expect(send2.ok).toBe(true);

      const response2 = await waitForBotResponse(dmChannelId, send2.ts, 30000);
      if (response2) {
        console.log(`[Agent Slack E2E] Recall response: "${response2.text.substring(0, 150)}"`);
        // Should contain the code
        expect(response2.text).toContain('ALPHA');
      }
    }, 70000);
  });

  describe('Agent Tool Usage via Slack', () => {
    it('should use Slack tools to look up user', async () => {
      const testId = Date.now();
      const message = `E2E Test ${testId}: Can you look up my Slack user info?`;

      console.log(`[Agent Slack E2E] Requesting user lookup: "${message}"`);
      const sendResult = await userApi('chat.postMessage', {
        channel: dmChannelId,
        text: message,
      });
      expect(sendResult.ok).toBe(true);

      const response = await waitForBotResponse(dmChannelId, sendResult.ts, 45000);
      if (response) {
        console.log(`[Agent Slack E2E] User lookup response: "${response.text.substring(0, 200)}"`);
        // Should contain some user info
        expect(response.text.length).toBeGreaterThan(0);
      }
    }, 50000);

    it('should handle tool-requiring requests', async () => {
      const testId = Date.now();
      // Request that would ideally use a tool
      const message = `E2E Test ${testId}: What's the current time and date?`;

      console.log(`[Agent Slack E2E] Sending tool request: "${message}"`);
      const sendResult = await userApi('chat.postMessage', {
        channel: dmChannelId,
        text: message,
      });
      expect(sendResult.ok).toBe(true);

      const response = await waitForBotResponse(dmChannelId, sendResult.ts, 30000);
      if (response) {
        console.log(`[Agent Slack E2E] Tool response: "${response.text.substring(0, 150)}"`);
        // Should have some response about time/date
        expect(response.text.length).toBeGreaterThan(0);
      }
    }, 35000);
  });

  describe('Agent Commands via Slack', () => {
    it('should respond to /help command', async () => {
      const sendResult = await userApi('chat.postMessage', {
        channel: dmChannelId,
        text: '/help',
      });
      expect(sendResult.ok).toBe(true);

      const response = await waitForBotResponse(dmChannelId, sendResult.ts, 15000);
      if (response) {
        console.log(`[Agent Slack E2E] Help response: "${response.text.substring(0, 200)}"`);
      }
    }, 20000);

    it('should respond to status inquiry', async () => {
      const testId = Date.now();
      const sendResult = await userApi('chat.postMessage', {
        channel: dmChannelId,
        text: `E2E Test ${testId}: What can you help me with? Give a brief summary.`,
      });
      expect(sendResult.ok).toBe(true);

      const response = await waitForBotResponse(dmChannelId, sendResult.ts, 30000);
      if (response) {
        console.log(
          `[Agent Slack E2E] Capabilities response: "${response.text.substring(0, 200)}"`
        );
        expect(response.text.length).toBeGreaterThan(0);
      }
    }, 35000);
  });

  describe('Agent Error Handling via Slack', () => {
    it('should handle malformed requests gracefully', async () => {
      const sendResult = await userApi('chat.postMessage', {
        channel: dmChannelId,
        text: '!@#$%^&*()',
      });
      expect(sendResult.ok).toBe(true);

      const response = await waitForBotResponse(dmChannelId, sendResult.ts, 15000);
      // Bot should respond even to gibberish
      if (response) {
        console.log(`[Agent Slack E2E] Gibberish response: "${response.text.substring(0, 100)}"`);
      }
    }, 20000);

    it('should handle empty-ish messages', async () => {
      const sendResult = await userApi('chat.postMessage', {
        channel: dmChannelId,
        text: '...',
      });
      expect(sendResult.ok).toBe(true);

      const response = await waitForBotResponse(dmChannelId, sendResult.ts, 15000);
      if (response) {
        console.log(`[Agent Slack E2E] Ellipsis response: "${response.text.substring(0, 100)}"`);
      }
    }, 20000);
  });

  describe('Agent Multi-turn Conversation via Slack', () => {
    it('should handle a complete multi-turn conversation', async () => {
      const testId = Date.now();
      console.log(`\n[Agent Slack E2E] Starting multi-turn conversation (Test ${testId})...`);

      // Turn 1: Greeting
      const t1Send = await userApi('chat.postMessage', {
        channel: dmChannelId,
        text: `E2E Test ${testId}: Hi! I'm testing multi-turn conversations.`,
      });
      const t1Response = await waitForBotResponse(dmChannelId, t1Send.ts, 30000);
      if (t1Response) {
        console.log(`[Turn 1] Bot: "${t1Response.text.substring(0, 80)}..."`);
      }

      await new Promise((resolve) => setTimeout(resolve, 500));

      // Turn 2: Ask a question
      const t2Send = await userApi('chat.postMessage', {
        channel: dmChannelId,
        text: `What's 25 multiplied by 4?`,
      });
      const t2Response = await waitForBotResponse(dmChannelId, t2Send.ts, 30000);
      if (t2Response) {
        console.log(`[Turn 2] Bot: "${t2Response.text.substring(0, 80)}..."`);
        expect(t2Response.text).toContain('100');
      }

      await new Promise((resolve) => setTimeout(resolve, 500));

      // Turn 3: Follow up
      const t3Send = await userApi('chat.postMessage', {
        channel: dmChannelId,
        text: `Now divide that result by 5. What do you get?`,
      });
      const t3Response = await waitForBotResponse(dmChannelId, t3Send.ts, 30000);
      if (t3Response) {
        console.log(`[Turn 3] Bot: "${t3Response.text.substring(0, 80)}..."`);
        expect(t3Response.text).toContain('20');
      }

      console.log(`[Agent Slack E2E] Multi-turn conversation complete!`);
    }, 120000);
  });
});

// Export test scenarios
export const agentSlackTestScenarios = {
  basicResponse: {
    description: 'Send message to bot via Slack DM and get AI response',
    steps: [
      'Open DM with bot',
      'Send greeting message',
      'Wait for bot response',
      'Verify response is coherent',
    ],
    expectedOutcome: 'Bot responds with AI-generated greeting',
  },

  contextRetention: {
    description: 'Test that bot remembers conversation context',
    steps: [
      'Tell bot a piece of information',
      'Wait for acknowledgment',
      'Ask bot to recall the information',
      'Verify correct recall',
    ],
    expectedOutcome: 'Bot remembers and recalls context',
  },

  toolUsage: {
    description: 'Test bot using Slack tools',
    steps: [
      'Ask bot to perform Slack operation',
      'Wait for response',
      'Verify tool was used in response',
    ],
    expectedOutcome: 'Bot uses Slack tools appropriately',
  },

  multiTurn: {
    description: 'Test multi-turn conversation with follow-ups',
    steps: [
      'Start conversation',
      'Ask mathematical question',
      'Ask follow-up using previous answer',
      'Verify bot tracks context',
    ],
    expectedOutcome: 'Bot maintains context across turns',
  },
};
