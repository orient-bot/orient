/**
 * Database Type Definitions
 *
 * TypeScript types inferred from the Drizzle schema.
 */

import type { InferSelectModel, InferInsertModel } from 'drizzle-orm';
import type {
  messages,
  groups,
  chatPermissions,
  permissionAuditLog,
  dashboardUsers,
  systemPrompts,
  slackMessages,
  slackChannels,
  slackChannelPermissions,
  slackPermissionAuditLog,
  scheduledMessages,
  webhookForwards,
  permissionPolicies,
  approvalRequests,
  approvalGrants,
} from './schema/index.js';

// ============================================
// WHATSAPP TYPES
// ============================================

/** Message record from database */
export type Message = InferSelectModel<typeof messages>;
/** Message insert type */
export type NewMessage = InferInsertModel<typeof messages>;
/** Message direction */
export type MessageDirection = 'incoming' | 'outgoing';
/** Media type */
export type MediaType = 'image' | 'audio' | 'video' | 'document';

/** Group record from database */
export type Group = InferSelectModel<typeof groups>;
/** Group insert type */
export type NewGroup = InferInsertModel<typeof groups>;

/** Chat permission record from database */
export type ChatPermissionRecord = InferSelectModel<typeof chatPermissions>;
/** Chat permission insert type */
export type NewChatPermission = InferInsertModel<typeof chatPermissions>;
/** Chat type */
export type ChatType = 'individual' | 'group';
/** Permission level */
export type ChatPermission = 'ignored' | 'read_only' | 'read_write';

/** Permission audit log entry */
export type PermissionAuditEntry = InferSelectModel<typeof permissionAuditLog>;
/** Permission audit log insert type */
export type NewPermissionAuditEntry = InferInsertModel<typeof permissionAuditLog>;

/** Dashboard user record */
export type DashboardUser = InferSelectModel<typeof dashboardUsers>;
/** Dashboard user insert type */
export type NewDashboardUser = InferInsertModel<typeof dashboardUsers>;

/** System prompt record */
export type SystemPrompt = InferSelectModel<typeof systemPrompts>;
/** System prompt insert type */
export type NewSystemPrompt = InferInsertModel<typeof systemPrompts>;
/** Prompt platform */
export type PromptPlatform = 'whatsapp' | 'slack';

// ============================================
// PERMISSIONS TYPES
// ============================================

export type PermissionPolicyRecord = InferSelectModel<typeof permissionPolicies>;
export type NewPermissionPolicy = InferInsertModel<typeof permissionPolicies>;

export type ApprovalRequestRecord = InferSelectModel<typeof approvalRequests>;
export type NewApprovalRequest = InferInsertModel<typeof approvalRequests>;

export type ApprovalGrantRecord = InferSelectModel<typeof approvalGrants>;
export type NewApprovalGrant = InferInsertModel<typeof approvalGrants>;

// ============================================
// SLACK TYPES
// ============================================

/** Slack message record */
export type SlackMessage = InferSelectModel<typeof slackMessages>;
/** Slack message insert type */
export type NewSlackMessage = InferInsertModel<typeof slackMessages>;

/** Slack channel record */
export type SlackChannel = InferSelectModel<typeof slackChannels>;
/** Slack channel insert type */
export type NewSlackChannel = InferInsertModel<typeof slackChannels>;
/** Slack channel type */
export type SlackChannelType =
  | 'channel'
  | 'public'
  | 'dm'
  | 'group_dm'
  | 'private'
  | 'mpim'
  | 'unknown';

/** Slack channel permission record */
export type SlackChannelPermissionRecord = InferSelectModel<typeof slackChannelPermissions>;
/** Slack channel permission insert type */
export type NewSlackChannelPermission = InferInsertModel<typeof slackChannelPermissions>;
/** Slack channel permission level */
export type SlackChannelPermission = 'ignored' | 'read_only' | 'read_write';

/** Slack permission audit log entry */
export type SlackPermissionAuditEntry = InferSelectModel<typeof slackPermissionAuditLog>;
/** Slack permission audit log insert type */
export type NewSlackPermissionAuditEntry = InferInsertModel<typeof slackPermissionAuditLog>;

// ============================================
// SCHEDULER TYPES
// ============================================

/** Scheduled message record */
export type ScheduledMessage = InferSelectModel<typeof scheduledMessages>;
/** Scheduled message insert type */
export type NewScheduledMessage = InferInsertModel<typeof scheduledMessages>;

// ============================================
// WEBHOOK TYPES
// ============================================

/** Webhook forward record */
export type WebhookForward = InferSelectModel<typeof webhookForwards>;
/** Webhook forward insert type */
export type NewWebhookForward = InferInsertModel<typeof webhookForwards>;

// ============================================
// QUERY OPTIONS
// ============================================

/** Options for searching messages */
export interface MessageSearchOptions {
  phone?: string;
  groupId?: string;
  isGroup?: boolean;
  direction?: MessageDirection;
  fromDate?: Date;
  toDate?: Date;
  text?: string;
  mediaType?: MediaType;
  limit?: number;
  offset?: number;
}

/** Options for searching Slack messages */
export interface SlackMessageSearchOptions {
  channelId?: string;
  userId?: string;
  direction?: MessageDirection;
  threadTs?: string;
  fromDate?: Date;
  toDate?: Date;
  text?: string;
  limit?: number;
  offset?: number;
}

/** Options for storing a message */
export interface StoreMessageOptions {
  messageId?: string;
  direction: MessageDirection;
  jid: string;
  phone: string;
  text: string;
  isGroup: boolean;
  groupId?: string;
  timestamp: Date;
  mediaType?: MediaType;
  mediaPath?: string;
  mediaMimeType?: string;
  transcribedText?: string;
  transcribedLanguage?: string;
}

/** Options for storing a Slack message */
export interface StoreSlackMessageOptions {
  messageId?: string;
  channelId: string;
  threadTs?: string;
  userId: string;
  userName?: string;
  text: string;
  direction: MessageDirection;
  timestamp: Date;
  hasFiles?: boolean;
  fileTypes?: string[];
}

// ============================================
// STATISTICS
// ============================================

/** Message statistics */
export interface MessageStats {
  totalMessages: number;
  incomingMessages: number;
  outgoingMessages: number;
  uniqueContacts: number;
  uniqueGroups: number;
  dateRange?: {
    earliest: Date | null;
    latest: Date | null;
  };
  firstMessage?: string | null;
  lastMessage?: string | null;
}

/** Slack message statistics */
export interface SlackMessageStats {
  totalMessages: number;
  incomingMessages: number;
  outgoingMessages: number;
  uniqueChannels: number;
  uniqueUsers: number;
  dateRange?: {
    earliest: Date | null;
    latest: Date | null;
  };
  firstMessage?: string | null;
  lastMessage?: string | null;
}

/** Dashboard statistics */
export interface DashboardStats {
  totalChats: number;
  byPermission: {
    ignored: number;
    read_only: number;
    read_write: number;
  };
  byType: {
    individual: number;
    group: number;
  };
  totalMessages: number;
  chatsWithoutPermissions: number;
}

/** Slack dashboard statistics */
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

/** Media statistics */
export interface MediaStats {
  totalMedia: number;
  byType: {
    image: number;
    audio: number;
    video: number;
    document: number;
  };
  imageCount?: number;
  audioCount?: number;
  videoCount?: number;
  documentCount?: number;
}
