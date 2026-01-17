/**
 * Slack Send DM Tool
 * Send a direct message to a Slack user.
 */

import { z } from 'zod';
import { MCPTool } from '../base.js';
import type { ToolContext } from '../../types.js';

interface Input {
  userIdOrEmail: string;
  message: string;
  ccUsers?: string[];
}

interface Output {
  success: boolean;
  ts?: string;
  channel?: string;
  error?: string;
}

export class SlackSendDMTool extends MCPTool<Input, Output> {
  name = 'ai_first_slack_send_dm';
  description = 'Send a direct message to a Slack user. Can use either user ID or email address.';
  category = 'messaging' as const;
  keywords = ['slack', 'dm', 'message', 'send', 'direct', 'private'];
  useCases = ['Send a Slack DM to someone', 'Message a user on Slack', 'Send a private message'];

  inputSchema = z.object({
    userIdOrEmail: z
      .string()
      .describe('The Slack user ID (e.g., U12345) or email address of the recipient'),
    message: z.string().describe('The message text to send (supports Slack markdown/mrkdwn)'),
    ccUsers: z
      .array(z.string())
      .optional()
      .describe('Optional list of user IDs or emails to include in a group DM conversation'),
  });

  async execute(input: Input, context: ToolContext): Promise<Output> {
    const slackClient = context.services?.slack;

    if (!slackClient) {
      return {
        success: false,
        error: 'Slack service not available',
      };
    }

    try {
      // Resolve user ID if email was provided
      let userId = input.userIdOrEmail;
      if (input.userIdOrEmail.includes('@')) {
        const user = await slackClient.lookupUserByEmail(input.userIdOrEmail);
        if (!user) {
          return {
            success: false,
            error: `User with email ${input.userIdOrEmail} not found`,
          };
        }
        userId = user.id;
      }

      const result = await slackClient.sendDirectMessage(userId, input.message);

      return {
        success: true,
        ts: result.ts,
        channel: result.channel,
      };
    } catch (error) {
      return {
        success: false,
        error: String(error),
      };
    }
  }
}

export const slackSendDMTool = new SlackSendDMTool();
