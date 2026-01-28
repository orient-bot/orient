/**
 * Slack Service - Core Slack messaging utilities
 *
 * Provides utility functions for building Slack blocks and posting messages.
 * These utilities require an initialized Slack App instance to be passed in.
 *
 * Note: This module was refactored to remove internal config loading.
 * Use SlackBotService for full bot initialization.
 *
 * Exported via @orientbot/bot-slack package.
 */
import type { App, Block, KnownBlock } from '@slack/bolt';
import { createServiceLogger } from '@orientbot/core';
import type {
  StandupSummary,
  DailyDigest,
  SLABreach,
  DigestTransition,
  JiraIssue,
} from '@orientbot/core';

const logger = createServiceLogger('slack-service');

// Message posting utilities
/**
 * Post a message to a Slack channel
 * @param app - Initialized Slack App instance
 * @param channel - Channel ID to post to
 * @param text - Message text (used as fallback)
 * @param blocks - Optional Slack Block Kit blocks
 * @returns Message timestamp (ts) if successful
 */
export async function postMessage(
  app: App,
  channel: string,
  text: string,
  blocks?: (Block | KnownBlock)[]
): Promise<string | undefined> {
  try {
    const result = await app.client.chat.postMessage({
      channel,
      text,
      blocks,
    });
    return result.ts;
  } catch (error) {
    logger.error(`Failed to post message to ${channel}:`, {
      error: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }
}

/**
 * Post a reply to a thread in a Slack channel
 * @param app - Initialized Slack App instance
 * @param channel - Channel ID
 * @param threadTs - Thread timestamp to reply to
 * @param text - Message text (used as fallback)
 * @param blocks - Optional Slack Block Kit blocks
 */
export async function postThreadReply(
  app: App,
  channel: string,
  threadTs: string,
  text: string,
  blocks?: (Block | KnownBlock)[]
): Promise<void> {
  try {
    await app.client.chat.postMessage({
      channel,
      thread_ts: threadTs,
      text,
      blocks,
    });
  } catch (error) {
    logger.error(`Failed to post thread reply:`, {
      error: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }
}

/**
 * Send a direct message to a Slack user
 * @param app - Initialized Slack App instance
 * @param userId - Slack user ID
 * @param text - Message text (used as fallback)
 * @param blocks - Optional Slack Block Kit blocks
 */
export async function sendDirectMessage(
  app: App,
  userId: string,
  text: string,
  blocks?: (Block | KnownBlock)[]
): Promise<void> {
  try {
    const result = await app.client.conversations.open({ users: userId });
    if (result.channel?.id) {
      await app.client.chat.postMessage({
        channel: result.channel.id,
        text,
        blocks,
      });
    }
  } catch (error) {
    logger.error(`Failed to send DM to ${userId}:`, {
      error: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }
}

// Block builders for standup
export function buildStandupPromptBlocks(): (Block | KnownBlock)[] {
  return [
    {
      type: 'header',
      text: {
        type: 'plain_text',
        text: '🌅 Daily Standup Time!',
        emoji: true,
      },
    },
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: "Good morning team! It's time for our daily standup.\n\nPlease share your update by clicking the button below or replying in this thread with:\n• What you worked on yesterday\n• What you're planning to work on today\n• Any blockers or concerns",
      },
    },
    {
      type: 'actions',
      elements: [
        {
          type: 'button',
          text: {
            type: 'plain_text',
            text: '📝 Submit Standup',
            emoji: true,
          },
          style: 'primary',
          action_id: 'open_standup_modal',
        },
      ],
    },
  ];
}

export function buildStandupModalBlocks(): object {
  return {
    type: 'modal',
    callback_id: 'standup_submission',
    title: {
      type: 'plain_text',
      text: 'Daily Standup',
    },
    submit: {
      type: 'plain_text',
      text: 'Submit',
    },
    close: {
      type: 'plain_text',
      text: 'Cancel',
    },
    blocks: [
      {
        type: 'input',
        block_id: 'yesterday_block',
        element: {
          type: 'plain_text_input',
          action_id: 'yesterday_input',
          multiline: true,
          placeholder: {
            type: 'plain_text',
            text: 'What did you work on yesterday?',
          },
        },
        label: {
          type: 'plain_text',
          text: '📅 Yesterday',
        },
      },
      {
        type: 'input',
        block_id: 'today_block',
        element: {
          type: 'plain_text_input',
          action_id: 'today_input',
          multiline: true,
          placeholder: {
            type: 'plain_text',
            text: 'What are you planning to work on today?',
          },
        },
        label: {
          type: 'plain_text',
          text: '🎯 Today',
        },
      },
      {
        type: 'input',
        block_id: 'blockers_block',
        optional: true,
        element: {
          type: 'plain_text_input',
          action_id: 'blockers_input',
          multiline: true,
          placeholder: {
            type: 'plain_text',
            text: 'Any blockers or concerns?',
          },
        },
        label: {
          type: 'plain_text',
          text: '🚧 Blockers',
        },
      },
    ],
  };
}

export function buildStandupSummaryBlocks(summary: StandupSummary): (Block | KnownBlock)[] {
  const blocks: (Block | KnownBlock)[] = [
    {
      type: 'header',
      text: {
        type: 'plain_text',
        text: '📊 Standup Summary',
        emoji: true,
      },
    },
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `*${summary.totalResponses} team members* submitted their standup today.`,
      },
    },
    {
      type: 'divider',
    },
  ];

  // Add individual responses
  for (const response of summary.responses) {
    blocks.push({
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `*<@${response.userId}>*\n• *Yesterday:* ${response.yesterday}\n• *Today:* ${response.today}${response.blockers ? `\n• *Blockers:* ${response.blockers}` : ''}`,
      },
    });
  }

  // Add misalignments if any
  if (summary.misalignments.length > 0) {
    blocks.push({
      type: 'divider',
    });
    blocks.push({
      type: 'header',
      text: {
        type: 'plain_text',
        text: '⚠️ Status Misalignments',
        emoji: true,
      },
    });

    for (const misalign of summary.misalignments) {
      blocks.push({
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `<@${misalign.userId}> mentioned \`${misalign.mentionedTicket}\` but it's in *${misalign.actualStatus}* (expected: ${misalign.expectedStatus})`,
        },
      });
    }
  }

  // Add blockers summary
  if (summary.totalBlockers > 0) {
    blocks.push({
      type: 'divider',
    });
    blocks.push({
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `🚨 *${summary.totalBlockers} blocker(s)* reported today. Please help unblock your teammates!`,
      },
    });
  }

  return blocks;
}

