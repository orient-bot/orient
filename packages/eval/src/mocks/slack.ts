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
    // slack_send_channel_message - Send message to channel
    this.defaultResponses.set('slack_send_channel_message', () => ({
      response: {
        success: true,
        ts: `${Date.now()}.000000`,
        channel: 'C12345678',
      },
    }));

    // slack_send_dm - Send direct message
    this.defaultResponses.set('slack_send_dm', () => ({
      response: {
        success: true,
        ts: `${Date.now()}.000000`,
        channel: 'D12345678',
      },
    }));

    // slack_lookup_user - Find user by email
    this.defaultResponses.set('slack_lookup_user', () => ({
      response: createMockSlackUser(),
    }));

    // slack_get_channel_messages - Get messages from channel
    this.defaultResponses.set('slack_get_channel_messages', () => ({
      response: {
        messages: [
          { ts: '1234567890.000001', text: 'Hello world', user: 'U12345678' },
          { ts: '1234567890.000002', text: 'Test message', user: 'U12345679' },
        ],
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
