/**
 * Slack Onboarding Service
 *
 * Sends onboarding DM to admin users after first-time Slack configuration
 */

import { WebClient } from '@slack/web-api';
import { createServiceLogger } from '@orient/core';

const logger = createServiceLogger('slack-onboarding');

export interface SlackOnboardingConfig {
  botToken: string;
  signingSecret: string;
  appToken: string;
}

export interface SendOnboardingResult {
  success: boolean;
  error?: string;
}

export class SlackOnboardingService {
  private client: WebClient;

  constructor(config: SlackOnboardingConfig) {
    this.client = new WebClient(config.botToken);
  }

  /**
   * Send onboarding DM to admin user
   * Tries to find user by email, falls back to first admin/owner
   */
  async sendOnboardingDM(userEmail?: string): Promise<SendOnboardingResult> {
    try {
      // Find user to DM
      const userId = await this.findUserToDM(userEmail);

      if (!userId) {
        logger.warn('No admin user found for onboarding DM');
        return {
          success: false,
          error: 'No admin user found',
        };
      }

      // Build and send onboarding message
      await this.client.chat.postMessage({
        channel: userId,
        blocks: this.buildOnboardingBlocks(),
        text: 'Welcome to Orient! Your Slack bot is configured and ready to use.',
      });

      logger.info('Sent onboarding DM', { userId, userEmail });
      return { success: true };
    } catch (error) {
      logger.error('Failed to send onboarding DM', {
        error: error instanceof Error ? error.message : String(error),
      });
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * Find user to send DM to
   * Priority: specified email -> first admin/owner
   */
  private async findUserToDM(email?: string): Promise<string | null> {
    try {
      // If email provided, try to find that user
      if (email) {
        try {
          const result = await this.client.users.lookupByEmail({ email });
          if (result.user?.id) {
            return result.user.id;
          }
        } catch (error) {
          logger.warn('User not found by email, falling back to first admin', { email });
        }
      }

      // Fall back to first admin/owner
      const usersResult = await this.client.users.list();
      if (!usersResult.members) {
        return null;
      }

      // Find first admin or owner
      const adminUser = usersResult.members.find(
        (user) => !user.is_bot && (user.is_admin || user.is_owner)
      );

      return adminUser?.id || null;
    } catch (error) {
      logger.error('Failed to find user for DM', {
        error: error instanceof Error ? error.message : String(error),
      });
      return null;
    }
  }

  /**
   * Build Slack Block Kit message for onboarding
   */
  private buildOnboardingBlocks() {
    return [
      {
        type: 'header',
        text: {
          type: 'plain_text',
          text: '🎉 Welcome to Orient!',
          emoji: true,
        },
      },
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: 'Your Slack bot is now configured and ready to use. Here are the key things you can do:',
        },
      },
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text:
            '*Quick Start Guide:*\n\n' +
            '• *Send me a DM* - Just message me directly for quick AI assistance\n' +
            "• *@mention me in channels* - Tag me in any channel where I'm invited\n" +
            '• *Use slash commands* - Try `/ai <your question>` or `/ask <your question>`\n' +
            '• *Switch models* - Use `/model` to see available AI models\n' +
            '• *Configure permissions* - Control which channels I can access in the dashboard',
        },
      },
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text:
            '*Tips:*\n' +
            '✅ I respond to DMs automatically\n' +
            '✅ In channels, @mention me to get my attention\n' +
            '✅ Use threads to keep conversations organized\n' +
            '✅ Check the dashboard to manage channel permissions',
        },
      },
      {
        type: 'divider',
      },
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: '_Ready to get started? Just send me a message!_',
        },
      },
    ];
  }
}
