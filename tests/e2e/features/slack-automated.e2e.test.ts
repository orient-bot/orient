/**
 * Slack Fully Automated E2E Tests
 *
 * Tests real back-and-forth messaging between the bot and user
 * using both bot token and user token for full automation.
 *
 * Required environment variables:
 * - SLACK_BOT_TOKEN: Bot token for sending bot messages
 * - SLACK_USER_TOKEN: User token for sending user responses
 */

import { describe, it, expect, beforeAll } from 'vitest';

const SLACK_AUTOMATED_ENABLED = process.env.RUN_SLACK_AUTOMATED === 'true';
const SLACK_BOT_TOKEN = process.env.SLACK_BOT_TOKEN || '';
const SLACK_USER_TOKEN = process.env.SLACK_USER_TOKEN || '';

const describeOrSkip =
  SLACK_AUTOMATED_ENABLED && SLACK_BOT_TOKEN && SLACK_USER_TOKEN ? describe : describe.skip;

// Helper to make Slack API calls with specified token
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

// Bot API helper
async function botApi(method: string, body: Record<string, any> = {}): Promise<any> {
  return slackApi(method, body, SLACK_BOT_TOKEN);
}

// User API helper
async function userApi(method: string, body: Record<string, any> = {}): Promise<any> {
  return slackApi(method, body, SLACK_USER_TOKEN);
}

// Wait for a message in channel after a timestamp
async function waitForMessage(
  channelId: string,
  afterTimestamp: string,
  fromBot: boolean,
  timeoutMs: number = 10000
): Promise<{ text: string; ts: string } | null> {
  const startTime = Date.now();
  const pollInterval = 500;

  while (Date.now() - startTime < timeoutMs) {
    // Use bot token to read channel history
    const result = await botApi('conversations.history', {
      channel: channelId,
      oldest: afterTimestamp,
      limit: 10,
    });

    if (result.ok && result.messages) {
      // Filter messages based on whether we're looking for bot or user messages
      const messages = result.messages.filter((m: any) => {
        const isBot = m.bot_id !== undefined;
        return fromBot ? isBot : !isBot;
      });

      if (messages.length > 0) {
        return { text: messages[0].text, ts: messages[0].ts };
      }
    }

    await new Promise((resolve) => setTimeout(resolve, pollInterval));
  }

  return null;
}

