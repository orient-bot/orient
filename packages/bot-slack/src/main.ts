#!/usr/bin/env node
/**
 * Slack Bot Container Entry Point
 *
 * This is the main entry point when running as a Docker container.
 * It initializes all services and starts the Slack bot with full
 * message handling and OpenCode integration.
 */

import { createSlackBotService } from './services/index.js';
import {
  createServiceLogger,
  loadConfig,
  getConfig,
  setSecretOverrides,
  startConfigPoller,
} from '@orient-bot/core';
import {
  createSecretsService,
  createSlackDatabase,
  createMessageDatabase,
  createPromptService,
} from '@orient-bot/database-services';
import type { SlackBotServiceConfig } from './types.js';

const logger = createServiceLogger('slack-bot');
const secretsService = createSecretsService();

/**
 * Graceful shutdown handler
 */
function setupGracefulShutdown(slackBot: ReturnType<typeof createSlackBotService>): void {
  const shutdown = async (signal: string) => {
    logger.info('Received shutdown signal', { signal });
    try {
      await slackBot.stop();
      logger.info('Slack Bot shutdown complete');
      process.exit(0);
    } catch (error) {
      logger.error('Error during shutdown', { error: String(error) });
      process.exit(1);
    }
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

async function loadSecretOverrides(): Promise<void> {
  try {
    const secrets = await secretsService.getAllSecrets();
    if (Object.keys(secrets).length > 0) {
      setSecretOverrides(secrets);
    }
  } catch (error) {
    logger.warn('Failed to load secrets from database', { error: String(error) });
  }
}

async function main(): Promise<void> {
  const op = logger.startOperation('startup');

  logger.info('Starting Slack Bot...');

  try {
    await loadSecretOverrides();
    const pollUrl = process.env.ORIENT_CONFIG_POLL_URL;
    if (pollUrl) {
      startConfigPoller({
        url: pollUrl,
        intervalMs: parseInt(process.env.ORIENT_CONFIG_POLL_INTERVAL_MS || '30000', 10),
      });
    }

    // Load configuration
    await loadConfig();
    const config = getConfig();

    // Build Slack bot config from environment or config
    const slackConfig = config.integrations.slack;
    const slackBotMode = slackConfig?.bot;

    const botToken = process.env.SLACK_BOT_TOKEN || slackBotMode?.token || '';
    const appToken = process.env.SLACK_APP_TOKEN || slackBotMode?.appToken || '';
    const signingSecret = process.env.SLACK_SIGNING_SECRET || slackBotMode?.signingSecret || '';
    const userToken = process.env.SLACK_USER_TOKEN || slackConfig?.user?.token;

    // Validate required config
    if (!botToken) {
      throw new Error('SLACK_BOT_TOKEN is required');
    }
    if (!appToken) {
      throw new Error('SLACK_APP_TOKEN is required');
    }
    if (!signingSecret) {
      throw new Error('SLACK_SIGNING_SECRET is required');
    }

    // Build OpenCode config
    const opencodeUrl = process.env.OPENCODE_URL || 'http://localhost:4099';

    const slackBotServiceConfig: SlackBotServiceConfig = {
      slack: {
        botToken,
        appToken,
        signingSecret,
        userToken,
        defaultChannel: process.env.SLACK_DEFAULT_CHANNEL || slackConfig?.standupChannel,
      },
      opencode: {
        serverUrl: opencodeUrl,
        systemPrompt: process.env.OPENCODE_SYSTEM_PROMPT,
      },
    };

    logger.info('Configuration loaded');

    // Initialize databases
    const slackDatabase = createSlackDatabase();
    const messageDatabase = createMessageDatabase(); // For prompt service

    // Initialize prompt service
    const promptService = createPromptService(messageDatabase);
    logger.info('Prompt service initialized');

    // Create and start the Slack bot service with full message handling
    const slackBot = createSlackBotService(slackBotServiceConfig, slackDatabase);

    // Set prompt service on the bot
    slackBot.setPromptService(promptService);
    logger.info('Prompt service configured for Slack bot');

    // Setup graceful shutdown
    setupGracefulShutdown(slackBot);

    // Listen for events
    slackBot.on('ready', () => {
      logger.info('Slack Bot is ready!');
    });

    // Start the bot
    await slackBot.start();

    op.success('Slack Bot started successfully');

    // Keep the process alive
    logger.info('Slack Bot running. Press Ctrl+C to stop.');
  } catch (error) {
    op.failure(error as Error);
    logger.error('Failed to start Slack Bot', { error: String(error) });
    process.exit(1);
  }
}

main().catch((error) => {
  logger.error('Unhandled error in main', { error: String(error) });
  process.exit(1);
});
