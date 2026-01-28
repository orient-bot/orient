/**
 * Slack Dual-Mode Client
 *
 * Unified client for posting messages as either:
 * - Bot mode: Messages appear from the bot (with "APP" label)
 * - User mode: Messages appear from you directly (no "APP" label)
 *
 * Features:
 * - Per-message mode selection
 *
 * Exported via @orientbot/bot-slack package.
 * - Per-channel mode overrides
 * - Automatic fallback if user token unavailable
 * - Consistent API regardless of mode
 */

import { WebClient, ChatPostMessageArguments } from '@slack/web-api';
import type { Block, KnownBlock } from '@slack/bolt';
import { SlackUserTokenService } from './slackUserTokenService.js';
import { createDedicatedServiceLogger } from '@orientbot/core';

const logger = createDedicatedServiceLogger('slack-dual-mode', {
  maxSize: '20m',
  maxDays: '14d',
  compress: true,
});

// =============================================================================
// Types
// =============================================================================

export type SlackPostingMode = 'bot' | 'user';

export interface DualModeClientConfig {
  /** Bot token for bot mode */
  botToken: string;
  /** Default posting mode */
  defaultMode: SlackPostingMode;
  /** Per-channel mode overrides */
  channelModeOverrides?: Record<string, SlackPostingMode>;
}

export interface PostMessageOptions {
  /** Override the posting mode for this message */
  mode?: SlackPostingMode;
  /** Thread timestamp for replies */
  threadTs?: string;
  /** Block Kit blocks */
  blocks?: (Block | KnownBlock)[];
  /** Attachments (legacy) */
  attachments?: any[];
  /** Unfurl links */
  unfurlLinks?: boolean;
  /** Unfurl media */
  unfurlMedia?: boolean;
  /** Parse mode */
  parse?: 'none' | 'full';
  /** Metadata */
  metadata?: any;
}

export interface PostMessageResult {
  success: boolean;
  mode: SlackPostingMode;
  ts?: string;
  channel?: string;
  error?: string;
  usedFallback?: boolean;
}

export interface ReactionResult {
  success: boolean;
  mode: SlackPostingMode;
  error?: string;
}

// =============================================================================
// Dual Mode Client Implementation
// =============================================================================

export class SlackDualModeClient {
  private botClient: WebClient;
  private userTokenService: SlackUserTokenService | null = null;
  private config: DualModeClientConfig;
  private channelOverrides: Map<string, SlackPostingMode>;

  constructor(config: DualModeClientConfig) {
    this.config = config;
    this.botClient = new WebClient(config.botToken);
    this.channelOverrides = new Map(Object.entries(config.channelModeOverrides || {}));
  }

  /**
   * Attach the user token service
   */
  attachUserTokenService(service: SlackUserTokenService): void {
    this.userTokenService = service;
    logger.info('User token service attached');
  }

  /**
   * Get the appropriate client for a mode
   */
  private getClient(mode: SlackPostingMode): WebClient | null {
    if (mode === 'bot') {
      return this.botClient;
    }

    if (mode === 'user') {
      return this.userTokenService?.getUserClient() || null;
    }

    return null;
  }

  /**
   * Check if a mode is available
   */
  isModeAvailable(mode: SlackPostingMode): boolean {
    if (mode === 'bot') {
      return true; // Bot is always available if configured
    }

    if (mode === 'user') {
      return this.userTokenService?.hasUserToken() ?? false;
    }

    return false;
  }

  /**
   * Determine the effective mode for a channel
   */
  private getEffectiveMode(channel: string, requestedMode?: SlackPostingMode): SlackPostingMode {
    // Explicit request takes precedence
    if (requestedMode) {
      if (this.isModeAvailable(requestedMode)) {
        return requestedMode;
      }
      // Fall back if requested mode not available
      logger.debug('Requested mode not available, using fallback', {
        requested: requestedMode,
        fallback: requestedMode === 'user' ? 'bot' : 'user',
      });
    }

    // Check channel override
    if (this.channelOverrides.has(channel)) {
      const overrideMode = this.channelOverrides.get(channel)!;
      if (this.isModeAvailable(overrideMode)) {
        return overrideMode;
      }
    }

    // Use default mode if available
    if (this.isModeAvailable(this.config.defaultMode)) {
      return this.config.defaultMode;
    }

    // Final fallback to bot
    return 'bot';
  }

