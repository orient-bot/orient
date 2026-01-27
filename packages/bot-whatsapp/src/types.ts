/**
 * WhatsApp Bot Types
 *
 * Type definitions for the WhatsApp bot package.
 * Core types are re-exported from @orientbot/core for consistency.
 */

import type { proto } from 'baileys';

// Re-export core types from @orientbot/core
//
// ============================================================================
// BACKWARD COMPATIBILITY: WhatsAppLegacyConfig as WhatsAppConfig
// ============================================================================
//
// We export WhatsAppLegacyConfig as WhatsAppConfig to maintain backward
// compatibility during the migration to the new dual-mode config system.
//
// Migration Timeline:
// - Current (Jan 2026): Both formats supported, legacy aliased for compatibility
// - Target (Q2 2026): Complete migration to new WhatsAppConfig format
// - Future: Remove WhatsAppLegacyConfig alias
//
// New config system supports:
// - Personal mode (Baileys - operates as your phone)
// - Bot mode (Cloud API - separate business number)
// - Per-conversation mode selection
//
// The config loader's normalizeWhatsAppConfig() automatically converts
// legacy format to new format, so internal code can safely use either.
//
// Related files:
// - packages/core/src/config/schema.ts - Defines both config formats
// - packages/core/src/config/loader.ts - Handles conversion
// - docs/migration/LEGACY-CONFIG-REFERENCES.md - Full migration plan
//
export type {
  WhatsAppLegacyConfig as WhatsAppConfig,
  WhatsAppMessage,
  WhatsAppMediaType,
  WhatsAppAudioType,
  WhatsAppConversation,
  WhatsAppPoll,
  PollOption,
  PollContext,
  PollVote,
  PollVoteResult,
  PollActionContext,
  PollActionHandler,
} from '@orientbot/core';

// ============================================================================
// Connection Types (package-specific)
// ============================================================================

/**
 * Connection state for the WhatsApp socket
 */
export type ConnectionState = 'connecting' | 'open' | 'close' | 'qr';

/**
 * WhatsApp bot configuration
 */
export interface WhatsAppBotConfig {
  /** Path to store session credentials */
  sessionPath: string;
  /** Whether to auto-reconnect on disconnect */
  autoReconnect?: boolean;
  /** Maximum reconnect attempts */
  maxReconnectAttempts?: number;
  /** Initial reconnect delay in ms */
  reconnectDelay?: number;
}

// ============================================================================
// Message Types (package-specific)
// ============================================================================

/**
 * Incoming message from WhatsApp (internal format before processing)
 */
export interface IncomingMessage {
  /** Unique message ID */
  id: string;
  /** JID of the chat (user or group) */
  jid: string;
  /** Phone number of the sender */
  phone: string;
  /** Display name of the sender */
  pushName?: string;
  /** Message text content */
  text: string;
  /** Whether this is a group message */
  isGroup: boolean;
  /** Group ID if group message */
  groupId?: string;
  /** Message timestamp */
  timestamp: Date;
  /** Media type if message has media */
  mediaType?: string;
  /** Raw proto message for media download */
  rawMessage?: proto.IWebMessageInfo;
}

/**
 * Parsed message from Baileys
 */
export interface ParsedMessage {
  id: string;
  chatId: string;
  senderJid: string;
  senderPhone: string;
  senderName: string;
  text: string;
  timestamp: Date;
  isGroup: boolean;
  isFromMe: boolean;
  hasMedia: boolean;
  mediaType?: string;
  rawMessage: proto.IWebMessageInfo;
}

/**
 * Result from message handler
 */
export interface MessageHandlerResult {
  success: boolean;
  messageId?: string;
  error?: string;
}

// ============================================================================
// Permission Types (package-specific)
// ============================================================================

/**
 * Permission levels for chats
 */
export type ChatPermission = 'ignored' | 'read_only' | 'read_write';

/**
 * Permission check result for incoming messages
 */
export interface PermissionCheckResult {
  permission: ChatPermission;
  shouldStore: boolean;
  shouldRespond: boolean;
  source: string;
}

/**
 * Permission checker callback type
 */
export type PermissionChecker = (
  chatId: string,
  isGroup: boolean,
  senderPhone: string
) => PermissionCheckResult | Promise<PermissionCheckResult>;

/**
 * Write permission check result
 */
export interface WritePermissionCheckResult {
  allowed: boolean;
  permission: ChatPermission;
  reason?: string;
}

/**
 * Write permission checker callback type
 */
export type WritePermissionChecker = (
  jid: string
) => WritePermissionCheckResult | Promise<WritePermissionCheckResult>;

// ============================================================================
// Event Types (package-specific)
// ============================================================================

import type { WhatsAppMessage, WhatsAppPoll, PollVote } from '@orientbot/core';

/**
 * History sync data
 */
export interface HistorySyncData {
  messages: proto.IWebMessageInfo[];
  isLatest: boolean;
}

/**
 * WhatsApp service events
 */
export interface WhatsAppServiceEvents {
  ready: () => void;
  qr: (qr: string) => void;
  message: (message: WhatsAppMessage) => void;
  message_stored: (message: WhatsAppMessage) => void;
  history_sync: (data: HistorySyncData) => void;
  poll_vote: (vote: PollVote, poll: WhatsAppPoll) => void;
  disconnected: (reason: string) => void;
  error: (error: Error) => void;
}
