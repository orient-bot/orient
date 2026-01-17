/**
 * Slack Messaging Service
 *
 * Handles sending messages through the Slack Web API.
 */

import { createServiceLogger } from '@orient/core';
import type { PostMessageResult, SlackUserInfo } from '../types.js';

const logger = createServiceLogger('slack-messaging');

// Generic Slack client type to avoid version mismatch issues
type SlackWebClient = {
  chat: {
    postMessage: (params: any) => Promise<any>;
    update: (params: any) => Promise<any>;
    delete: (params: any) => Promise<any>;
  };
  conversations: { open: (params: any) => Promise<any> };
  reactions: { add: (params: any) => Promise<any> };
  users: {
    info: (params: any) => Promise<any>;
    lookupByEmail: (params: any) => Promise<any>;
  };
};

export interface MessageOptions {
  threadTs?: string;
  blocks?: any[];
  unfurlLinks?: boolean;
  unfurlMedia?: boolean;
}

/**
 * Slack Messaging Handler
 *
 * Provides methods for sending messages via the Slack Web API.
 */
export class SlackMessaging {
  private client: SlackWebClient | null = null;

  /**
   * Set the web client (from SlackConnection)
   */
  setClient(client: SlackWebClient | null): void {
    this.client = client;
  }

  /**
   * Ensure client is available
   */
  private requireClient(): SlackWebClient {
    if (!this.client) {
      throw new Error('Slack client not connected');
    }
    return this.client;
  }

  /**
   * Post a message to a channel
   */
  async postMessage(
    channel: string,
    text: string,
    options?: MessageOptions
  ): Promise<PostMessageResult> {
    const op = logger.startOperation('postMessage');

    try {
      const client = this.requireClient();
      const result = await client.chat.postMessage({
        channel,
        text,
        thread_ts: options?.threadTs,
        blocks: options?.blocks,
        unfurl_links: options?.unfurlLinks ?? false,
        unfurl_media: options?.unfurlMedia ?? true,
      });

      op.success('Message posted');
      return {
        ok: result.ok,
        ts: result.ts as string,
        channel: result.channel as string,
      };
    } catch (error) {
      op.failure(error as Error);
      throw error;
    }
  }

  /**
   * Post a reply in a thread
   */
  async postThreadReply(
    channel: string,
    threadTs: string,
    text: string,
    options?: Omit<MessageOptions, 'threadTs'>
  ): Promise<PostMessageResult> {
    return this.postMessage(channel, text, { ...options, threadTs });
  }

  /**
   * Send a direct message to a user
   */
  async sendDirectMessage(
    userId: string,
    text: string,
    options?: Omit<MessageOptions, 'threadTs'>
  ): Promise<PostMessageResult> {
    const op = logger.startOperation('sendDirectMessage');

    try {
      const client = this.requireClient();

      // Open DM channel
      const dmResult = await client.conversations.open({ users: userId });
      const dmChannel = dmResult.channel?.id;

      if (!dmChannel) {
        throw new Error(`Could not open DM channel with user ${userId}`);
      }

      // Send message
      const result = await client.chat.postMessage({
        channel: dmChannel,
        text,
        blocks: options?.blocks,
        unfurl_links: options?.unfurlLinks ?? false,
        unfurl_media: options?.unfurlMedia ?? true,
      });

      op.success('DM sent');
      return {
        ok: result.ok,
        ts: result.ts as string,
        channel: result.channel as string,
      };
    } catch (error) {
      op.failure(error as Error);
      throw error;
    }
  }

  /**
   * Add a reaction to a message
   */
  async addReaction(channel: string, timestamp: string, emoji: string): Promise<void> {
    const op = logger.startOperation('addReaction');

    try {
      const client = this.requireClient();
      await client.reactions.add({
        channel,
        timestamp,
        name: emoji,
      });
      op.success('Reaction added');
    } catch (error) {
      op.failure(error as Error);
      throw error;
    }
  }

  /**
   * Update a message
   */
  async updateMessage(
    channel: string,
    timestamp: string,
    text: string,
    blocks?: any[]
  ): Promise<PostMessageResult> {
    const op = logger.startOperation('updateMessage');

    try {
      const client = this.requireClient();
      const result = await client.chat.update({
        channel,
        ts: timestamp,
        text,
        blocks,
      });

      op.success('Message updated');
      return {
        ok: result.ok,
        ts: result.ts as string,
        channel: result.channel as string,
      };
    } catch (error) {
      op.failure(error as Error);
      throw error;
    }
  }

  /**
   * Delete a message
   */
  async deleteMessage(channel: string, timestamp: string): Promise<void> {
    const op = logger.startOperation('deleteMessage');

    try {
      const client = this.requireClient();
      await client.chat.delete({
        channel,
        ts: timestamp,
      });
      op.success('Message deleted');
    } catch (error) {
      op.failure(error as Error);
      throw error;
    }
  }

  /**
   * Get user info
   */
  async getUserInfo(userId: string): Promise<SlackUserInfo | null> {
    const op = logger.startOperation('getUserInfo');

    try {
      const client = this.requireClient();
      const result = await client.users.info({ user: userId });

      if (!result.ok || !result.user) {
        return null;
      }

      const user = result.user;
      op.success('User info retrieved');

      return {
        id: user.id!,
        name: user.name || user.real_name || 'Unknown',
        displayName: user.profile?.display_name || user.name || 'Unknown',
        email: user.profile?.email,
        avatarUrl: user.profile?.image_72,
        isBot: user.is_bot || false,
      };
    } catch (error) {
      op.failure(error as Error);
      throw error;
    }
  }

  /**
   * Look up user by email
   */
  async lookupUserByEmail(email: string): Promise<SlackUserInfo | null> {
    const op = logger.startOperation('lookupUserByEmail');

    try {
      const client = this.requireClient();
      const result = await client.users.lookupByEmail({ email });

      if (!result.ok || !result.user) {
        return null;
      }

      const user = result.user;
      op.success('User found by email');

      return {
        id: user.id!,
        name: user.name || user.real_name || 'Unknown',
        displayName: user.profile?.display_name || user.name || 'Unknown',
        email: user.profile?.email,
        avatarUrl: user.profile?.image_72,
        isBot: user.is_bot || false,
      };
    } catch (error) {
      // User not found is expected sometimes
      logger.debug('User lookup by email failed', { email, error: String(error) });
      return null;
    }
  }
}
