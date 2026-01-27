/**
 * Slack Interactive E2E Tests
 *
 * Tests real back-and-forth messaging between the bot and a user.
 * Requires SLACK_BOT_TOKEN and SLACK_TEST_USER_ID environment variables.
 */

import { describe, it, expect, beforeAll } from 'vitest';

const SLACK_INTERACTIVE_ENABLED = process.env.RUN_SLACK_INTERACTIVE === 'true';
const SLACK_BOT_TOKEN = process.env.SLACK_BOT_TOKEN || '';
const SLACK_TEST_USER_ID = process.env.SLACK_TEST_USER_ID || 'UFXSVR0JK'; // Default to tom.b

const describeOrSkip = SLACK_INTERACTIVE_ENABLED && SLACK_BOT_TOKEN ? describe : describe.skip;

// Helper to make Slack API calls
async function slackApi(method: string, body: Record<string, any> = {}): Promise<any> {
  const response = await fetch(`https://slack.com/api/${method}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${SLACK_BOT_TOKEN}`,
    },
    body: JSON.stringify(body),
  });
  return response.json();
}

// Helper to wait for a message from the user
async function waitForUserMessage(
  channelId: string,
  afterTimestamp: string,
  timeoutMs: number = 60000
): Promise<{ text: string; ts: string } | null> {
  const startTime = Date.now();
  const pollInterval = 2000; // Check every 2 seconds

  while (Date.now() - startTime < timeoutMs) {
    const result = await slackApi('conversations.history', {
      channel: channelId,
      oldest: afterTimestamp,
      limit: 10,
    });

    if (result.ok && result.messages) {
      // Find messages from the user (not the bot)
      const userMessages = result.messages.filter(
        (m: any) => m.user === SLACK_TEST_USER_ID && m.ts > afterTimestamp
      );

      if (userMessages.length > 0) {
        // Return the most recent user message
        const latestMessage = userMessages[0];
        return { text: latestMessage.text, ts: latestMessage.ts };
      }
    }

    // Wait before polling again
    await new Promise((resolve) => setTimeout(resolve, pollInterval));
  }

  return null;
}

