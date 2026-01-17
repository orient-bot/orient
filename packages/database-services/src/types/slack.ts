/**
 * Slack Bot Type Definitions
 *
 * Type definitions for the Slack bot service, including messages,
 * channels, permissions, and database records.
 */

// ============================================
// SLACK CHANNEL TYPES
// ============================================

/**
 * Type of Slack channel/conversation
 */
export type SlackChannelType = 'channel' | 'dm' | 'group_dm' | 'private';

/**
 * Permission levels for Slack channels
 * - ignored: Messages dropped, not stored
 * - read_only: Messages stored, bot does not respond
 * - read_write: Messages stored AND bot can respond
 */
export type SlackChannelPermission = 'ignored' | 'read_only' | 'read_write';

/**
 * Slack channel metadata
 */
export interface SlackChannel {
  channelId: string;
  channelName: string | null;
  channelType: SlackChannelType;
  isMember: boolean;
  lastUpdated: Date;
}

/**
 * Slack channel with permission info for dashboard display
 */
export interface SlackChannelWithPermission extends SlackChannel {
  permission: SlackChannelPermission;
  respondToMentions: boolean;
  respondToDMs: boolean;
  notes?: string;
  messageCount?: number;
  lastMessageAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

// ============================================
// SLACK MESSAGE TYPES
// ============================================

/**
 * Slack message stored in the database
 */
export interface SlackMessage {
  id?: number;
  messageId: string;
  channelId: string;
  threadTs?: string;
  userId: string;
  userName?: string;
  text: string;
  direction: 'incoming' | 'outgoing';
  timestamp: Date;
  createdAt?: Date;
  hasFiles?: boolean;
  fileTypes?: string[];
}

/**
 * Slack message context for OpenCode handler
 */
export interface SlackMessageContext {
  channelId: string;
  channelName?: string;
  channelType: SlackChannelType;
  threadTs?: string;
  userId: string;
  userName?: string;
  teamId?: string;
}

/**
 * Options for storing a Slack message
 */
export interface StoreSlackMessageOptions {
  hasFiles?: boolean;
  fileTypes?: string[];
}

// ============================================
// SLACK USER TYPES
// ============================================

/**
 * Slack user info
 */
export interface SlackUser {
  userId: string;
  userName: string;
  displayName?: string;
  realName?: string;
  email?: string;
  isBot: boolean;
  teamId?: string;
}

// ============================================
// SLACK BOT CONFIGURATION TYPES
// ============================================

/**
 * Slack bot configuration (extends config schema)
 */
export interface SlackBotConfig {
  botToken: string;
  signingSecret: string;
  appToken: string;
  standupChannel?: string;
  respondToMentions?: boolean;
  respondToDMs?: boolean;
  allowedChannelIds?: string[];
  defaultPermission?: SlackChannelPermission;
}

/**
 * OpenCode Slack handler configuration
 */
export interface OpenCodeSlackConfig {
  serverUrl: string;
  defaultAgent?: string;
  defaultModel?: string;
  timeout?: number;
  sessionPrefix?: string;
}

// ============================================
// SLACK EVENT TYPES
// ============================================

/**
 * Processed Slack message event
 */
export interface SlackMessageEvent {
  type: 'message' | 'app_mention';
  channelId: string;
  channelType: SlackChannelType;
  threadTs?: string;
  userId: string;
  userName?: string;
  text: string;
  timestamp: string;
  eventTs: string;
  files?: SlackFile[];
}

/**
 * Slack file attachment
 */
export interface SlackFile {
  id: string;
  name: string;
  mimeType: string;
  size: number;
  url?: string;
}

/**
 * Slash command payload
 */
export interface SlackSlashCommand {
  command: string;
  text: string;
  responseUrl: string;
  triggerId: string;
  userId: string;
  userName: string;
  channelId: string;
  channelName?: string;
  teamId: string;
}

// ============================================
// SLACK DATABASE TYPES
// ============================================

/**
 * Stored Slack message record from database
 */
export interface StoredSlackMessage {
  id: number;
  message_id: string;
  channel_id: string;
  thread_ts: string | null;
  user_id: string;
  user_name: string | null;
  text: string;
  direction: 'incoming' | 'outgoing';
  timestamp: string;
  created_at: string;
  has_files: boolean;
  file_types: string[] | null;
}

/**
 * Stored Slack channel record from database
 */
export interface StoredSlackChannel {
  channel_id: string;
  channel_name: string | null;
  channel_type: SlackChannelType;
  is_member: boolean;
  last_updated: string;
}

/**
 * Stored Slack channel permission record from database
 */
export interface StoredSlackChannelPermission {
  channel_id: string;
  permission: SlackChannelPermission;
  respond_to_mentions: boolean;
  respond_to_dms: boolean;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

/**
 * Slack message search options
 */
export interface SlackMessageSearchOptions {
  channelId?: string;
  userId?: string;
  text?: string;
  direction?: 'incoming' | 'outgoing';
  threadTs?: string;
  fromDate?: Date;
  toDate?: Date;
  limit?: number;
  offset?: number;
}

/**
 * Slack message statistics
 */
export interface SlackMessageStats {
  totalMessages: number;
  incomingMessages: number;
  outgoingMessages: number;
  uniqueChannels: number;
  uniqueUsers: number;
  firstMessage: string | null;
  lastMessage: string | null;
}

/**
 * Slack dashboard statistics
 */
export interface SlackDashboardStats {
  totalChannels: number;
  byPermission: {
    ignored: number;
    read_only: number;
    read_write: number;
  };
  byType: {
    channel: number;
    dm: number;
    group_dm: number;
    private: number;
  };
  totalMessages: number;
  channelsWithoutPermissions: number;
}

// ============================================
// SLACK RESPONSE TYPES
// ============================================

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
