/**
 * Slack Mock Service
 *
 * Provides mock responses for Slack-related tools during eval execution.
 */

import { BaseMockService } from './registry.js';
import { MockResponse } from '../types.js';

/**
 * Mock Slack user
 */
export interface MockSlackUser {
  id: string;
  displayName: string;
  email?: string;
  realName?: string;
  isBot?: boolean;
}

/**
 * Mock Slack channel
 */
export interface MockSlackChannel {
  id: string;
  name: string;
  isPrivate?: boolean;
  memberCount?: number;
}

/**
 * Mock Slack message
 */
export interface MockSlackMessage {
  ts: string;
  text: string;
  user?: string;
  channel?: string;
}

/**
 * Create a mock Slack user
 */
export function createMockSlackUser(overrides: Partial<MockSlackUser> = {}): MockSlackUser {
  return {
    id: 'U12345678',
    displayName: 'John Doe',
    email: 'john@example.com',
    realName: 'John Doe',
    isBot: false,
    ...overrides,
  };
}

/**
 * Create a mock Slack channel
 */
export function createMockSlackChannel(
  overrides: Partial<MockSlackChannel> = {}
): MockSlackChannel {
  return {
    id: 'C12345678',
    name: 'general',
    isPrivate: false,
    memberCount: 50,
    ...overrides,
  };
}

/**
 * Slack mock service implementation
 */
export class SlackMockService extends BaseMockService {
  name = 'slack';

  constructor() {
    super();
    this.setupDefaults();
  }

  private setupDefaults(): void {
    // ai_first_slack_send_message - Send message to channel
    this.defaultResponses.set('ai_first_slack_send_message', () => ({
      response: {
        success: true,
        ts: `${Date.now()}.000000`,
        channel: 'C12345678',
      },
    }));

    // ai_first_slack_send_dm - Send direct message
    this.defaultResponses.set('ai_first_slack_send_dm', () => ({
      response: {
        success: true,
        ts: `${Date.now()}.000000`,
        channel: 'D12345678',
      },
    }));

    // ai_first_slack_lookup_user_by_email - Find user by email
    this.defaultResponses.set('ai_first_slack_lookup_user_by_email', () => ({
      response: createMockSlackUser(),
    }));

    // ai_first_slack_list_channels - List channels
    this.defaultResponses.set('ai_first_slack_list_channels', () => ({
      response: {
        channels: [
          createMockSlackChannel({ id: 'C11111111', name: 'general' }),
          createMockSlackChannel({ id: 'C22222222', name: 'engineering' }),
          createMockSlackChannel({ id: 'C33333333', name: 'random' }),
        ],
      },
    }));

    // ai_first_slack_get_channel_info - Get channel details
    this.defaultResponses.set('ai_first_slack_get_channel_info', () => ({
      response: createMockSlackChannel(),
    }));

    // ai_first_slack_post_thread_reply - Reply in thread
    this.defaultResponses.set('ai_first_slack_post_thread_reply', () => ({
      response: {
        success: true,
        ts: `${Date.now()}.000000`,
        thread_ts: '1234567890.000000',
      },
    }));

    // ai_first_slack_react - Add reaction
    this.defaultResponses.set('ai_first_slack_react', () => ({
      response: {
        success: true,
      },
    }));
  }

  /**
   * Create a send message response
   */
  static createSendMessageResponse(options: { ts?: string; channel?: string } = {}): MockResponse {
    return {
      response: {
        success: true,
        ts: options.ts || `${Date.now()}.000000`,
        channel: options.channel || 'C12345678',
      },
    };
  }

  /**
   * Create a user lookup response
   */
  static createUserLookupResponse(user: Partial<MockSlackUser>): MockResponse {
    return {
      response: createMockSlackUser(user),
    };
  }

  /**
   * Create an error response
   */
  static createErrorResponse(error: string): MockResponse {
    return {
      response: null,
      error,
    };
  }
}
