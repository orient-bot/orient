/**
 * Slack Lookup User Tool
 * Look up a Slack user by their email address.
 */

import { z } from 'zod';
import { MCPTool } from '../base.js';
import type { ToolContext } from '../../types.js';

interface Input {
  email: string;
}

interface Output {
  found: boolean;
  user?: {
    id: string;
    name: string;
    displayName?: string;
    email?: string;
  };
  error?: string;
}

export class SlackLookupUserTool extends MCPTool<Input, Output> {
  name = 'slack_lookup_user_by_email';
  description =
    'Look up a Slack user by their email address. Returns user ID and profile information.';
  category = 'messaging' as const;
  keywords = ['slack', 'user', 'lookup', 'find', 'email'];
  useCases = ['Find a Slack user by email', 'Look up someone on Slack'];

  inputSchema = z.object({
    email: z.string().describe('The email address of the user to look up'),
  });

  async execute(input: Input, context: ToolContext): Promise<Output> {
    const slackClient = context.services?.slack;

    if (!slackClient) {
      return {
        found: false,
        error: 'Slack service not available',
      };
    }

    try {
      const user = await slackClient.lookupUserByEmail(input.email);

      if (!user) {
        return {
          found: false,
          error: `User with email ${input.email} not found`,
        };
      }

      return {
        found: true,
        user: {
          id: user.id,
          name: user.name,
          displayName: user.displayName,
          email: user.email,
        },
      };
    } catch (error) {
      return {
        found: false,
        error: String(error),
      };
    }
  }
}

export const slackLookupUserTool = new SlackLookupUserTool();