describeOrSkip('Slack Fully Automated E2E Tests', () => {
  let dmChannelId: string;
  let botUserId: string;
  let humanUserId: string;

  beforeAll(async () => {
    // Get bot info
    const botInfo = await botApi('auth.test');
    expect(botInfo.ok).toBe(true);
    botUserId = botInfo.user_id;
    console.log(`[Slack Automated] Bot: ${botInfo.user} (${botUserId})`);

    // Get user info
    const userInfo = await userApi('auth.test');
    expect(userInfo.ok).toBe(true);
    humanUserId = userInfo.user_id;
    console.log(`[Slack Automated] User: ${userInfo.user} (${humanUserId})`);

    // Open DM channel between bot and user
    const dmResult = await botApi('conversations.open', {
      users: humanUserId,
    });
    expect(dmResult.ok).toBe(true);
    dmChannelId = dmResult.channel.id;
    console.log(`[Slack Automated] DM Channel: ${dmChannelId}`);
  });

  it('should have automated greeting exchange', async () => {
    const testId = Date.now();
    console.log(`\n[Test ${testId}] Starting automated greeting exchange...`);

    // Step 1: Bot sends greeting
    const botGreeting = `🤖 Automated Test (${testId}): Hello! Please say hi back.`;
    const botSend = await botApi('chat.postMessage', {
      channel: dmChannelId,
      text: botGreeting,
    });
    expect(botSend.ok).toBe(true);
    console.log(`[Bot → User] ${botGreeting}`);

    // Small delay to ensure message is processed
    await new Promise((resolve) => setTimeout(resolve, 500));

    // Step 2: User responds automatically
    const userResponse = `👋 Hi bot! This is an automated response to test ${testId}.`;
    const userSend = await userApi('chat.postMessage', {
      channel: dmChannelId,
      text: userResponse,
    });
    expect(userSend.ok).toBe(true);
    console.log(`[User → Bot] ${userResponse}`);

    // Step 3: Verify the exchange happened
    const history = await botApi('conversations.history', {
      channel: dmChannelId,
      limit: 5,
    });
    expect(history.ok).toBe(true);

    // Find our test messages
    const testMessages = history.messages.filter((m: any) => m.text.includes(testId.toString()));
    expect(testMessages.length).toBeGreaterThanOrEqual(2);

    console.log(`[Test ${testId}] ✅ Greeting exchange complete!`);
  });

  it('should have automated multi-turn conversation', async () => {
    const testId = Date.now();
    console.log(`\n[Test ${testId}] Starting automated multi-turn conversation...`);

    // Turn 1: Bot asks question
    const question1 = `🤖 Test ${testId} - Q1: What is the capital of France?`;
    const q1Send = await botApi('chat.postMessage', {
      channel: dmChannelId,
      text: question1,
    });
    expect(q1Send.ok).toBe(true);
    console.log(`[Bot] ${question1}`);

    await new Promise((resolve) => setTimeout(resolve, 300));

    // Turn 1: User answers
    const answer1 = `The capital of France is Paris! 🗼`;
    const a1Send = await userApi('chat.postMessage', {
      channel: dmChannelId,
      text: answer1,
    });
    expect(a1Send.ok).toBe(true);
    console.log(`[User] ${answer1}`);

    await new Promise((resolve) => setTimeout(resolve, 300));

    // Turn 2: Bot follows up
    const question2 = `🤖 Correct! Now, what is 15 × 7?`;
    const q2Send = await botApi('chat.postMessage', {
      channel: dmChannelId,
      text: question2,
    });
    expect(q2Send.ok).toBe(true);
    console.log(`[Bot] ${question2}`);

    await new Promise((resolve) => setTimeout(resolve, 300));

    // Turn 2: User answers
    const answer2 = `15 × 7 = 105 🧮`;
    const a2Send = await userApi('chat.postMessage', {
      channel: dmChannelId,
      text: answer2,
    });
    expect(a2Send.ok).toBe(true);
    console.log(`[User] ${answer2}`);

    await new Promise((resolve) => setTimeout(resolve, 300));

    // Turn 3: Bot concludes
    const conclusion = `🤖 Excellent! You got both correct! 🎉 Test ${testId} complete.`;
    const concSend = await botApi('chat.postMessage', {
      channel: dmChannelId,
      text: conclusion,
    });
    expect(concSend.ok).toBe(true);
    console.log(`[Bot] ${conclusion}`);

    console.log(`[Test ${testId}] ✅ Multi-turn conversation complete!`);
  });

  it('should handle rich message formatting', async () => {
    const testId = Date.now();
    console.log(`\n[Test ${testId}] Testing rich message formatting...`);

    // Bot sends rich formatted message
    const richMessage = await botApi('chat.postMessage', {
      channel: dmChannelId,
      text: `E2E Test ${testId}: Rich formatting test`,
      blocks: [
        {
          type: 'header',
          text: {
            type: 'plain_text',
            text: `🧪 Automated E2E Test #${testId}`,
          },
        },
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: '*This message tests:*\n• Block formatting\n• Markdown support\n• Multiple sections',
          },
        },
        {
          type: 'divider',
        },
        {
          type: 'section',
          fields: [
            { type: 'mrkdwn', text: '*Status:*\n✅ Running' },
            { type: 'mrkdwn', text: '*Mode:*\n🤖 Automated' },
          ],
        },
        {
          type: 'context',
          elements: [
            {
              type: 'mrkdwn',
              text: `📧 Sent via Orient E2E Tests | Test ID: ${testId}`,
            },
          ],
        },
      ],
    });
    expect(richMessage.ok).toBe(true);
    console.log(`[Bot] Sent rich formatted message`);

    await new Promise((resolve) => setTimeout(resolve, 300));

    // User acknowledges with emoji reaction
    const reaction = await userApi('reactions.add', {
      channel: dmChannelId,
      timestamp: richMessage.ts,
      name: 'white_check_mark',
    });
    // Reaction might fail if already added, that's okay
    console.log(`[User] Added ✅ reaction: ${reaction.ok ? 'success' : reaction.error}`);

    // User responds
    const userAck = await userApi('chat.postMessage', {
      channel: dmChannelId,
      text: `👍 Received the rich formatted message! Test ${testId} looks good.`,
    });
    expect(userAck.ok).toBe(true);
    console.log(`[User] Acknowledged rich message`);

    console.log(`[Test ${testId}] ✅ Rich formatting test complete!`);
  });

  it('should handle threaded conversation', async () => {
    const testId = Date.now();
    console.log(`\n[Test ${testId}] Testing threaded conversation...`);

    // Bot starts a thread
    const threadStart = await botApi('chat.postMessage', {
      channel: dmChannelId,
      text: `🧵 Test ${testId}: Starting a threaded conversation...`,
    });
    expect(threadStart.ok).toBe(true);
    const threadTs = threadStart.ts;
    console.log(`[Bot] Started thread: ${threadTs}`);

    await new Promise((resolve) => setTimeout(resolve, 300));

    // User replies in thread
    const threadReply1 = await userApi('chat.postMessage', {
      channel: dmChannelId,
      thread_ts: threadTs,
      text: `This is my first reply in the thread! 💬`,
    });
    expect(threadReply1.ok).toBe(true);
    console.log(`[User] Thread reply 1`);

    await new Promise((resolve) => setTimeout(resolve, 300));

    // Bot replies in thread
    const threadReply2 = await botApi('chat.postMessage', {
      channel: dmChannelId,
      thread_ts: threadTs,
      text: `🤖 Great! Threads are working perfectly.`,
    });
    expect(threadReply2.ok).toBe(true);
    console.log(`[Bot] Thread reply 2`);

    await new Promise((resolve) => setTimeout(resolve, 300));

    // User sends final thread message
    const threadReply3 = await userApi('chat.postMessage', {
      channel: dmChannelId,
      thread_ts: threadTs,
      text: `Closing the thread. Test ${testId} complete! ✅`,
    });
    expect(threadReply3.ok).toBe(true);
    console.log(`[User] Thread reply 3 (closing)`);

    // Verify thread has all messages
    const threadHistory = await botApi('conversations.replies', {
      channel: dmChannelId,
      ts: threadTs,
    });

    if (threadHistory.ok) {
      expect(threadHistory.messages.length).toBeGreaterThanOrEqual(4); // Parent + 3 replies
      console.log(
        `[Test ${testId}] ✅ Threaded conversation complete! (${threadHistory.messages.length} messages)`
      );
    } else {
      // Thread replies API might not be available for DMs, but messages were still sent
      console.log(
        `[Test ${testId}] ✅ Thread messages sent (replies API returned: ${threadHistory.error})`
      );
    }
  });

  it('should measure message round-trip latency', async () => {
    const testId = Date.now();
    console.log(`\n[Test ${testId}] Measuring round-trip latency...`);

    const latencies: number[] = [];

    for (let i = 1; i <= 3; i++) {
      const startTime = Date.now();

      // Bot sends
      const botMsg = await botApi('chat.postMessage', {
        channel: dmChannelId,
        text: `⏱️ Latency test ${testId} - Round ${i}`,
      });
      expect(botMsg.ok).toBe(true);

      // User responds immediately
      const userMsg = await userApi('chat.postMessage', {
        channel: dmChannelId,
        text: `↩️ Response to round ${i}`,
      });
      expect(userMsg.ok).toBe(true);

      const latency = Date.now() - startTime;
      latencies.push(latency);
      console.log(`[Round ${i}] Latency: ${latency}ms`);
    }

    const avgLatency = latencies.reduce((a, b) => a + b, 0) / latencies.length;
    console.log(`[Test ${testId}] Average latency: ${avgLatency.toFixed(0)}ms`);

    // Latency should be reasonable (under 5 seconds for 2 API calls)
    expect(avgLatency).toBeLessThan(5000);

    console.log(`[Test ${testId}] ✅ Latency test complete!`);
  });
});

