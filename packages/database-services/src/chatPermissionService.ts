/**
 * Chat Permission Service
 *
 * Centralized service for checking and managing WhatsApp chat permissions.
 * Used by the WhatsApp service to determine how to handle messages.
 *
 * PERMISSION MODEL (Strict Write Enforcement):
 *
 * 1. READ PERMISSIONS (message storage):
 *    - Default: All chats have read access (messages are stored)
 *    - Can be changed to 'ignored' to not store messages
 *
 * 2. WRITE PERMISSIONS (bot sends messages):
 *    - STRICT: Bot can ONLY write to chats with EXPLICIT 'read_write' permission
 *    - NO smart defaults for writes - must be explicitly configured via dashboard
 *    - This ensures the bot NEVER sends messages to unauthorized chats
 *
 * Two-step permission check:
 * - checkPermission(): For incoming messages - determines storage and response intent
 * - checkWritePermission(): For outgoing messages - strict database check only
 */

import { createServiceLogger } from '@orientbot/core';
import type { ChatPermission, ChatType, ChatPermissionRecord } from './types/index.js';

const logger = createServiceLogger('chat-permission');

/**
 * Result of a permission check
 */
export interface PermissionCheckResult {
  permission: ChatPermission;
  shouldStore: boolean; // Should the message be stored in the database?
  shouldRespond: boolean; // Should the bot respond to this message?
  source: 'database' | 'default' | 'smart-default'; // Where the permission came from
}

/**
 * Result of a write permission check (for outgoing messages)
 *
 * IMPORTANT: Write permissions are STRICT - only explicit 'read_write'
 * permission in the database allows writing. NO smart defaults.
 */
export interface WritePermissionCheckResult {
  allowed: boolean;
  permission: ChatPermission;
  reason?: string;
}

/**
 * Chat Permission Service configuration
 */
export interface ChatPermissionServiceConfig {
  defaultPermission: ChatPermission; // Fallback for chats without explicit or smart-default permissions
  adminPhone: string; // Admin phone number (always allowed to trigger responses)
}

/**
 * Interface for the database operations needed by ChatPermissionService
 */
export interface ChatPermissionDatabaseInterface {
  getChatPermission(chatId: string): Promise<ChatPermissionRecord | undefined>;
  setChatPermission(
    chatId: string,
    chatType: ChatType,
    permission: ChatPermission,
    displayName?: string,
    notes?: string,
    changedBy?: string
  ): Promise<void>;
  getAllChatPermissions(): Promise<ChatPermissionRecord[]>;
  migrateFromAllowedGroupIds(
    allowedGroupIds: string[],
    defaultPermission: ChatPermission
  ): Promise<number>;
  getGroup(
    chatId: string
  ): Promise<{ groupName: string | null; participantCount: number | null } | undefined>;
}

/**
 * Chat Permission Service
 *
 * Checks chat permissions from the database with caching for performance.
 */
export class ChatPermissionService {
  private db: ChatPermissionDatabaseInterface;
  private config: ChatPermissionServiceConfig;
  private cache: Map<string, { record: ChatPermissionRecord | null; timestamp: number }> =
    new Map();
  private readonly CACHE_TTL_MS = 60 * 1000; // 1 minute cache

  constructor(db: ChatPermissionDatabaseInterface, config: ChatPermissionServiceConfig) {
    this.db = db;
    this.config = config;
    logger.info('Chat permission service initialized', {
      defaultPermission: config.defaultPermission,
    });
  }

  /**
   * Check permission for a chat
   * @param chatId - The chat JID
   * @param isGroup - Whether this is a group chat
   * @param senderPhone - The phone number of the sender
   * @returns Permission check result
   */
  async checkPermission(
    chatId: string,
    isGroup: boolean,
    senderPhone: string
  ): Promise<PermissionCheckResult> {
    // Get explicit permission from cache or database
    const record = await this.getPermissionRecord(chatId);

    let permission: ChatPermission;
    let source: 'database' | 'default' | 'smart-default';

    if (record) {
      // Explicit permission in database - use it
      permission = record.permission;
      source = 'database';
    } else {
      // No explicit permission - compute smart default
      const smartDefault = await this.computeSmartDefault(chatId, isGroup);
      permission = smartDefault.permission;
      source = smartDefault.isSmartDefault ? 'smart-default' : 'default';
    }

    // Determine actions based on permission
    const shouldStore = permission !== 'ignored';

    // Response logic:
    // - If explicit 'read_write' in database: respond to ALL messages (user explicitly allowed)
    // - If smart-default 'read_write': only respond to admin's own messages
    const isFromAdmin = this.isAdminPhone(senderPhone);

    let shouldRespond: boolean;
    if (permission === 'read_write') {
      if (source === 'database') {
        // Explicit permission: respond to ALL messages in this chat
        shouldRespond = true;
      } else {
        // Smart default: only respond to admin's own messages
        shouldRespond = isFromAdmin;
      }
    } else {
      shouldRespond = false;
    }

    logger.debug('Permission check', {
      chatId: chatId.substring(0, 20) + '...',
      isGroup,
      senderPhone,
      permission,
      source,
      shouldStore,
      shouldRespond,
      isFromAdmin,
    });

    return {
      permission,
      shouldStore,
      shouldRespond,
      source,
    };
  }

