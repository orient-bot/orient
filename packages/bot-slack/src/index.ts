/**
 * @orientbot/bot-slack
 *
 * Slack bot service for the Orient.
 *
 * This package provides:
 * - Slack Bolt app integration
 * - Mention and DM handling
 * - Socket mode connection
 * - Dual-mode posting (bot or user token)
 *
 * Service implementations are in src/services/ and re-exported here.
 * Import from this package for the public API.
 */

export * from './types.js';
export * from './services/index.js';

/**
 * Slack Services Status
 *
 * Package-native implementations:
 * - SlackConnection - Bolt app connection management
 * - SlackMessaging - Message sending
 *
 * Services re-exported from src/services/:
 * - slackBotService - Full Slack Bolt app
 * - slackDualModeClient - Bot/user mode posting
 * - slackService - Core Slack utilities
 * - slackUserTokenService - OAuth user tokens
 * - openCodeSlackHandler - OpenCode integration
 * - slackDatabaseDrizzle - Database operations
 */
export const SLACK_SERVICES = {
  // Package-native (preferred)
  connection: 'SlackConnection',
  messaging: 'SlackMessaging',
  // Re-exported from src/services/ imports
  srcServices: [
    'slackBotService',
    'slackDualModeClient',
    'slackService',
    'slackUserTokenService',
    'openCodeSlackHandler',
    'slackDatabaseDrizzle',
  ],
} as const;