export function buildDigestBlocks(digest: DailyDigest): (Block | KnownBlock)[] {
  const blocks: (Block | KnownBlock)[] = [
    {
      type: 'header',
      text: {
        type: 'plain_text',
        text: '📋 Pre-Standup Digest',
        emoji: true,
      },
    },
  ];

  // Transitions from yesterday
  if (digest.transitionsYesterday.length > 0) {
    blocks.push({
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `*Yesterday's Transitions:*\n${digest.transitionsYesterday.map((t: DigestTransition) => `• \`${t.issue.key}\` ${t.fromStatus} → ${t.toStatus}`).join('\n')}`,
      },
    });
  }

  // In progress today
  if (digest.inProgressToday.length > 0) {
    blocks.push({
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `*In Progress Today (${digest.inProgressToday.length}):*\n${digest.inProgressToday.map((i: JiraIssue) => `• \`${i.key}\` ${i.summary} (<@${i.assignee?.accountId || 'unassigned'}>)`).join('\n')}`,
      },
    });
  }

  // Blockers
  if (digest.blockers.length > 0) {
    blocks.push({
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `*🚨 Blockers (${digest.blockers.length}):*\n${digest.blockers.map((b: JiraIssue) => `• \`${b.key}\` ${b.summary}`).join('\n')}`,
      },
    });
  }

  return blocks;
}

export function buildSLABreachBlocks(breaches: SLABreach[]): (Block | KnownBlock)[] {
  return [
    {
      type: 'header',
      text: {
        type: 'plain_text',
        text: '⏰ SLA Breach Alert',
        emoji: true,
      },
    },
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `The following tickets have exceeded their SLA:\n\n${breaches.map((b) => `• \`${b.issue.key}\` has been in *${b.status}* for *${b.daysInStatus} days* (max: ${b.maxAllowedDays})\n  _${b.issue.summary}_`).join('\n\n')}`,
      },
    },
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: 'Please update these tickets or reach out if you need help.',
      },
    },
  ];
}

export function buildHealthCheckBlocks(
  jiraConnected: boolean,
  issueCount: number
): (Block | KnownBlock)[] {
  return [
    {
      type: 'header',
      text: {
        type: 'plain_text',
        text: '🏥 Orient Health Check',
        emoji: true,
      },
    },
    {
      type: 'section',
      fields: [
        {
          type: 'mrkdwn',
          text: `*Slack:* ✅ Connected`,
        },
        {
          type: 'mrkdwn',
          text: `*Jira:* ${jiraConnected ? '✅ Connected' : '❌ Disconnected'}`,
        },
        {
          type: 'mrkdwn',
          text: `*YOUR_COMPONENT Issues:* ${issueCount}`,
        },
        {
          type: 'mrkdwn',
          text: `*Uptime:* ${Math.floor(process.uptime() / 60)} minutes`,
        },
      ],
    },
  ];
}
