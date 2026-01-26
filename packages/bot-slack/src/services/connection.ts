/**
 * Slack Connection Service
 *
 * Manages Slack Bolt app initialization and Socket Mode connection.
 */

import pkg from '@slack/bolt';
import type { App as AppType, SlackEventMiddlewareArgs, AllMiddlewareArgs } from '@slack/bolt';
const { App, LogLevel } = pkg;
import { EventEmitter } from 'events';
import { createServiceLogger } from '@orientbot/core';
import type { SlackBotConfig } from '../types.js';

const logger = createServiceLogger('slack-connection');

// Use a generic type for the web client due to version mismatches between @slack/bolt and @slack/web-api
type SlackWebClient = {
  auth: { test: () => Promise<{ user_id?: string; user?: string }> };
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

export interface ConnectionEvents {
  connected: () => void;
  disconnected: (reason: string) => void;
  error: (error: Error) => void;
  ready: () => void;
}

/**
 * Slack Connection Manager
 *
 * Handles Bolt app lifecycle:
 * - App initialization
 * - Socket mode connection
 * - Web API client access
 */
export class SlackConnection extends EventEmitter {
  private app: AppType | null = null;
  private client: SlackWebClient | null = null;
  private config: SlackBotConfig;
  private isConnectedFlag = false;
  private botUserId: string | null = null;
  private botName: string | null = null;

  constructor(config: SlackBotConfig) {
    super();
    this.config = config;
  }

  /**
   * Initialize and start the Slack app
   */
  async connect(): Promise<void> {
    const op = logger.startOperation('connect');

    try {
      // Initialize Bolt app with Socket Mode
      this.app = new App({
        token: this.config.botToken,
        signingSecret: this.config.signingSecret,
        appToken: this.config.appToken,
        socketMode: true,
        logLevel: LogLevel.INFO,
      });

      // Get web client
      this.client = this.app.client as unknown as SlackWebClient;

      // Start the app
      await this.app.start();

      // Get bot info
      const authResult = await this.client!.auth.test();
      this.botUserId = authResult.user_id as string;
      this.botName = authResult.user as string;

      this.isConnectedFlag = true;
      logger.info('Slack connected', {
        botUserId: this.botUserId,
        botName: this.botName,
      });

      op.success('Connected successfully');
      this.emit('connected');
      this.emit('ready');
    } catch (error) {
      op.failure(error as Error);
      this.emit('error', error as Error);
      throw error;
    }
  }

  /**
   * Check if connected
   */
  getIsConnected(): boolean {
    return this.isConnectedFlag;
  }

  /**
   * Get the Bolt app (for setting up event handlers)
   */
  getApp(): AppType | null {
    return this.app;
  }

  /**
   * Get the web client (for sending messages)
   */
  getClient(): SlackWebClient | null {
    return this.client;
  }

  /**
   * Stop the Slack app
   */
  async disconnect(): Promise<void> {
    if (this.app) {
      await this.app.stop();
      this.app = null;
      this.client = null;
    }

    this.isConnectedFlag = false;
    logger.info('Slack app disconnected');
    this.emit('disconnected', 'manual');
  }

  /**
   * Get bot user info
   */
  async getBotInfo(): Promise<{ id: string; name: string } | null> {
    if (!this.botUserId || !this.botName) {
      return null;
    }
    return {
      id: this.botUserId,
      name: this.botName,
    };
  }

  /**
   * Get bot user ID
   */
  getBotUserId(): string | null {
    return this.botUserId;
  }

  /**
   * Register an app_mention event handler
   */
  onMention(handler: (event: any) => Promise<void>): void {
    if (!this.app) {
      throw new Error('Slack app not initialized. Call connect() first.');
    }
    this.app.event(
      'app_mention',
      async (args: SlackEventMiddlewareArgs<'app_mention'> & AllMiddlewareArgs) => {
        await handler({ ...args.event, say: args.say });
      }
    );
  }

  /**
   * Register a message event handler (for DMs)
   */
  onMessage(handler: (event: any) => Promise<void>): void {
    if (!this.app) {
      throw new Error('Slack app not initialized. Call connect() first.');
    }
    this.app.message(async (args: SlackEventMiddlewareArgs<'message'> & AllMiddlewareArgs) => {
      await handler({ ...args.message, say: args.say });
    });
  }
}