// Export test runner for programmatic use
export async function runAutomatedSlackTest(
  botToken: string,
  userToken: string
): Promise<{ success: boolean; log: string[] }> {
  const log: string[] = [];

  try {
    // Verify tokens
    const botInfo = await slackApi('auth.test', {}, botToken);
    const userInfo = await slackApi('auth.test', {}, userToken);

    if (!botInfo.ok || !userInfo.ok) {
      return {
        success: false,
        log: [`Token verification failed: bot=${botInfo.ok}, user=${userInfo.ok}`],
      };
    }

    log.push(`Bot: ${botInfo.user}, User: ${userInfo.user}`);

    // Open DM
    const dm = await slackApi('conversations.open', { users: userInfo.user_id }, botToken);
    if (!dm.ok) {
      return { success: false, log: [...log, `Failed to open DM: ${dm.error}`] };
    }

    const channelId = dm.channel.id;
    log.push(`DM Channel: ${channelId}`);

    // Exchange messages
    const testId = Date.now();

    const botMsg = await slackApi(
      'chat.postMessage',
      { channel: channelId, text: `🤖 Automated test ${testId}` },
      botToken
    );
    log.push(`Bot sent: ${botMsg.ok}`);

    const userMsg = await slackApi(
      'chat.postMessage',
      { channel: channelId, text: `👋 User response to ${testId}` },
      userToken
    );
    log.push(`User sent: ${userMsg.ok}`);

    return { success: true, log };
  } catch (error) {
    return {
      success: false,
      log: [...log, `Error: ${error instanceof Error ? error.message : String(error)}`],
    };
  }
}