  /**
   * Check if writing to a chat is allowed.
   *
   * CRITICAL: This is STRICT - only explicit 'read_write' permission in the
   * database allows writing. NO smart defaults apply here.
   *
   * @param chatId - The chat JID to check
   * @returns WritePermissionCheckResult with allowed=true only if explicitly permitted
   */
  async checkWritePermission(chatId: string): Promise<WritePermissionCheckResult> {
    // Get explicit permission from database (NOT using smart defaults)
    const record = await this.getPermissionRecord(chatId);

    if (!record) {
      logger.debug('Write permission DENIED - no explicit permission', {
        chatId: chatId.substring(0, 30) + '...',
      });
      return {
        allowed: false,
        permission: 'read_only',
        reason:
          'No explicit permission configured. Use the admin dashboard to enable write access.',
      };
    }

    if (record.permission !== 'read_write') {
      logger.debug('Write permission DENIED - permission is not read_write', {
        chatId: chatId.substring(0, 30) + '...',
        permission: record.permission,
      });
      return {
        allowed: false,
        permission: record.permission,
        reason: `Permission is '${record.permission}', must be 'read_write' to allow bot messages.`,
      };
    }

    logger.debug('Write permission ALLOWED', {
      chatId: chatId.substring(0, 30) + '...',
      permission: record.permission,
    });
    return {
      allowed: true,
      permission: 'read_write',
    };
  }

  /**
   * Compute the smart default permission for a chat without explicit permissions.
   */
  private async computeSmartDefault(
    chatId: string,
    isGroup: boolean
  ): Promise<{ permission: ChatPermission; isSmartDefault: boolean }> {
    // Check if this is the "Me" chat (admin's own JID)
    const adminJid = `${this.config.adminPhone.replace(/\D/g, '')}@s.whatsapp.net`;
    if (!isGroup && chatId === adminJid) {
      logger.debug('Smart default: Me chat detected - allowing write', { chatId });
      return { permission: 'read_write', isSmartDefault: true };
    }

    // For non-group DMs with OTHER people (not "Me" chat), ALWAYS read_only
    if (!isGroup) {
      logger.debug('Smart default: Private chat with other person - read only', {
        chatId: chatId.substring(0, 20) + '...',
        adminJid: adminJid.substring(0, 20) + '...',
      });
      return { permission: 'read_only', isSmartDefault: true };
    }

    // Check if this is a solo group (only 1 participant - the admin)
    if (isGroup) {
      const group = await this.db.getGroup(chatId);
      if (group && group.participantCount === 1) {
        logger.debug('Smart default: Solo group detected - allowing write', {
          chatId,
          groupName: group.groupName,
          participantCount: group.participantCount,
        });
        return { permission: 'read_write', isSmartDefault: true };
      }

      if (group) {
        logger.debug('Smart default: Multi-participant group - read only', {
          chatId,
          groupName: group.groupName,
          participantCount: group.participantCount,
        });
        return { permission: 'read_only', isSmartDefault: true };
      }

      logger.debug('Smart default: Unknown group (not in DB yet) - read only for safety', {
        chatId,
      });
      return { permission: 'read_only', isSmartDefault: true };
    }

    logger.warn('Smart default: Unexpected fallback - read only', { chatId, isGroup });
    return { permission: 'read_only', isSmartDefault: true };
  }

  /**
   * Check if a chat qualifies for smart default write access
   */
  async isSmartDefaultWritable(chatId: string, isGroup: boolean): Promise<boolean> {
    const result = await this.computeSmartDefault(chatId, isGroup);
    return result.isSmartDefault && result.permission === 'read_write';
  }

  /**
   * Get permission record from cache or database
   */
  private async getPermissionRecord(chatId: string): Promise<ChatPermissionRecord | null> {
    // Check cache
    const cached = this.cache.get(chatId);
    if (cached && Date.now() - cached.timestamp < this.CACHE_TTL_MS) {
      return cached.record;
    }

    // Query database
    const record = await this.db.getChatPermission(chatId);

    // Update cache
    this.cache.set(chatId, { record: record || null, timestamp: Date.now() });

    return record || null;
  }

  /**
   * Check if a phone number is the admin
   */
  private isAdminPhone(phone: string): boolean {
    const adminPhone = this.config.adminPhone.replace(/\D/g, '');
    return phone === adminPhone;
  }

  /**
   * Set permission for a chat
   */
  async setPermission(
    chatId: string,
    chatType: ChatType,
    permission: ChatPermission,
    displayName?: string,
    notes?: string,
    changedBy?: string
  ): Promise<void> {
    await this.db.setChatPermission(chatId, chatType, permission, displayName, notes, changedBy);

    // Invalidate cache
    this.cache.delete(chatId);

    logger.info('Permission set', { chatId, chatType, permission, changedBy });
  }

  /**
   * Clear the permission cache (call after bulk updates)
   */
  clearCache(): void {
    this.cache.clear();
    logger.debug('Permission cache cleared');
  }

  /**
   * Get all permissions (for dashboard)
   */
  async getAllPermissions(): Promise<ChatPermissionRecord[]> {
    return this.db.getAllChatPermissions();
  }

  /**
   * Migrate from legacy allowedGroupIds config
   */
  async migrateFromLegacyConfig(allowedGroupIds: string[]): Promise<number> {
    const count = await this.db.migrateFromAllowedGroupIds(
      allowedGroupIds,
      this.config.defaultPermission
    );
    this.clearCache();
    return count;
  }
}

/**
 * Create a ChatPermissionService instance
 */
export function createChatPermissionService(
  db: ChatPermissionDatabaseInterface,
  config: ChatPermissionServiceConfig
): ChatPermissionService {
  return new ChatPermissionService(db, config);
}