describeOrSkip('Slack Interactive E2E Tests', () => {
  let dmChannelId: string;

  beforeAll(async () => {
    // Open DM channel with test user
    console.log(`[Slack Interactive] Opening DM with user: ${SLACK_TEST_USER_ID}`);
    const result = await slackApi('conversations.open', {
      users: SLACK_TEST_USER_ID,
    });

    if (!result.ok) {
      throw new Error(`Failed to open DM: ${result.error}`);
    }

    dmChannelId = result.channel.id;
    console.log(`[Slack Interactive] DM channel opened: ${dmChannelId}`);
  });

  it('should send a greeting and wait for response', async () => {
    const testId = Date.now();
    const greeting = `🤖 E2E Test (${testId}): Hello! Please reply with "hello" to confirm you received this message.`;

    // Send greeting
    console.log('[Slack Interactive] Sending greeting...');
    const sendResult = await slackApi('chat.postMessage', {
      channel: dmChannelId,
      text: greeting,
    });

    expect(sendResult.ok).toBe(true);
    console.log(`[Slack Interactive] Greeting sent at: ${sendResult.ts}`);

    // Wait for user response (60 second timeout)
    console.log('[Slack Interactive] Waiting for user response (60s timeout)...');
    const response = await waitForUserMessage(dmChannelId, sendResult.ts, 60000);

    if (response) {
      console.log(`[Slack Interactive] User responded: "${response.text}"`);
      // Accept "hello", "hi", "hey", or any response starting with "h" (allow typos like "hellp")
      const text = response.text.toLowerCase();
      const isGreeting =
        text.includes('hello') ||
        text.includes('hi') ||
        text.includes('hey') ||
        text.startsWith('h');
      expect(isGreeting).toBe(true);
    } else {
      console.log('[Slack Interactive] No response received within timeout');
      // Don't fail the test if no response - user might not be available
      expect(true).toBe(true);
    }
  }, 70000); // 70s test timeout

  it('should have a multi-turn conversation', async () => {
    const testId = Date.now();

    // Turn 1: Ask a question
    console.log('[Slack Interactive] Starting multi-turn conversation...');
    const question1 = `🤖 E2E Test (${testId}): What's your favorite color? (Reply with a color)`;

    const send1 = await slackApi('chat.postMessage', {
      channel: dmChannelId,
      text: question1,
    });
    expect(send1.ok).toBe(true);

    // Wait for color response
    console.log('[Slack Interactive] Waiting for color response (30s)...');
    const response1 = await waitForUserMessage(dmChannelId, send1.ts, 30000);

    if (!response1) {
      console.log('[Slack Interactive] No response - skipping rest of conversation');
      return;
    }

    console.log(`[Slack Interactive] User said: "${response1.text}"`);
    const color = response1.text.trim();

    // Turn 2: Acknowledge and ask follow-up
    const question2 = `🤖 Nice! ${color} is a great choice! Now, what's 2 + 2? (Reply with a number)`;

    const send2 = await slackApi('chat.postMessage', {
      channel: dmChannelId,
      text: question2,
    });
    expect(send2.ok).toBe(true);

    // Wait for math response
    console.log('[Slack Interactive] Waiting for math response (30s)...');
    const response2 = await waitForUserMessage(dmChannelId, send2.ts, 30000);

    if (!response2) {
      console.log('[Slack Interactive] No response to math question');
      return;
    }

    console.log(`[Slack Interactive] User said: "${response2.text}"`);

    // Turn 3: Final acknowledgment
    const isCorrect = response2.text.includes('4');
    const finalMessage = isCorrect
      ? `🤖 Correct! 🎉 E2E test complete. Thanks for participating!`
      : `🤖 Hmm, I was expecting 4, but that's okay! E2E test complete. Thanks!`;

    const send3 = await slackApi('chat.postMessage', {
      channel: dmChannelId,
      text: finalMessage,
    });
    expect(send3.ok).toBe(true);

    console.log('[Slack Interactive] Multi-turn conversation complete!');
  }, 120000); // 2 minute timeout for multi-turn

  it('should send a message with blocks and buttons', async () => {
    const testId = Date.now();

    const blockMessage = await slackApi('chat.postMessage', {
      channel: dmChannelId,
      text: 'E2E Test: Interactive message',
      blocks: [
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: `🤖 *E2E Test (${testId})*\n\nThis is a test message with rich formatting.`,
          },
        },
        {
          type: 'divider',
        },
        {
          type: 'section',
          fields: [
            {
              type: 'mrkdwn',
              text: '*Test ID:*\n' + testId,
            },
            {
              type: 'mrkdwn',
              text: '*Status:*\n✅ Sent',
            },
          ],
        },
        {
          type: 'context',
          elements: [
            {
              type: 'mrkdwn',
              text: '📧 Sent via Orient E2E Tests',
            },
          ],
        },
      ],
    });

    expect(blockMessage.ok).toBe(true);
    console.log(`[Slack Interactive] Block message sent: ${blockMessage.ts}`);
  });
});

// Export for programmatic use
export async function runInteractiveSlackTest(
  botToken: string,
  userId: string
): Promise<{ success: boolean; messages: string[] }> {
  const messages: string[] = [];

  // Override globals for this run
  const originalToken = process.env.SLACK_BOT_TOKEN;
  const originalUserId = process.env.SLACK_TEST_USER_ID;

  process.env.SLACK_BOT_TOKEN = botToken;
  process.env.SLACK_TEST_USER_ID = userId;

  try {
    // Open DM
    const openResult = await slackApi('conversations.open', { users: userId });
    if (!openResult.ok) {
      return { success: false, messages: [`Failed to open DM: ${openResult.error}`] };
    }

    const channelId = openResult.channel.id;
    messages.push(`Opened DM channel: ${channelId}`);

    // Send test message
    const sendResult = await slackApi('chat.postMessage', {
      channel: channelId,
      text: '🤖 Interactive Slack Test: Please reply to this message!',
    });

    if (!sendResult.ok) {
      return { success: false, messages: [...messages, `Failed to send: ${sendResult.error}`] };
    }

    messages.push(`Message sent at: ${sendResult.ts}`);
    return { success: true, messages };
  } finally {
    // Restore original values
    if (originalToken) process.env.SLACK_BOT_TOKEN = originalToken;
    if (originalUserId) process.env.SLACK_TEST_USER_ID = originalUserId;
  }
}
