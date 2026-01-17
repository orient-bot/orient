/**
 * Slack Send Channel Message Tool
 * Send a message to a Slack channel.
 */

import { z } from 'zod';
import { MCPTool } from '../base.js';
import type { ToolContext } from '../../types.js';

interface Input {
  channel: string;
  message: string;
}

interface Output {
  success: boolean;
  ts?: string;
  channel?: string;
  error?: string;
}

export class SlackSendChannelMessageTool extends MCPTool<Input, Output> {
  name = 'ai_first_slack_send_channel_message';
  description = 'Send a message to a Slack channel.';
  category = 'messaging' as const;
  keywords = ['slack', 'channel', 'message', 'send', 'post', 'announce'];
  useCases = ['Post a message to a Slack channel', 'Send an announcement', 'Notify the team'];

  inputSchema = z.object({
    channel: z.string().describe('The channel name (e.g., #general) or channel ID'),
    message: z.string().describe('The message text to send (supports Slack markdown/mrkdwn)'),
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
      // Normalize channel name (remove # if present)
      const channel = input.channel.replace(/^#/, '');

      const result = await slackClient.postMessage(channel, input.message);

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

export const slackSendChannelMessageTool = new SlackSendChannelMessageTool();
