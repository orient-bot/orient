/**
 * Slack Bot Service
 *
 * Full Slack Bolt app with support for:
 * - @mentions (app_mention events)
 * - Direct messages (DMs)
 * - Slash commands (/ai, /ask, /model)
 * - Channel message listening (optional)
 *
 * Uses Socket Mode for real-time communication without needing a public URL.
 *
 * Exported via @orientbot/bot-slack package.
 */

import pkg from '@slack/bolt';
import type {
  App as AppType,
  MessageEvent,
  AppMentionEvent,
  SlashCommand,
  Middleware,
  SlackCommandMiddlewareArgs,
  SlackEventMiddlewareArgs,
  AllMiddlewareArgs,
  KnownBlock,
  SectionBlock,
  ActionsBlock,
} from '@slack/bolt';
const { App, LogLevel } = pkg;
import { EventEmitter } from 'events';
import { createDedicatedServiceLogger } from '@orientbot/core';
import {
  SlackDatabase,
  SlackChannelType as DbSlackChannelType,
} from '@orientbot/database-services';
import { PromptService } from '@orientbot/agents';
import { OpenCodeSlackHandler, createOpenCodeSlackHandler } from './openCodeSlackHandler.js';
import type {
  SlackBotConfig,
  SlackMessageContext,
  SlackInternalContext,
  SlackChannelType,
  SlackChannelPermission,
  OpenCodeSlackConfig,
} from '../types.js';
import { createProgressiveResponder } from '@orientbot/agents';

// Create a dedicated logger for the Slack bot
const logger = createDedicatedServiceLogger('slack-bot', {
  maxSize: '20m',
  maxDays: '14d',
  compress: true,
});

/**
 * Slack Bot Service Configuration
 */
export interface SlackBotServiceConfig {
  slack: SlackBotConfig;
  opencode: OpenCodeSlackConfig;
  defaultPermission?: SlackChannelPermission;
}

/**
 * Slack Bot Service
 *
 * Manages the Slack Bolt app lifecycle and message processing
 */
export class SlackBotService extends EventEmitter {
  private app: AppType;
  private config: SlackBotServiceConfig;
  private db: SlackDatabase;
  private opencodeHandler: OpenCodeSlackHandler;
  private botUserId: string | null = null;

  constructor(config: SlackBotServiceConfig, db: SlackDatabase) {
    super();
    this.config = config;
    this.db = db;

    // Initialize OpenCode handler
    this.opencodeHandler = createOpenCodeSlackHandler(config.opencode);

    // Initialize Bolt app with Socket Mode
    this.app = new App({
      token: config.slack.botToken,
      signingSecret: config.slack.signingSecret,
      appToken: config.slack.appToken,
      socketMode: true,
      logLevel: LogLevel.INFO,
    });

    // Setup event handlers
    this.setupEventHandlers();
    this.setupSlashCommands();

    logger.info('Slack Bot Service initialized');
  }

  /**
   * Set the prompt service for custom per-channel prompts
   */
  setPromptService(promptService: PromptService): void {
    this.opencodeHandler.setPromptService(promptService);
  }

  /**
   * Start the Slack bot
   */
  async start(): Promise<void> {
    // Check if OpenCode server is available
    const serverAvailable = await this.opencodeHandler.isServerAvailable();
    if (!serverAvailable) {
      logger.error('OpenCode server is not available');
      throw new Error('OpenCode server is not available');
    }

    // Start the Bolt app
    await this.app.start();

    // Get bot user ID
    try {
      const authTest = await this.app.client.auth.test();
      this.botUserId = authTest.user_id || null;
      logger.info('Slack bot started', { botUserId: this.botUserId });
    } catch (error) {
      logger.warn('Failed to get bot user ID', {
        error: error instanceof Error ? error.message : String(error),
      });
    }

    // Bootstrap channels and history (disabled by default - requires additional OAuth scopes)
    // To enable, set SLACK_BOOTSTRAP_HISTORY=true and add these scopes:
    // groups:read, groups:history, mpim:read, mpim:history
    if (process.env.SLACK_BOOTSTRAP_HISTORY === 'true') {
      await this.bootstrapChannelsAndHistory();
    } else {
      logger.info('Channel bootstrap disabled. Set SLACK_BOOTSTRAP_HISTORY=true to enable.');
    }

    this.emit('ready');
    logger.info('Slack Bot Service started');
  }

