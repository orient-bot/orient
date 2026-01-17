/**
 * OpenCode Bot Integration Example
 *
 * This module demonstrates how to integrate OpenCode as the AI backend
 * for WhatsApp and Slack bots. The pattern can be adapted for any messaging platform.
 *
 * Exported via @orient/agents package.
 */

import { OpenCodeClient, createOpenCodeClient } from './openCodeClient.js';
import { createServiceLogger } from '@orient/core';

const logger = createServiceLogger('opencode-bot');

/**
 * Example: WhatsApp message handler using OpenCode
 */
export async function handleWhatsAppMessage(
  client: OpenCodeClient,
  message: {
    from: string; // Phone number
    body: string; // Message text
    isGroup: boolean;
    groupId?: string;
    groupName?: string; // Group name/subject for display
  }
): Promise<string> {
  // Create a unique context key for this conversation
  // For groups, use groupId; for DMs, use phone number
  const contextKey = message.isGroup
    ? `whatsapp:group:${message.groupId}`
    : `whatsapp:dm:${message.from}`;

  logger.info('Processing WhatsApp message', {
    contextKey,
    messageLength: message.body.length,
    isGroup: message.isGroup,
  });

  try {
    // Use the pm-assistant agent for project management queries
    // Use the build agent for general coding questions
    const isPMQuery = /\b(jira|issue|sprint|blocker|status|ticket|task)\b/i.test(message.body);

    // Use group name if available, otherwise fall back to group ID
    const groupIdentifier = message.groupName || message.groupId;

    const result = await client.chat(contextKey, message.body, {
      sessionTitle: message.isGroup
        ? `WhatsApp Group: ${groupIdentifier}`
        : `WhatsApp: ${message.from}`,
      agent: isPMQuery ? 'pm-assistant' : undefined,
    });

    logger.info('Response generated', {
      contextKey,
      cost: result.cost,
      tokens: result.tokens,
    });

    return result.response;
  } catch (error) {
    logger.error('Failed to process message', {
      contextKey,
      error: error instanceof Error ? error.message : String(error),
    });
    return 'Sorry, I encountered an error processing your message. Please try again.';
  }
}

/**
 * Example: Slack message handler using OpenCode
 */
export async function handleSlackMessage(
  client: OpenCodeClient,
  event: {
    user: string; // User ID
    channel: string; // Channel ID
    text: string; // Message text
    thread_ts?: string; // Thread timestamp (for replies)
  }
): Promise<string> {
  // Create a unique context key for this conversation
  // Include thread_ts for threaded conversations
  const contextKey = event.thread_ts
    ? `slack:${event.channel}:${event.thread_ts}`
    : `slack:${event.channel}:${event.user}`;

  logger.info('Processing Slack message', {
    contextKey,
    user: event.user,
    channel: event.channel,
    hasThread: !!event.thread_ts,
  });

  try {
    const result = await client.chat(contextKey, event.text, {
      sessionTitle: `Slack: ${event.channel}`,
    });

    logger.info('Response generated', {
      contextKey,
      cost: result.cost,
      tokens: result.tokens,
    });

    return result.response;
  } catch (error) {
    logger.error('Failed to process Slack message', {
      contextKey,
      error: error instanceof Error ? error.message : String(error),
    });
    return 'Sorry, I encountered an error. Please try again.';
  }
}

/**
 * Example usage and integration pattern
 */
export async function demonstrateIntegration(): Promise<void> {
  console.log('=== OpenCode Bot Integration Demo ===\n');

  // Initialize the client
  const client = createOpenCodeClient('http://localhost:4096');

  // Check health
  const health = await client.healthCheck();
  console.log('OpenCode Server Health:', health);

  // Simulate a WhatsApp message
  console.log('\n--- Simulating WhatsApp Message ---');
  const whatsappResponse = await handleWhatsAppMessage(client, {
    from: '+1234567890',
    body: 'What issues are currently in progress?',
    isGroup: false,
  });
  console.log('WhatsApp Response:', whatsappResponse);

  // Simulate a Slack message
  console.log('\n--- Simulating Slack Message ---');
  const slackResponse = await handleSlackMessage(client, {
    user: 'U123ABC',
    channel: 'C456DEF',
    text: 'Can you check for any SLA breaches?',
  });
  console.log('Slack Response:', slackResponse);
}

// Export for testing
export { OpenCodeClient, createOpenCodeClient };