  /**
   * Post a message to a channel
   */
  async postMessage(
    channel: string,
    text: string,
    options?: PostMessageOptions
  ): Promise<PostMessageResult> {
    const requestedMode = options?.mode;
    const effectiveMode = this.getEffectiveMode(channel, requestedMode);
    const usedFallback = requestedMode !== undefined && requestedMode !== effectiveMode;

    const client = this.getClient(effectiveMode);
    if (!client) {
      return {
        success: false,
        mode: effectiveMode,
        error: `No client available for mode: ${effectiveMode}`,
      };
    }

    const op = logger.startOperation('postMessage');

    try {
      const result = await client.chat.postMessage({
        channel,
        text,
        thread_ts: options?.threadTs,
        blocks: options?.blocks,
        attachments: options?.attachments,
        unfurl_links: options?.unfurlLinks,
        unfurl_media: options?.unfurlMedia,
        parse: options?.parse,
        metadata: options?.metadata,
      });

      if (result.ok) {
        op.success('Message posted', {
          channel,
          mode: effectiveMode,
          ts: result.ts,
          usedFallback,
        });

        return {
          success: true,
          mode: effectiveMode,
          ts: result.ts,
          channel: result.channel,
          usedFallback,
        };
      }

      op.failure('Message post returned not ok');
      return {
        success: false,
        mode: effectiveMode,
        error: 'Unknown error',
        usedFallback,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      op.failure(error instanceof Error ? error : String(error));

      // If user mode failed, try bot mode as fallback
      if (effectiveMode === 'user' && !usedFallback) {
        logger.warn('User mode failed, attempting bot fallback', { channel, error: errorMessage });
        return this.postMessage(channel, text, { ...options, mode: 'bot' });
      }

      return {
        success: false,
        mode: effectiveMode,
        error: errorMessage,
        usedFallback,
      };
    }
  }

  /**
   * Update an existing message
   */
  async updateMessage(
    channel: string,
    ts: string,
    text: string,
    options?: Omit<PostMessageOptions, 'threadTs'>
  ): Promise<PostMessageResult> {
    const effectiveMode = this.getEffectiveMode(channel, options?.mode);
    const client = this.getClient(effectiveMode);

    if (!client) {
      return {
        success: false,
        mode: effectiveMode,
        error: `No client available for mode: ${effectiveMode}`,
      };
    }

    try {
      const result = await client.chat.update({
        channel,
        ts,
        text,
        blocks: options?.blocks,
        attachments: options?.attachments,
      });

      if (result.ok) {
        return {
          success: true,
          mode: effectiveMode,
          ts: result.ts,
          channel: result.channel,
        };
      }

      return {
        success: false,
        mode: effectiveMode,
        error: 'Unknown error',
      };
    } catch (error) {
      return {
        success: false,
        mode: effectiveMode,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * Delete a message
   */
  async deleteMessage(
    channel: string,
    ts: string,
    mode?: SlackPostingMode
  ): Promise<PostMessageResult> {
    const effectiveMode = this.getEffectiveMode(channel, mode);
    const client = this.getClient(effectiveMode);

    if (!client) {
      return {
        success: false,
        mode: effectiveMode,
        error: `No client available for mode: ${effectiveMode}`,
      };
    }

    try {
      const result = await client.chat.delete({
        channel,
        ts,
      });

      return {
        success: result.ok ?? false,
        mode: effectiveMode,
        ts,
        channel,
      };
    } catch (error) {
      return {
        success: false,
        mode: effectiveMode,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * Add a reaction to a message
   * Note: User mode reactions appear as from the user
   */
  async addReaction(
    channel: string,
    ts: string,
    emoji: string,
    mode?: SlackPostingMode
  ): Promise<ReactionResult> {
    const effectiveMode = this.getEffectiveMode(channel, mode);
    const client = this.getClient(effectiveMode);

    if (!client) {
      return {
        success: false,
        mode: effectiveMode,
        error: `No client available for mode: ${effectiveMode}`,
      };
    }

    try {
      const result = await client.reactions.add({
        channel,
        timestamp: ts,
        name: emoji.replace(/:/g, ''),
      });

      return {
        success: result.ok ?? false,
        mode: effectiveMode,
      };
    } catch (error) {
      return {
        success: false,
        mode: effectiveMode,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * Remove a reaction from a message
   */
  async removeReaction(
    channel: string,
    ts: string,
    emoji: string,
    mode?: SlackPostingMode
  ): Promise<ReactionResult> {
    const effectiveMode = this.getEffectiveMode(channel, mode);
    const client = this.getClient(effectiveMode);

    if (!client) {
      return {
        success: false,
        mode: effectiveMode,
        error: `No client available for mode: ${effectiveMode}`,
      };
    }

    try {
      const result = await client.reactions.remove({
        channel,
        timestamp: ts,
        name: emoji.replace(/:/g, ''),
      });

      return {
        success: result.ok ?? false,
        mode: effectiveMode,
      };
    } catch (error) {
      return {
        success: false,
        mode: effectiveMode,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * Reply to a thread
   */
  async replyToThread(
    channel: string,
    threadTs: string,
    text: string,
    options?: Omit<PostMessageOptions, 'threadTs'>
  ): Promise<PostMessageResult> {
    return this.postMessage(channel, text, {
      ...options,
      threadTs,
    });
  }

  /**
   * Set a channel mode override
   */
  setChannelMode(channel: string, mode: SlackPostingMode): void {
    this.channelOverrides.set(channel, mode);
    logger.info('Channel mode override set', { channel, mode });
  }

  /**
   * Remove a channel mode override
   */
  removeChannelMode(channel: string): void {
    this.channelOverrides.delete(channel);
    logger.info('Channel mode override removed', { channel });
  }

  /**
   * Get the current mode for a channel
   */
  getChannelMode(channel: string): SlackPostingMode {
    return this.getEffectiveMode(channel);
  }

  /**
   * Get all channel overrides
   */
  getChannelOverrides(): Record<string, SlackPostingMode> {
    return Object.fromEntries(this.channelOverrides);
  }

  /**
   * Get the status of both modes
   */
  getStatus(): {
    botAvailable: boolean;
    userAvailable: boolean;
    defaultMode: SlackPostingMode;
    channelOverrides: number;
  } {
    return {
      botAvailable: true,
      userAvailable: this.isModeAvailable('user'),
      defaultMode: this.config.defaultMode,
      channelOverrides: this.channelOverrides.size,
    };
  }

  /**
   * Get the bot client for direct access
   */
  getBotClient(): WebClient {
    return this.botClient;
  }

  /**
   * Get the user client for direct access (if available)
   */
  getUserClient(): WebClient | null {
    return this.userTokenService?.getUserClient() || null;
  }
}

/**
 * Create a Slack dual-mode client
 */
export function createSlackDualModeClient(config: DualModeClientConfig): SlackDualModeClient {
  return new SlackDualModeClient(config);
}