  /**
   * Bootstrap channels and message history from Slack
   * Discovers all channels the bot is a member of and optionally fetches recent history
   */
  async bootstrapChannelsAndHistory(): Promise<void> {
    logger.info('Starting channel and history bootstrap...');

    try {
      // Get all conversations the bot is a member of
      const conversations = await this.discoverAllConversations();
      logger.info(`Discovered ${conversations.length} conversations`);

      // Store channels in database
      let newChannels = 0;
      let updatedChannels = 0;

      for (const channel of conversations) {
        const existing = await this.db.getChannelInfo(channel.id);

        await this.db.upsertChannel(
          channel.id,
          channel.name || undefined,
          this.mapChannelType(channel.is_im, channel.is_mpim, channel.is_private),
          true // is_member
        );

        if (existing) {
          updatedChannels++;
        } else {
          newChannels++;
        }

        // Fetch recent history for each channel (limit to 50 messages per channel)
        const historyCount = await this.fetchChannelHistory(channel.id, 50);
        if (historyCount > 0) {
          logger.info(`Fetched ${historyCount} messages from ${channel.name || channel.id}`);
        }
      }

      logger.info('Bootstrap complete', {
        totalConversations: conversations.length,
        newChannels,
        updatedChannels,
      });
    } catch (error) {
      logger.error('Failed to bootstrap channels and history', {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  /**
   * Discover all conversations the bot is a member of
   */
  private async discoverAllConversations(): Promise<
    Array<{
      id: string;
      name?: string;
      is_im?: boolean;
      is_mpim?: boolean;
      is_private?: boolean;
      is_member?: boolean;
    }>
  > {
    const allConversations: Array<{
      id: string;
      name?: string;
      is_im?: boolean;
      is_mpim?: boolean;
      is_private?: boolean;
      is_member?: boolean;
    }> = [];

    let cursor: string | undefined;

    do {
      try {
        const result = await this.app.client.conversations.list({
          types: 'public_channel,private_channel,mpim,im',
          exclude_archived: true,
          limit: 200,
          cursor,
        });

        if (result.channels) {
          allConversations.push(
            ...result.channels.map((ch: NonNullable<typeof result.channels>[number]) => ({
              id: ch.id!,
              name: ch.name,
              is_im: ch.is_im,
              is_mpim: ch.is_mpim,
              is_private: ch.is_private,
              is_member: ch.is_member,
            }))
          );
        }

        cursor = result.response_metadata?.next_cursor;
      } catch (error: unknown) {
        const slackError = error as { data?: { needed?: string; provided?: string } };
        logger.error('Error listing conversations', {
          error: error instanceof Error ? error.message : String(error),
          needed: slackError.data?.needed,
          provided: slackError.data?.provided,
        });

        // Log helpful message about required scopes
        if (slackError.data?.needed) {
          logger.warn(
            `Missing OAuth scope: "${slackError.data.needed}". Add this scope in your Slack app's OAuth & Permissions, then reinstall the app.`
          );
        }
        break;
      }
    } while (cursor);

    return allConversations;
  }

  /**
   * Fetch channel history and store messages
   * @param channelId Channel ID
   * @param limit Maximum number of messages to fetch
   * @returns Number of messages stored
   */
  private async fetchChannelHistory(channelId: string, limit: number): Promise<number> {
    try {
      const result = await this.app.client.conversations.history({
        channel: channelId,
        limit,
      });

      if (!result.messages || result.messages.length === 0) {
        return 0;
      }

      let storedCount = 0;

      for (const message of result.messages) {
        // Skip bot messages, system messages, etc.
        if (!message.user || !message.text || message.subtype) {
          continue;
        }

        // Check if message already exists
        const exists = await this.db.messageExists(message.ts!);
        if (exists) {
          continue;
        }

        // Get user name
        let userName: string | undefined;
        try {
          const userInfo = await this.app.client.users.info({ user: message.user });
          userName = userInfo.user?.name;
        } catch {
          // Ignore user info errors
        }

        // Determine if this is a bot message (outgoing) or user message (incoming)
        const isOutgoing = message.user === this.botUserId;
        const timestamp = new Date(parseFloat(message.ts!) * 1000);

        if (isOutgoing) {
          await this.db.storeOutgoingMessage(
            message.ts!,
            channelId,
            message.user,
            userName || 'Bot',
            message.text,
            message.thread_ts
          );
        } else {
          await this.db.storeIncomingMessage(
            message.ts!,
            channelId,
            message.user,
            userName || null,
            message.text,
            timestamp,
            message.thread_ts
          );
        }

        storedCount++;
      }

      return storedCount;
    } catch (error) {
      // This can fail if bot doesn't have history access to the channel
      logger.debug('Failed to fetch history for channel', {
        channelId,
        error: error instanceof Error ? error.message : String(error),
      });
      return 0;
    }
  }

  /**
   * Map Slack channel flags to our channel type
   */
  private mapChannelType(
    isIm?: boolean,
    isMpim?: boolean,
    isPrivate?: boolean
  ): DbSlackChannelType {
    if (isIm) return 'dm';
    if (isMpim) return 'group_dm';
    if (isPrivate) return 'private';
    return 'channel';
  }

  /**
   * Stop the Slack bot
   */
  async stop(): Promise<void> {
    await this.app.stop();
    this.emit('disconnected', 'Manual stop');
    logger.info('Slack Bot Service stopped');
  }

  /**
   * Setup event handlers for messages and mentions
   */
  private setupEventHandlers(): void {
    // Handle @mentions
    this.app.event(
      'app_mention',
      async ({ event, say }: SlackEventMiddlewareArgs<'app_mention'> & AllMiddlewareArgs) => {
        logger.info('Received app_mention event', {
          user: event.user,
          channel: event.channel,
          text: event.text?.substring(0, 100),
        });
        await this.handleAppMention(event as AppMentionEvent, say);
      }
    );

    // Handle direct messages
    this.app.message(
      async ({ message, say }: SlackEventMiddlewareArgs<'message'> & AllMiddlewareArgs) => {
        logger.debug('Received message event', {
          type: (message as any).channel_type,
          user: (message as any).user,
          hasText: !!(message as any).text,
          subtype: (message as any).subtype,
          bot_id: (message as any).bot_id,
        });

        // Only handle non-bot messages
        const msg = message as MessageEvent & { bot_id?: string; subtype?: string };
        if (msg.bot_id || msg.subtype) {
          logger.debug('Skipping bot/subtype message');
          return;
        }

        await this.handleMessage(msg, say);
      }
    );

    // Handle action buttons (for pending config actions)
    this.app.action(/^config_(approve|reject)_.+$/, async ({ body, ack, client }) => {
      await ack();

      const actionId = (body as any).actions?.[0]?.action_id as string;
      const userId = (body as any).user?.id;
      const channelId = (body as any).channel?.id;
      const messageTs = (body as any).message?.ts;

      logger.info('Received config action', { actionId, userId, channelId });

      if (!actionId) {
        logger.warn('No action_id in button payload');
        return;
      }

      // Extract action type and pending action ID from action_id
      // Format: config_approve_cfg_xxx or config_reject_cfg_xxx
      const match = actionId.match(/^config_(approve|reject)_(cfg_.+)$/);
      if (!match) {
        logger.warn('Invalid action_id format', { actionId });
        return;
      }

      const [, actionType, pendingActionId] = match;
      const isApprove = actionType === 'approve';

      try {
        // Build a minimal context for OpenCode processing
        const context: SlackInternalContext = {
          channelId,
          channelType: 'im' as SlackChannelType,
          userId: userId || 'button_action',
          threadTs: undefined,
        };

        // Use OpenCode to confirm/cancel the action via MCP tools
        const toolName = isApprove ? 'config_confirm_action' : 'config_cancel_action';
        const message = `Use the ${toolName} tool with action_id="${pendingActionId}"`;

        const response = await this.opencodeHandler.processMessage(message, context);

        // Update the original message to show result
        const resultEmoji = isApprove ? ':white_check_mark:' : ':x:';
        const resultText = `${resultEmoji} ${response.text}`;

        const resultBlocks: KnownBlock[] = [
          {
            type: 'section',
            text: {
              type: 'mrkdwn',
              text: resultText,
            },
          } as SectionBlock,
        ];

        await client.chat.update({
          channel: channelId,
          ts: messageTs,
          text: resultText,
          blocks: resultBlocks,
        });

        logger.info('Config action processed', {
          actionId,
          pendingActionId,
          isApprove,
          success: true,
        });
      } catch (error) {
        logger.error('Failed to process config action', {
          actionId,
          error: error instanceof Error ? error.message : String(error),
        });

        await client.chat.postMessage({
          channel: channelId,
          text: `Failed to process action: ${error instanceof Error ? error.message : String(error)}`,
        });
      }
    });
  }

  /**
   * Setup slash commands
   */
  private setupSlashCommands(): void {
    // /ai command - Quick AI interaction
    this.app.command('/ai', this.createSlashCommandHandler('ai'));

    // /ask command - Question with context
    this.app.command('/ask', this.createSlashCommandHandler('ask'));

    // /model command - Model switching and info
    this.app.command(
      '/model',
      async ({ command, ack, respond }: SlackCommandMiddlewareArgs & AllMiddlewareArgs) => {
        await ack();

        const text = command.text.trim().toLowerCase();
        const channelId = command.channel_id;

        if (!text || text === 'info' || text === 'status') {
          // Show current model and available models
          const context = this.buildMessageContext(
            command.channel_id,
            'channel',
            undefined,
            command.user_id,
            command.user_name
          );
          const currentModel = this.opencodeHandler.getModelForContext(`slack:${channelId}:main`);
          const modelsInfo = OpenCodeSlackHandler.getAvailableModelsInfo();

          await respond({
            response_type: 'ephemeral',
            text: `*Current Model:* ${currentModel.name} (${currentModel.provider})\n\n${modelsInfo}`,
          });
        } else if (text.startsWith('switch ') || text.startsWith('use ')) {
          // Switch model
          const modelName = text.replace(/^(switch|use)\s+(to\s+)?/, '').trim();
          const switchResult = this.opencodeHandler.detectModelSwitch(`switch to ${modelName}`);

          if (switchResult.isModelSwitch && switchResult.modelId) {
            this.opencodeHandler.setModelForContext(
              `slack:${channelId}:main`,
              switchResult.modelId
            );
            await respond({
              response_type: 'ephemeral',
              text: `✅ Model switched to *${switchResult.modelName}* (${switchResult.provider})`,
            });
          } else {
            await respond({
              response_type: 'ephemeral',
              text: `❌ Unknown model: "${modelName}". Use \`/model info\` to see available models.`,
            });
          }
        } else {
          await respond({
            response_type: 'ephemeral',
            text: 'Usage:\n• `/model` or `/model info` - Show current model\n• `/model switch <name>` - Switch to a different model',
          });
        }
      }
    );
  }

  /**
   * Create a slash command handler
   */
  private createSlashCommandHandler(
    commandType: 'ai' | 'ask'
  ): Middleware<SlackCommandMiddlewareArgs> {
    return async ({ command, ack, respond }) => {
      await ack();

      const text = command.text.trim();

      if (!text) {
        await respond({
          response_type: 'ephemeral',
          text: `Please provide a message. Usage: \`/${commandType} <your message>\``,
        });
        return;
      }

      // Build context
      const context = this.buildMessageContext(
        command.channel_id,
        'channel',
        undefined,
        command.user_id,
        command.user_name
      );

      try {
        // Process through OpenCode
        const response = await this.opencodeHandler.processMessage(text, context);

        // Format and send response
        const formattedResponse = this.formatResponse(
          response.text,
          response.model,
          response.toolsUsed
        );

        await respond({
          response_type: 'in_channel',
          text: formattedResponse,
        });

        // Store messages
        await this.storeIncomingMessage(command, text);
        await this.storeOutgoingMessage(
          command.channel_id,
          this.botUserId || 'bot',
          formattedResponse
        );

        logger.info('Slash command processed', {
          command: commandType,
          userId: command.user_id,
          channelId: command.channel_id,
          responseLength: response.text.length,
        });
      } catch (error) {
        logger.error('Failed to process slash command', {
          error: error instanceof Error ? error.message : String(error),
          command: commandType,
        });

        await respond({
          response_type: 'ephemeral',
          text: '❌ Sorry, I encountered an error processing your request. Please try again.',
        });
      }
    };
  }

  /**
   * Handle @mention events
   */
  private async handleAppMention(
    event: AppMentionEvent,
    say: (message: string) => Promise<unknown>
  ): Promise<void> {
    const channelId = event.channel;
    const threadTs = event.thread_ts || event.ts;
    const userId = event.user || 'unknown';

    logger.info('Received app_mention', {
      channelId,
      userId,
      text: event.text?.substring(0, 50),
      threadTs,
    });

    // Check permission - but @mentions should always respond unless explicitly ignored
    // This is different from WhatsApp - in Slack, @mentioning is an explicit request for attention
    const permission = await this.getChannelPermission(channelId);

    if (permission === 'ignored') {
      logger.debug('Ignoring mention in ignored channel', { channelId });
      return;
    }

    // Store incoming message
    await this.db.storeIncomingMessage(
      event.ts,
      channelId,
      userId,
      null,
      this.cleanMentionText(event.text),
      new Date(parseFloat(event.ts) * 1000),
      threadTs || undefined
    );

    // For @mentions, we always respond (unlike regular channel messages)
    // The user explicitly asked for the bot's attention
    logger.debug('Processing mention - will respond', { channelId, permission });

    // Get user info for context
    let userName: string | undefined;
    try {
      if (userId !== 'unknown') {
        const userInfo = await this.app.client.users.info({ user: userId });
        userName = userInfo.user?.name;
      }
    } catch {
      // Ignore user info errors
    }

    // Build context
    const context = this.buildMessageContext(
      channelId,
      'channel',
      threadTs || undefined,
      userId,
      userName
    );

    try {
      // Process through OpenCode with progress updates
      const text = this.cleanMentionText(event.text);
      const progressResponder = createProgressiveResponder();

      // Track the progress message timestamp for editing

      const progressResult = await progressResponder.executeWithProgress(
        () => this.opencodeHandler.processMessage(text, context),
        {
          sendReaction: async (emoji: string) => {
            // React to the original message with an emoji (immediate acknowledgment)
            // Slack emoji names don't include colons, convert Unicode emoji to Slack name
            const slackEmoji = this.convertEmojiToSlackName(emoji);
            logger.info('Reacting to Slack message with emoji', {
              channelId,
              ts: event.ts,
              emoji: slackEmoji,
            });
            try {
              await this.app.client.reactions.add({
                channel: channelId,
                timestamp: event.ts,
                name: slackEmoji,
              });
              logger.info('Slack reaction sent successfully', { channelId, emoji: slackEmoji });
            } catch (err) {
              logger.error('Failed to add Slack reaction', {
                error: err instanceof Error ? err.message : String(err),
                channelId,
              });
            }
          },
          sendMessage: async (progressText: string) => {
            // Send initial progress message
            const result = await this.app.client.chat.postMessage({
              channel: channelId,
              text: progressText,
              thread_ts: threadTs,
            });
            logger.debug('Sent Slack progress message', { channelId });
          },
        }
      );

      const response = progressResult.result;

      // Format and send response
      const formattedResponse = this.formatResponse(
        response.text,
        response.model,
        response.toolsUsed
      );

      logger.info('Sending mention response to Slack', {
        channelId,
        threadTs,
        responseLength: formattedResponse.length,
        preview: formattedResponse.substring(0, 100),
      });

      // Detect pending actions for interactive buttons
      const pendingActions = this.detectPendingActions(formattedResponse);

      // Send the response (with buttons if pending actions detected)
      let sayResult;
      if (pendingActions.length > 0) {
        const actionId = pendingActions[0];
        logger.info('Detected pending action, sending with buttons', { channelId, actionId });
        sayResult = await this.app.client.chat.postMessage({
          channel: channelId,
          text: formattedResponse,
          thread_ts: threadTs,
          blocks: this.createPendingActionBlocks(formattedResponse, actionId),
        });
      } else {
        sayResult = await say(formattedResponse);
      }
      logger.info('Slack mention say() result', {
        channelId,
        result: JSON.stringify(sayResult).substring(0, 200),
      });

      // Store outgoing message
      await this.storeOutgoingMessage(
        channelId,
        this.botUserId || 'bot',
        formattedResponse,
        threadTs
      );

      logger.info('Mention processed', {
        channelId,
        userId,
        threadTs,
        responseLength: response.text.length,
        toolsUsed: response.toolsUsed,
        progressMessagesSent: progressResult.messageCount,
      });
    } catch (error) {
      logger.error('Failed to process mention', {
        error: error instanceof Error ? error.message : String(error),
        channelId,
        userId,
      });

      await say('❌ Sorry, I encountered an error processing your request. Please try again.');
    }
  }

  /**
   * Handle direct messages
   */
  private async handleMessage(
    message: MessageEvent,
    say: (message: string) => Promise<unknown>
  ): Promise<void> {
    // Cast to access common properties
    const msg = message as MessageEvent & {
      text?: string;
      channel_type?: string;
      user?: string;
      thread_ts?: string;
    };

    // Only respond to DMs
    if (msg.channel_type !== 'im') {
      logger.debug('Skipping non-DM message', { channel_type: msg.channel_type });
      return;
    }

    logger.info('Processing DM', {
      channel: msg.channel,
      user: msg.user,
      text: msg.text?.substring(0, 50),
    });

    const channelId = msg.channel;
    const userId = msg.user;
    const text = msg.text || '';
    const threadTs = msg.thread_ts;

    if (!userId || !text) {
      return;
    }

    // Check permission (DMs default to read_write since user initiated the conversation)
    let permission = await this.getChannelPermission(channelId);

    // DMs should default to read_write (user explicitly messaged the bot)
    if (!permission || permission === 'read_only') {
      permission = 'read_write';
    }

    logger.debug('DM permission check', { channelId, permission });

    if (permission === 'ignored') {
      logger.debug('Ignoring DM in ignored channel', { channelId });
      return;
    }

    // Store incoming message
    await this.db.storeIncomingMessage(
      msg.ts,
      channelId,
      userId,
      null,
      text,
      new Date(parseFloat(msg.ts) * 1000),
      threadTs
    );

    // Get user info
    let userName: string | undefined;
    try {
      const userInfo = await this.app.client.users.info({ user: userId });
      userName = userInfo.user?.name;
    } catch {
      // Ignore user info errors
    }

    // Build context
    const context = this.buildMessageContext(channelId, 'dm', threadTs, userId, userName);

    try {
      // Process through OpenCode with progress updates
      const progressResponder = createProgressiveResponder();

      // Track the progress message timestamp for editing

      const progressResult = await progressResponder.executeWithProgress(
        () => this.opencodeHandler.processMessage(text, context),
        {
          sendReaction: async (emoji: string) => {
            // React to the original message with an emoji (immediate acknowledgment)
            // Slack emoji names don't include colons, convert Unicode emoji to Slack name
            const slackEmoji = this.convertEmojiToSlackName(emoji);
            logger.info('Reacting to Slack DM with emoji', {
              channelId,
              ts: msg.ts,
              emoji: slackEmoji,
            });
            try {
              await this.app.client.reactions.add({
                channel: channelId,
                timestamp: msg.ts,
                name: slackEmoji,
              });
              logger.info('Slack DM reaction sent successfully', { channelId, emoji: slackEmoji });
            } catch (err) {
              logger.error('Failed to add Slack DM reaction', {
                error: err instanceof Error ? err.message : String(err),
                channelId,
              });
            }
          },
          sendMessage: async (progressText: string) => {
            // Send progress message
            await this.app.client.chat.postMessage({
              channel: channelId,
              text: progressText,
              thread_ts: threadTs,
            });
            logger.debug('Sent Slack DM progress message', { channelId });
          },
        }
      );

      const response = progressResult.result;

      // Format and send response
      const formattedResponse = this.formatResponse(
        response.text,
        response.model,
        response.toolsUsed
      );

      logger.info('Sending response to Slack', {
        channelId,
        responseLength: formattedResponse.length,
        preview: formattedResponse.substring(0, 100),
      });

      // Detect pending actions for interactive buttons
      const pendingActions = this.detectPendingActions(formattedResponse);

      // Send the response (with buttons if pending actions detected)
      let sayResult;
      if (pendingActions.length > 0) {
        const actionId = pendingActions[0];
        logger.info('Detected pending action, sending with buttons', { channelId, actionId });
        sayResult = await this.app.client.chat.postMessage({
          channel: channelId,
          text: formattedResponse,
          thread_ts: threadTs,
          blocks: this.createPendingActionBlocks(formattedResponse, actionId),
        });
      } else {
        sayResult = await say(formattedResponse);
      }
      logger.info('Slack say() result', {
        channelId,
        result: JSON.stringify(sayResult).substring(0, 200),
      });

      // Store outgoing message
      await this.storeOutgoingMessage(
        channelId,
        this.botUserId || 'bot',
        formattedResponse,
        threadTs
      );

      logger.info('DM processed', {
        channelId,
        userId,
        responseLength: response.text.length,
        toolsUsed: response.toolsUsed,
        progressMessagesSent: progressResult.messageCount,
      });
    } catch (error) {
      logger.error('Failed to process DM', {
        error: error instanceof Error ? error.message : String(error),
        channelId,
        userId,
      });

      await say('❌ Sorry, I encountered an error processing your request. Please try again.');
    }
  }

  /**
   * Build message context for OpenCode handler
   */
  private buildMessageContext(
    channelId: string,
    channelType: SlackChannelType,
    threadTs: string | undefined,
    userId: string,
    userName?: string
  ): SlackInternalContext {
    return {
      channelId,
      channelType,
      threadTs,
      userId,
      userName,
    };
  }

  /**
   * Get channel permission from database
   */
  private async getChannelPermission(channelId: string): Promise<SlackChannelPermission> {
    const permission = await this.db.getChannelPermission(channelId);
    if (permission) {
      return permission.permission;
    }
    return this.config.defaultPermission || 'read_only';
  }

  /**
   * Clean @mention text (remove bot mention)
   */
  private cleanMentionText(text: string): string {
    // Remove bot mention from the beginning
    return text.replace(/<@[A-Z0-9]+>\s*/gi, '').trim();
  }

  /**
   * Format response with metadata footer
   */
  private formatResponse(text: string, model: string, toolsUsed: string[]): string {
    const parts: string[] = [text];

    // Add separator and metadata footer
    parts.push('');
    parts.push('─────────────────────');

    // Format model info
    const modelDisplay = this.formatModelName(model);
    parts.push(`_Powered by ${modelDisplay}_`);

    // Format tools used (if any)
    if (toolsUsed.length > 0) {
      const toolsDisplay = this.formatToolNames(toolsUsed);
      parts.push(`_Tools: ${toolsDisplay}_`);
    }

    return parts.join('\n');
  }

  /**
   * Format model name for display
   */
  private formatModelName(modelId: string): string {
    // Handle model IDs that might include provider prefix (e.g., "anthropic/claude-sonnet-4-20250514")
    let normalizedModelId = modelId;
    if (modelId.includes('/')) {
      const parts = modelId.split('/');
      normalizedModelId = parts[parts.length - 1];
    }

    const modelMappings: Record<string, string> = {
      'claude-sonnet-4.5': 'Claude Sonnet 4.5',
      'claude-sonnet-4-20250514': 'Claude Sonnet 4',
      'claude-opus-4.5': 'Claude Opus 4.5',
      'claude-opus-4-20250514': 'Claude Opus 4',
      'gpt-5.2': 'GPT 5.2',
      'grok-code-fast-1': 'Grok Code Fast 1',
      'grok-code': 'Grok Code',
    };

    return modelMappings[normalizedModelId] || normalizedModelId;
  }

  /**
   * Convert Unicode emoji to Slack emoji name
   * Slack reactions use names like 'dog' instead of '🐕'
   */
  private convertEmojiToSlackName(emoji: string): string {
    // Common emoji to Slack name mappings
    const emojiMap: Record<string, string> = {
      '🐕': 'dog2',
      '🐶': 'dog',
      '👍': 'thumbsup',
      '👎': 'thumbsdown',
      '❤️': 'heart',
      '🎉': 'tada',
      '👀': 'eyes',
      '🔥': 'fire',
      '✅': 'white_check_mark',
      '❌': 'x',
      '⏳': 'hourglass_flowing_sand',
      '💡': 'bulb',
      '🤔': 'thinking_face',
      '🚀': 'rocket',
      '⭐': 'star',
      '💪': 'muscle',
    };

    return emojiMap[emoji] || 'dog2'; // Default to dog2 (🐕) for Ori
  }

  /**
   * Format tool names for display
   */
  private formatToolNames(tools: string[]): string {
    const toolCategories: Record<string, string[]> = {};

    for (const tool of tools) {
      let category = 'other';
      let simpleName = tool;

      if (tool.startsWith('ai_first_') || tool.startsWith('jira_')) {
        category = 'JIRA';
        simpleName = tool.replace(/^(ai_first_|jira_)/, '').replace(/_/g, ' ');
      } else if (tool.startsWith('slack_')) {
        category = 'Slack';
        simpleName = tool.replace('slack_', '').replace(/_/g, ' ');
      } else if (tool.startsWith('slides_')) {
        category = 'Slides';
        simpleName = tool.replace('slides_', '').replace(/_/g, ' ');
      }

      if (!toolCategories[category]) {
        toolCategories[category] = [];
      }
      toolCategories[category].push(simpleName);
    }

    const formattedCategories: string[] = [];
    for (const [category, toolNames] of Object.entries(toolCategories)) {
      if (category === 'other') {
        formattedCategories.push(...toolNames);
      } else {
        formattedCategories.push(`${category} (${toolNames.join(', ')})`);
      }
    }

    return formattedCategories.join(', ');
  }

  /**
   * Store incoming message from slash command
   */
  private async storeIncomingMessage(command: SlashCommand, text: string): Promise<void> {
    const messageId = `cmd_${command.trigger_id}`;
    await this.db.storeIncomingMessage(
      messageId,
      command.channel_id,
      command.user_id,
      command.user_name,
      text,
      new Date()
    );
  }

  /**
   * Store outgoing message
   */
  private async storeOutgoingMessage(
    channelId: string,
    userId: string,
    text: string,
    threadTs?: string
  ): Promise<void> {
    const messageId = `out_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    await this.db.storeOutgoingMessage(messageId, channelId, userId, 'Bot', text, threadTs);
  }

  /**
   * Get the Bolt app instance
   */
  getApp(): AppType {
    return this.app;
  }

  /**
   * Get the database instance
   */
  getDatabase(): SlackDatabase {
    return this.db;
  }

  /**
   * Get the OpenCode handler instance
   */
  getOpenCodeHandler(): OpenCodeSlackHandler {
    return this.opencodeHandler;
  }

  /**
   * Detect pending action IDs in text
   * Returns array of action IDs found (format: cfg_xxx_yyy)
   */
  private detectPendingActions(text: string): string[] {
    const regex = /cfg_[a-z0-9]+_[a-z0-9]+/gi;
    const matches = text.match(regex);
    return matches || [];
  }

  /**
   * Create Block Kit with interactive buttons for pending actions
   */
  private createPendingActionBlocks(text: string, actionId: string): KnownBlock[] {
    const sectionBlock: SectionBlock = {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: text,
      },
    };

    const actionsBlock: ActionsBlock = {
      type: 'actions',
      elements: [
        {
          type: 'button',
          text: {
            type: 'plain_text',
            text: 'Approve',
            emoji: true,
          },
          style: 'primary',
          action_id: `config_approve_${actionId}`,
        },
        {
          type: 'button',
          text: {
            type: 'plain_text',
            text: 'Reject',
            emoji: true,
          },
          style: 'danger',
          action_id: `config_reject_${actionId}`,
        },
      ],
    };

    return [sectionBlock, actionsBlock];
  }

  /**
   * Send a message with Block Kit if pending actions are detected, otherwise plain text
   */
  async sendFormattedResponse(channelId: string, text: string, threadTs?: string): Promise<void> {
    const pendingActions = this.detectPendingActions(text);

    if (pendingActions.length > 0) {
      // Use the first pending action for buttons
      const actionId = pendingActions[0];

      logger.info('Detected pending action, sending with buttons', {
        channelId,
        actionId,
      });

      await this.app.client.chat.postMessage({
        channel: channelId,
        text: text, // Fallback for notifications
        thread_ts: threadTs,
        blocks: this.createPendingActionBlocks(text, actionId),
      });
    } else {
      // No pending actions, send plain text
      await this.app.client.chat.postMessage({
        channel: channelId,
        text: text,
        thread_ts: threadTs,
      });
    }
  }
}

/**
 * Create a Slack bot service
 */
export function createSlackBotService(
  config: SlackBotServiceConfig,
  db: SlackDatabase
): SlackBotService {
  return new SlackBotService(config, db);
}
