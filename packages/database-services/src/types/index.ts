/**
 * Database Services Types
 *
 * Type definitions used by the database service implementations.
 */

// ============================================
// CHAT PERMISSIONS TYPES
// ============================================

/**
 * Permission levels for WhatsApp chats/groups
 * - ignored: Messages dropped, not stored
 * - read_only: Messages stored, bot does not respond
 * - read_write: Messages stored AND bot can respond
 */
export type ChatPermission = 'ignored' | 'read_only' | 'read_write';

/**
 * Type of WhatsApp chat
 */
export type ChatType = 'individual' | 'group';

/**
 * Chat permission record stored in the database
 */
export interface ChatPermissionRecord {
  chatId: string; // JID (phone@s.whatsapp.net or group@g.us)
  chatType: ChatType; // 'individual' or 'group'
  permission: ChatPermission; // Permission level
  displayName?: string; // Human-readable name
  notes?: string; // Admin notes
  createdAt?: Date;
  updatedAt?: Date;
}

/**
 * Audit log entry for permission changes
 */
export interface PermissionAuditEntry {
  id: number;
  chatId: string;
  oldPermission: string | null;
  newPermission: string;
  changedBy: string | null;
  changedAt: Date | null;
}

/**
 * Dashboard user for authentication
 */
export interface DashboardUser {
  id: number;
  username: string;
  passwordHash: string | null;
  googleId?: string | null;
  googleEmail?: string | null;
  authMethod?: 'password' | 'google' | 'both';
  createdAt: Date | null;
}

/**
 * Chat with permission info for dashboard display
 */
export interface ChatWithPermission extends ChatPermissionRecord {
  messageCount: number;
  lastMessageAt: Date | null;
}

/**
 * Dashboard statistics
 */
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

// ============================================
// SYSTEM PROMPTS TYPES
// ============================================

/**
 * Platform for system prompts
 */
export type PromptPlatform = 'whatsapp' | 'slack';

/**
 * System prompt record stored in the database
 * chat_id = '*' means platform default
 */
export interface SystemPromptRecord {
  id: number;
  chatId: string; // JID/channel ID or '*' for default
  platform: PromptPlatform;
  promptText: string;
  isActive: boolean;
  createdAt?: Date;
  updatedAt?: Date;
}

/**
 * System prompt with display info for dashboard
 */
export interface SystemPromptWithInfo extends SystemPromptRecord {
  displayName: string | null; // Human-readable name of chat/channel
  isDefault: boolean; // True if this is the platform default (chatId = '*')
}

// ============================================
// SLACK DATABASE TYPES
// ============================================

/**
 * Slack channel record
 */
export interface SlackChannelRecord {
  id: string;
  name: string;
  isPrivate: boolean;
  createdAt: string;
  updatedAt: string;
}

// ============================================
// SCHEDULER DATABASE TYPES
// ============================================

/**
 * Scheduled message record
 */
export interface ScheduledMessage {
  id: number;
  platform: 'whatsapp' | 'slack';
  recipientId: string; // JID or channel ID
  message: string;
  scheduledAt: string; // ISO timestamp
  cronExpression?: string; // For recurring messages
  isRecurring: boolean;
  lastRunAt?: string;
  nextRunAt?: string;
  status: 'pending' | 'sent' | 'failed' | 'cancelled';
  createdAt: string;
  updatedAt: string;
}

// ============================================
// WEBHOOK DATABASE TYPES
// ============================================

/**
 * Webhook configuration record
 */
export interface WebhookConfig {
  id: number;
  name: string;
  url: string;
  secret?: string;
  events: string[]; // Event types to trigger
  isActive: boolean;
  lastTriggeredAt?: string;
  createdAt: string;
  updatedAt: string;
}

// ============================================
// RE-EXPORTS FROM SPECIALIZED TYPE FILES
// ============================================

// Slack types
export * from './slack.js';

// Scheduler types
export * from './scheduler.js';

// Webhook types
export * from './webhook.js';
