/**
 * Slack Bot Types
 *
 * Type definitions for the Slack bot package.
 * These types match the interfaces used in the main slackBotService.ts
 */

// Re-export core types from @orient/core
export type { StandupSummary, DailyDigest, SLABreach } from '@orient/core';

// ============================================================================
// Configuration Types
// ============================================================================

/**
 * Slack bot configuration
 */
export interface SlackBotConfig {
  /** Bot user OAuth token */
  botToken: string;
  /** Signing secret for verifying requests */
  signingSecret: string;
  /** App-level token for Socket Mode */
  appToken: string;
  /** Optional user token for user-context operations */
  userToken?: string;
  /** Default channel for notifications */
  defaultChannel?: string;
}

/**
 * OpenCode configuration for Slack
 */
export interface OpenCodeSlackConfig {
  serverUrl: string;
  model?: string;
  defaultModel?: string;
  sessionPrefix?: string;
  systemPrompt?: string;
  timeout?: number;
  defaultAgent?: string;
}

/**
 * Full service configuration
 */
export interface SlackBotServiceConfig {
  slack: SlackBotConfig;
  opencode: OpenCodeSlackConfig;
  defaultPermission?: SlackChannelPermission;
}

// ============================================================================
// Channel Types
// ============================================================================

/**
 * Slack channel types
 */
export type SlackChannelType =
  | 'channel'
  | 'public'
  | 'private'
  | 'dm'
  | 'mpim'
  | 'group_dm'
  | 'unknown';

/**
 * Channel permission levels
 */
export type SlackChannelPermission = 'ignored' | 'read_only' | 'read_write';

/**
 * Channel information
 */
export interface SlackChannelInfo {
  id: string;
  name: string;
  type: SlackChannelType;
  permission: SlackChannelPermission;
  isArchived?: boolean;
  memberCount?: number;
}

// ============================================================================
// User Types
// ============================================================================

/**
 * Slack user information
 */
export interface SlackUserInfo {
  id: string;
  name: string;
  realName?: string;
  displayName?: string;
  email?: string;
  avatarUrl?: string;
  isBot?: boolean;
  isAdmin?: boolean;
  teamId?: string;
  timezone?: string;
}

// ============================================================================
// Message Context Types
// ============================================================================

/**
 * Base message context
 */
export interface SlackMessageContextBase {
  /** Channel ID */
  channelId: string;
  /** Channel name (if available) */
  channelName?: string;
  /** Channel type */
  channelType: SlackChannelType;
  /** User ID of sender */
  userId: string;
  /** User name */
  userName?: string;
  /** Message text */
  text: string;
  /** Message timestamp (Slack's unique ID) */
  ts: string;
  /** Thread timestamp (if in a thread) */
  threadTs?: string;
  /** Team ID */
  teamId?: string;
}

/**
 * Context for @mention messages
 */
export interface SlackMentionContext extends SlackMessageContextBase {
  type: 'mention';
  /** The app mention event */
  event: {
    type: 'app_mention';
    user: string;
    text: string;
    ts: string;
    channel: string;
    thread_ts?: string;
  };
}

/**
 * Context for DM messages
 */
export interface SlackDMContext extends SlackMessageContextBase {
  type: 'dm';
  /** The message event */
  event: {
    type: 'message';
    user: string;
    text: string;
    ts: string;
    channel: string;
    thread_ts?: string;
  };
}

/**
 * Context for channel messages
 */
export interface SlackChannelMessageContext extends SlackMessageContextBase {
  type: 'channel';
  event: {
    type: 'message';
    user: string;
    text: string;
    ts: string;
    channel: string;
    thread_ts?: string;
  };
}

/**
 * Union type for all message contexts
 */
export type SlackMessageContext = SlackMentionContext | SlackDMContext | SlackChannelMessageContext;

/**
 * Simplified internal context for OpenCode handler
 * Used when building context without full event details
 */
export interface SlackInternalContext {
  channelId: string;
  channelName?: string;
  channelType: SlackChannelType;
  userId: string;
  userName?: string;
  threadTs?: string;
}

// ============================================================================
// Handler Result Types
// ============================================================================

/**
 * Processed response from OpenCode handler
 */
export interface SlackProcessedResponse {
  text: string;
  sessionId: string;
  cost: number;
  tokens: {
    input: number;
    output: number;
  };
  model: string;
  provider: string;
  toolsUsed: string[];
}

/**
 * Result from message handler
 */
export interface MessageHandlerResult {
  success: boolean;
  messageTs?: string;
  threadTs?: string;
  error?: string;
}

/**
 * Result from posting a message
 */
export interface PostMessageResult {
  ok?: boolean;
  ts: string;
  channel: string;
}

// ============================================================================
// Event Types
// ============================================================================

/**
 * Slack bot service events
 */
export interface SlackBotServiceEvents {
  ready: () => void;
  message: (context: SlackMessageContext) => void;
  mention: (context: SlackMentionContext) => void;
  dm: (context: SlackDMContext) => void;
  error: (error: Error) => void;
  disconnected: (reason: string) => void;
}
