/**
 * Message Database Service (Drizzle ORM Implementation)
 *
 * SQLite database for storing and querying WhatsApp messages.
 * This is a type-safe implementation using Drizzle ORM.
 *
 * Exported via @orient/database-services package.
 */

import { createServiceLogger } from '@orient/core';
import {
  getDatabase,
  closeDatabase,
  executeRawSql,
  eq,
  and,
  or,
  desc,
  asc,
  sql,
  count,
  like,
  schema,
} from '@orient/database';
import type {
  Database,
  Message,
  Group,
  ChatPermissionRecord as DbChatPermissionRecord,
  NewChatPermission,
  PermissionAuditEntry as DbPermissionAuditEntry,
  NewPermissionAuditEntry,
  DashboardUser as DbDashboardUser,
  NewDashboardUser,
  SystemPrompt as DbSystemPrompt,
  NewSystemPrompt,
  MessageSearchOptions,
  StoreMessageOptions,
  MessageStats,
  MediaStats,
  DashboardStats,
  ChatType,
  ChatPermission,
  PromptPlatform,
} from '@orient/database';

const logger = createServiceLogger('message-db-drizzle');

// Import shared types
import type {
  ChatPermissionRecord,
  PermissionAuditEntry,
  DashboardUser,
  SystemPromptRecord,
  SystemPromptWithInfo,
  ChatWithPermission,
} from '../types/index.js';

// Re-export types for consumers
export type StoredMessage = Message;
export type StoredGroup = Group;

// Re-export shared types
export type {
  ChatPermissionRecord,
  PermissionAuditEntry,
  DashboardUser,
  SystemPromptRecord,
  SystemPromptWithInfo,
  ChatWithPermission,
};

export {
  MessageSearchOptions,
  StoreMessageOptions,
  MessageStats,
  DashboardStats,
  ChatType,
  ChatPermission,
  PromptPlatform,
};

export class MessageDatabase {
  private initialized: boolean = false;
  private _db: Database | null = null;

  constructor() {
    // SQLite path is configured via SQLITE_DATABASE env var or defaults
    logger.info('Drizzle database client initialized (SQLite)');
  }

  /**
   * Get the database instance (synchronous for SQLite)
   */
  private get db(): Database {
    if (!this._db) {
      this._db = getDatabase();
    }
    return this._db;
  }

  /**
   * Initialize the database (tables are created via migrations)
   */
  async initialize(): Promise<void> {
    if (this.initialized) return;

    // Ensure database connection is established
    this._db = getDatabase();
    this.initialized = true;
    logger.info('Database initialized');
  }

  // ============================================
  // MESSAGE STORAGE
  // ============================================

  async storeIncomingMessage(
    messageId: string,
    jid: string,
    phone: string,
    text: string,
    timestamp: Date,
    isGroup: boolean,
    groupId?: string,
    options?: Partial<StoreMessageOptions>
  ): Promise<number> {
    return this.storeMessage(
      'incoming',
      messageId,
      jid,
      phone,
      text,
      timestamp,
      isGroup,
      groupId,
      options
    );
  }

  async storeOutgoingMessage(
    messageId: string,
    jid: string,
    phone: string,
    text: string,
    isGroup: boolean,
    groupId?: string,
    options?: Partial<StoreMessageOptions>
  ): Promise<number> {
    return this.storeMessage(
      'outgoing',
      messageId,
      jid,
      phone,
      text,
      new Date(),
      isGroup,
      groupId,
      options
    );
  }

  private async storeMessage(
    direction: 'incoming' | 'outgoing',
    messageId: string,
    jid: string,
    phone: string,
    text: string,
    timestamp: Date,
    isGroup: boolean,
    groupId?: string,
    options?: Partial<StoreMessageOptions>
  ): Promise<number> {
    const db = this.db;
    const result = await db
      .insert(schema.messages)
      .values({
        messageId,
        direction,
        jid,
        phone,
        text,
        isGroup,
        groupId: groupId || null,
        timestamp,
        mediaType: options?.mediaType || null,
        mediaPath: options?.mediaPath || null,
        mediaMimeType: options?.mediaMimeType || null,
        transcribedText: options?.transcribedText || null,
        transcribedLanguage: options?.transcribedLanguage || null,
      })
      .onConflictDoNothing({ target: schema.messages.messageId })
      .returning({ id: schema.messages.id });

    if (result.length > 0) {
      logger.debug('Stored message', {
        direction,
        phone,
        messageId,
        isGroup,
        hasMedia: !!options?.mediaType,
      });
      return result[0].id;
    }

    return 0;
  }

  async storeHistoricalMessage(
    messageId: string,
    jid: string,
    phone: string,
    text: string,
    timestamp: Date,
    isGroup: boolean,
    groupId?: string
  ): Promise<number> {
    return this.storeMessage('incoming', messageId, jid, phone, text, timestamp, isGroup, groupId);
  }

  // ============================================
  // MESSAGE QUERIES
  // ============================================

  async searchMessages(options: MessageSearchOptions = {}): Promise<StoredMessage[]> {
    const db = this.db;
    const conditions = [];

    if (options.phone) {
      conditions.push(eq(schema.messages.phone, options.phone));
    }
    if (options.direction) {
      conditions.push(eq(schema.messages.direction, options.direction));
    }
    if (options.isGroup !== undefined) {
      conditions.push(eq(schema.messages.isGroup, options.isGroup));
    }
    if (options.fromDate) {
      conditions.push(sql`${schema.messages.timestamp} >= ${options.fromDate}`);
    }
    if (options.toDate) {
      conditions.push(sql`${schema.messages.timestamp} <= ${options.toDate}`);
    }

    let query = db
      .select()
      .from(schema.messages)
      .orderBy(desc(schema.messages.timestamp))
      .limit(options.limit || 100)
      .offset(options.offset || 0);

    if (conditions.length > 0) {
      query = query.where(and(...conditions)) as typeof query;
    }

    // Handle text search using LIKE (SQLite doesn't have full-text search built-in)
    if (options.text) {
      const db = this.db;
      const pattern = `%${options.text}%`;
      return db
        .select()
        .from(schema.messages)
        .where(like(schema.messages.text, pattern))
        .orderBy(desc(schema.messages.timestamp))
        .limit(options.limit || 100)
        .offset(options.offset || 0);
    }

    return query;
  }

  async fullTextSearch(searchTerm: string, limit: number = 50): Promise<StoredMessage[]> {
    const db = this.db;
    const pattern = `%${searchTerm}%`;
    return db
      .select()
      .from(schema.messages)
      .where(like(schema.messages.text, pattern))
      .orderBy(desc(schema.messages.timestamp))
      .limit(limit);
  }

  async getRecentMessages(limit: number = 50): Promise<StoredMessage[]> {
    const db = this.db;
    return db.select().from(schema.messages).orderBy(desc(schema.messages.timestamp)).limit(limit);
  }

  async getMessagesByPhone(phone: string, limit: number = 100): Promise<StoredMessage[]> {
    const db = this.db;
    return db
      .select()
      .from(schema.messages)
      .where(eq(schema.messages.phone, phone))
      .orderBy(desc(schema.messages.timestamp))
      .limit(limit);
  }

  async getMessagesByGroup(groupId: string, limit: number = 100): Promise<StoredMessage[]> {
    const db = this.db;
    return db
      .select()
      .from(schema.messages)
      .where(eq(schema.messages.groupId, groupId))
      .orderBy(desc(schema.messages.timestamp))
      .limit(limit);
  }

  async getMessagesByDateRange(
    fromDate: Date,
    toDate: Date,
    limit: number = 500
  ): Promise<StoredMessage[]> {
    const db = this.db;
    return db
      .select()
      .from(schema.messages)
      .where(
        and(
          sql`${schema.messages.timestamp} >= ${fromDate}`,
          sql`${schema.messages.timestamp} <= ${toDate}`
        )
      )
      .orderBy(desc(schema.messages.timestamp))
      .limit(limit);
  }

  async getMessageById(messageId: string): Promise<StoredMessage | undefined> {
    const db = this.db;
    const results = await db
      .select()
      .from(schema.messages)
      .where(eq(schema.messages.messageId, messageId))
      .limit(1);
    return results[0];
  }

  async getStats(): Promise<MessageStats> {
    const [
      totalResult,
      incomingResult,
      outgoingResult,
      contactsResult,
      groupsResult,
      firstResult,
      lastResult,
    ] = await Promise.all([
      executeRawSql<{ count: number }>('SELECT COUNT(*) as count FROM messages'),
      executeRawSql<{ count: number }>(
        "SELECT COUNT(*) as count FROM messages WHERE direction = 'incoming'"
      ),
      executeRawSql<{ count: number }>(
        "SELECT COUNT(*) as count FROM messages WHERE direction = 'outgoing'"
      ),
      executeRawSql<{ count: number }>('SELECT COUNT(DISTINCT phone) as count FROM messages'),
      executeRawSql<{ count: number }>(
        'SELECT COUNT(DISTINCT group_id) as count FROM messages WHERE is_group = 1'
      ),
      executeRawSql<{ ts: string | null }>('SELECT MIN(timestamp) as ts FROM messages'),
      executeRawSql<{ ts: string | null }>('SELECT MAX(timestamp) as ts FROM messages'),
    ]);

    // Handle timestamp formatting - might be Date or string depending on driver
    const formatTimestamp = (ts: unknown): string | null => {
      if (!ts) return null;
      if (ts instanceof Date) return ts.toISOString();
      if (typeof ts === 'string') return ts;
      return null;
    };

    return {
      totalMessages: Number(totalResult[0]?.count ?? 0),
      incomingMessages: Number(incomingResult[0]?.count ?? 0),
      outgoingMessages: Number(outgoingResult[0]?.count ?? 0),
      uniqueContacts: Number(contactsResult[0]?.count ?? 0),
      uniqueGroups: Number(groupsResult[0]?.count ?? 0),
      firstMessage: formatTimestamp(firstResult[0]?.ts),
      lastMessage: formatTimestamp(lastResult[0]?.ts),
    };
  }

  async getUniqueContacts(): Promise<string[]> {
    const db = this.db;
    const results = await db
      .selectDistinct({ phone: schema.messages.phone })
      .from(schema.messages)
      .orderBy(schema.messages.phone);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return results.map((r: any) => r.phone);
  }

  async getUniqueGroups(): Promise<string[]> {
    const db = this.db;
    const results = await db
      .selectDistinct({ groupId: schema.messages.groupId })
      .from(schema.messages)
      .where(and(eq(schema.messages.isGroup, true), sql`${schema.messages.groupId} IS NOT NULL`))
      .orderBy(schema.messages.groupId);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return results.filter((r: any) => r.groupId !== null).map((r: any) => r.groupId!);
  }

  // ============================================
  // GROUP METADATA MANAGEMENT
  // ============================================

  async upsertGroup(
    groupId: string,
    name?: string,
    subject?: string,
    participantCount?: number
  ): Promise<void> {
    const db = this.db;
    await db
      .insert(schema.groups)
      .values({
        groupId,
        groupName: name || null,
        groupSubject: subject || null,
        participantCount: participantCount || null,
        lastUpdated: new Date(),
      })
      .onConflictDoUpdate({
        target: schema.groups.groupId,
        set: {
          groupName: name !== undefined ? name : sql`${schema.groups.groupName}`,
          groupSubject: subject !== undefined ? subject : sql`${schema.groups.groupSubject}`,
          participantCount:
            participantCount !== undefined
              ? participantCount
              : sql`${schema.groups.participantCount}`,
          lastUpdated: new Date(),
        },
      });

    logger.debug('Upserted group metadata', { groupId, name, subject });
  }

  async getGroup(groupId: string): Promise<StoredGroup | undefined> {
    const db = this.db;
    const results = await db
      .select()
      .from(schema.groups)
      .where(eq(schema.groups.groupId, groupId))
      .limit(1);
    return results[0];
  }

  async getAllGroups(): Promise<StoredGroup[]> {
    const db = this.db;
    return db.select().from(schema.groups).orderBy(desc(schema.groups.lastUpdated));
  }

  async searchGroups(searchTerm: string): Promise<StoredGroup[]> {
    const db = this.db;
    const pattern = `%${searchTerm}%`;
    // Use LIKE with LOWER() for case-insensitive search in SQLite
    return db
      .select()
      .from(schema.groups)
      .where(
        or(
          sql`LOWER(${schema.groups.groupName}) LIKE LOWER(${pattern})`,
          sql`LOWER(${schema.groups.groupSubject}) LIKE LOWER(${pattern})`
        )
      )
      .orderBy(desc(schema.groups.lastUpdated));
  }

  async findGroupByName(name: string): Promise<StoredGroup | undefined> {
    const groups = await this.searchGroups(name);
    return groups.length > 0 ? groups[0] : undefined;
  }

  async getGroupsWithoutNames(): Promise<string[]> {
    const results = await executeRawSql<{ group_id: string }>(`
      SELECT DISTINCT m.group_id
      FROM messages m
      WHERE m.is_group = 1
        AND m.group_id IS NOT NULL
        AND m.group_id NOT IN (
          SELECT g.group_id FROM groups g WHERE g.group_name IS NOT NULL
        )
    `);
    return results.map((r) => r.group_id);
  }

  async getAllGroupsWithNames(): Promise<StoredGroup[]> {
    const db = this.db;
    return db
      .select()
      .from(schema.groups)
      .where(
        and(sql`${schema.groups.groupName} IS NOT NULL`, sql`${schema.groups.groupName} != ''`)
      )
      .orderBy(desc(schema.groups.lastUpdated));
  }

  // ============================================
  // MEDIA MESSAGE QUERIES
  // ============================================

  async getMediaMessages(limit: number = 50, mediaType?: string): Promise<StoredMessage[]> {
    const db = this.db;
    if (mediaType) {
      return db
        .select()
        .from(schema.messages)
        .where(eq(schema.messages.mediaType, mediaType))
        .orderBy(desc(schema.messages.timestamp))
        .limit(limit);
    }

    return db
      .select()
      .from(schema.messages)
      .where(sql`${schema.messages.mediaType} IS NOT NULL`)
      .orderBy(desc(schema.messages.timestamp))
      .limit(limit);
  }

  async getMediaMessagesByGroup(
    groupId: string,
    limit: number = 50,
    mediaType?: string
  ): Promise<StoredMessage[]> {
    const db = this.db;
    const conditions = [eq(schema.messages.groupId, groupId)];

    if (mediaType) {
      conditions.push(eq(schema.messages.mediaType, mediaType));
    } else {
      conditions.push(sql`${schema.messages.mediaType} IS NOT NULL`);
    }

    return db
      .select()
      .from(schema.messages)
      .where(and(...conditions))
      .orderBy(desc(schema.messages.timestamp))
      .limit(limit);
  }

  async getImageMessages(limit: number = 50): Promise<StoredMessage[]> {
    return this.getMediaMessages(limit, 'image');
  }

  async getVoiceMessages(limit: number = 50): Promise<StoredMessage[]> {
    return this.getMediaMessages(limit, 'audio');
  }

  async getMediaStats(): Promise<MediaStats> {
    const results = await executeRawSql<{ media_type: string; count: number }>(`
      SELECT media_type, COUNT(*) as count
      FROM messages
      WHERE media_type IS NOT NULL
      GROUP BY media_type
    `);

    const imageCount = Number(results.find((r) => r.media_type === 'image')?.count ?? 0);
    const audioCount = Number(results.find((r) => r.media_type === 'audio')?.count ?? 0);
    const videoCount = Number(results.find((r) => r.media_type === 'video')?.count ?? 0);
    const documentCount = Number(results.find((r) => r.media_type === 'document')?.count ?? 0);
    return {
      totalMedia: imageCount + audioCount + videoCount + documentCount,
      byType: {
        image: imageCount,
        audio: audioCount,
        video: videoCount,
        document: documentCount,
      },
      imageCount,
      audioCount,
      videoCount,
      documentCount,
    };
  }

  async getConversationHistory(phone: string, limit: number = 100): Promise<StoredMessage[]> {
    const db = this.db;
    return db
      .select()
      .from(schema.messages)
      .where(eq(schema.messages.phone, phone))
      .orderBy(asc(schema.messages.timestamp))
      .limit(limit);
  }

  async deleteOldMessages(daysToKeep: number): Promise<number> {
    const db = this.db;
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - daysToKeep);

    const result = await db
      .delete(schema.messages)
      .where(sql`${schema.messages.timestamp} < ${cutoffDate}`)
      .returning({ id: schema.messages.id });

    const deleted = result.length;
    if (deleted > 0) {
      logger.info('Deleted old messages', {
        deletedCount: deleted,
        cutoffDate: cutoffDate.toISOString(),
      });
    }

    return deleted;
  }

  async exportToJson(options: MessageSearchOptions = {}): Promise<string> {
    const messages = await this.searchMessages({ ...options, limit: 10000 });
    return JSON.stringify(messages, null, 2);
  }

  // ============================================
  // CHAT PERMISSIONS MANAGEMENT
  // ============================================

  async getChatPermission(chatId: string): Promise<ChatPermissionRecord | undefined> {
    const db = this.db;
    const results = await db
      .select()
      .from(schema.chatPermissions)
      .where(eq(schema.chatPermissions.chatId, chatId))
      .limit(1);

    if (results.length === 0) return undefined;

    const r = results[0];
    return {
      chatId: r.chatId,
      chatType: r.chatType as ChatType,
      permission: r.permission as ChatPermission,
      displayName: r.displayName ?? undefined,
      notes: r.notes ?? undefined,
      createdAt: r.createdAt ?? undefined,
      updatedAt: r.updatedAt ?? undefined,
    };
  }

  async getAllChatPermissions(): Promise<ChatPermissionRecord[]> {
    const db = this.db;
    const results = await db
      .select()
      .from(schema.chatPermissions)
      .orderBy(desc(schema.chatPermissions.updatedAt));

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return results.map((r: any) => ({
      chatId: r.chatId,
      chatType: r.chatType as ChatType,
      permission: r.permission as ChatPermission,
      displayName: r.displayName ?? undefined,
      notes: r.notes ?? undefined,
      createdAt: r.createdAt ?? undefined,
      updatedAt: r.updatedAt ?? undefined,
    }));
  }

  async getAllChatsWithPermissions(): Promise<ChatWithPermission[]> {
    const results = await executeRawSql<ChatWithPermission>(`
      SELECT
        cp.chat_id as chatId,
        cp.chat_type as chatType,
        cp.permission,
        COALESCE(cp.display_name, g.group_name, g.group_subject) as displayName,
        cp.notes,
        cp.created_at as createdAt,
        cp.updated_at as updatedAt,
        (SELECT COUNT(*) FROM messages m WHERE m.jid = cp.chat_id OR m.group_id = cp.chat_id) as messageCount,
        (SELECT MAX(timestamp) FROM messages m WHERE m.jid = cp.chat_id OR m.group_id = cp.chat_id) as lastMessageAt
      FROM chat_permissions cp
      LEFT JOIN groups g ON cp.chat_id = g.group_id
      ORDER BY cp.updated_at DESC
    `);
    return results;
  }

  async getChatsWithoutPermissions(): Promise<ChatWithPermission[]> {
    // Find groups without permissions
    const groupsResult = await executeRawSql<ChatWithPermission>(`
      SELECT DISTINCT
        m.group_id as chatId,
        'group' as chatType,
        NULL as permission,
        COALESCE(g.group_name, g.group_subject) as displayName,
        NULL as notes,
        NULL as createdAt,
        NULL as updatedAt,
        COUNT(*) as messageCount,
        MAX(m.timestamp) as lastMessageAt
      FROM messages m
      LEFT JOIN groups g ON m.group_id = g.group_id
      LEFT JOIN chat_permissions cp ON m.group_id = cp.chat_id
      WHERE m.is_group = 1
        AND m.group_id IS NOT NULL
        AND cp.chat_id IS NULL
      GROUP BY m.group_id, g.group_name, g.group_subject
    `);

    // Find individual chats without permissions
    const individualsResult = await executeRawSql<ChatWithPermission>(`
      SELECT DISTINCT
        m.jid as chatId,
        'individual' as chatType,
        NULL as permission,
        m.phone as displayName,
        NULL as notes,
        NULL as createdAt,
        NULL as updatedAt,
        COUNT(*) as messageCount,
        MAX(m.timestamp) as lastMessageAt
      FROM messages m
      LEFT JOIN chat_permissions cp ON m.jid = cp.chat_id
      WHERE m.is_group = 0
        AND cp.chat_id IS NULL
      GROUP BY m.jid, m.phone
    `);

    return [...groupsResult, ...individualsResult];
  }

  async setChatPermission(
    chatId: string,
    chatType: ChatType,
    permission: ChatPermission,
    displayName?: string,
    notes?: string,
    changedBy?: string
  ): Promise<void> {
    const db = this.db;
    const oldRecord = await this.getChatPermission(chatId);
    const oldPermission = oldRecord?.permission || null;

    await db
      .insert(schema.chatPermissions)
      .values({
        chatId,
        chatType,
        permission,
        displayName: displayName || null,
        notes: notes || null,
        createdAt: new Date(),
        updatedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: schema.chatPermissions.chatId,
        set: {
          permission,
          displayName:
            displayName !== undefined ? displayName : sql`${schema.chatPermissions.displayName}`,
          notes: notes !== undefined ? notes : sql`${schema.chatPermissions.notes}`,
          updatedAt: new Date(),
        },
      });

    if (oldPermission !== permission) {
      await db.insert(schema.permissionAuditLog).values({
        chatId,
        oldPermission,
        newPermission: permission,
        changedBy: changedBy || null,
      });

      logger.info('Chat permission updated', {
        chatId,
        oldPermission,
        newPermission: permission,
        changedBy,
      });
    }
  }

  async updateChatDetails(chatId: string, displayName?: string, notes?: string): Promise<boolean> {
    const db = this.db;
    const result = await db
      .update(schema.chatPermissions)
      .set({
        displayName:
          displayName !== undefined ? displayName : sql`${schema.chatPermissions.displayName}`,
        notes: notes !== undefined ? notes : sql`${schema.chatPermissions.notes}`,
        updatedAt: new Date(),
      })
      .where(eq(schema.chatPermissions.chatId, chatId))
      .returning({ chatId: schema.chatPermissions.chatId });

    return result.length > 0;
  }

  async deleteChatPermission(chatId: string, changedBy?: string): Promise<boolean> {
    const db = this.db;
    const oldRecord = await this.getChatPermission(chatId);

    const result = await db
      .delete(schema.chatPermissions)
      .where(eq(schema.chatPermissions.chatId, chatId))
      .returning({ chatId: schema.chatPermissions.chatId });

    if (result.length > 0 && oldRecord) {
      await db.insert(schema.permissionAuditLog).values({
        chatId,
        oldPermission: oldRecord.permission,
        newPermission: 'deleted',
        changedBy: changedBy || null,
      });

      logger.info('Chat permission deleted', { chatId, changedBy });
    }

    return result.length > 0;
  }

  async getPermissionAuditLog(
    limit: number = 100,
    chatId?: string
  ): Promise<PermissionAuditEntry[]> {
    const db = this.db;
    let query = db
      .select()
      .from(schema.permissionAuditLog)
      .orderBy(desc(schema.permissionAuditLog.changedAt))
      .limit(limit);

    if (chatId) {
      query = query.where(eq(schema.permissionAuditLog.chatId, chatId)) as typeof query;
    }

    const results = await query;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return results.map((r: any) => ({
      id: r.id,
      chatId: r.chatId,
      oldPermission: r.oldPermission,
      newPermission: r.newPermission,
      changedBy: r.changedBy,
      changedAt: r.changedAt,
    }));
  }

  async getDashboardStats(): Promise<DashboardStats> {
    type PermissionRow = { permission: string; count: number };
    type TypeRow = { chat_type: string; count: number };

    const [permissionCounts, typeCounts, totalMessages, chatsWithoutPerms] = await Promise.all([
      executeRawSql<PermissionRow>(`
        SELECT permission, COUNT(*) as count
        FROM chat_permissions
        GROUP BY permission
      `),
      executeRawSql<TypeRow>(`
        SELECT chat_type, COUNT(*) as count
        FROM chat_permissions
        GROUP BY chat_type
      `),
      executeRawSql<{ count: number }>('SELECT COUNT(*) as count FROM messages'),
      this.getChatsWithoutPermissions(),
    ]);

    return {
      totalChats: permissionCounts.reduce((sum, p) => sum + Number(p.count), 0),
      byPermission: {
        ignored: Number(permissionCounts.find((p) => p.permission === 'ignored')?.count ?? 0),
        read_only: Number(permissionCounts.find((p) => p.permission === 'read_only')?.count ?? 0),
        read_write: Number(permissionCounts.find((p) => p.permission === 'read_write')?.count ?? 0),
      },
      byType: {
        individual: Number(typeCounts.find((t) => t.chat_type === 'individual')?.count ?? 0),
        group: Number(typeCounts.find((t) => t.chat_type === 'group')?.count ?? 0),
      },
      totalMessages: Number(totalMessages[0]?.count ?? 0),
      chatsWithoutPermissions: chatsWithoutPerms.length,
    };
  }

  async migrateFromAllowedGroupIds(
    allowedGroupIds: string[],
    defaultPermission: ChatPermission = 'read_only'
  ): Promise<number> {
    let migratedCount = 0;

    for (const groupId of allowedGroupIds) {
      const existing = await this.getChatPermission(groupId);
      if (!existing) {
        const group = await this.getGroup(groupId);
        const displayName = group?.groupName || group?.groupSubject || undefined;

        await this.setChatPermission(
          groupId,
          'group',
          'read_write',
          displayName,
          'Migrated from allowedGroupIds config',
          'system_migration'
        );
        migratedCount++;
      }
    }

    logger.info('Migrated allowedGroupIds to database', {
      migratedCount,
      totalGroups: allowedGroupIds.length,
    });
    return migratedCount;
  }

  // ============================================
  // DASHBOARD USERS MANAGEMENT
  // ============================================

  async getDashboardUser(username: string): Promise<DashboardUser | undefined> {
    const db = this.db;
    const results = await db
      .select()
      .from(schema.dashboardUsers)
      .where(eq(schema.dashboardUsers.username, username))
      .limit(1);

    if (results.length === 0) return undefined;

    const r = results[0];
    return {
      id: r.id,
      username: r.username,
      passwordHash: r.passwordHash,
      googleId: r.googleId,
      googleEmail: r.googleEmail,
      authMethod: r.authMethod as 'password' | 'google' | 'both',
      createdAt: r.createdAt,
    };
  }

  async getDashboardUserById(id: number): Promise<DashboardUser | undefined> {
    const db = this.db;
    const results = await db
      .select()
      .from(schema.dashboardUsers)
      .where(eq(schema.dashboardUsers.id, id))
      .limit(1);

    if (results.length === 0) return undefined;

    const r = results[0];
    return {
      id: r.id,
      username: r.username,
      passwordHash: r.passwordHash,
      googleId: r.googleId,
      googleEmail: r.googleEmail,
      authMethod: r.authMethod as 'password' | 'google' | 'both',
      createdAt: r.createdAt,
    };
  }

  async getDashboardUserByGoogleId(googleId: string): Promise<DashboardUser | undefined> {
    const db = this.db;
    const results = await db
      .select()
      .from(schema.dashboardUsers)
      .where(eq(schema.dashboardUsers.googleId, googleId))
      .limit(1);

    if (results.length === 0) return undefined;

    const r = results[0];
    return {
      id: r.id,
      username: r.username,
      passwordHash: r.passwordHash,
      googleId: r.googleId,
      googleEmail: r.googleEmail,
      authMethod: r.authMethod as 'password' | 'google' | 'both',
      createdAt: r.createdAt,
    };
  }

  async getDashboardUserByEmail(email: string): Promise<DashboardUser | undefined> {
    const db = this.db;
    const results = await db
      .select()
      .from(schema.dashboardUsers)
      .where(eq(schema.dashboardUsers.username, email))
      .limit(1);

    if (results.length === 0) return undefined;

    const r = results[0];
    return {
      id: r.id,
      username: r.username,
      passwordHash: r.passwordHash,
      googleId: r.googleId,
      googleEmail: r.googleEmail,
      authMethod: r.authMethod as 'password' | 'google' | 'both',
      createdAt: r.createdAt,
    };
  }

  async linkGoogleAccount(userId: number, googleId: string, googleEmail: string): Promise<boolean> {
    const db = this.db;
    const result = await db
      .update(schema.dashboardUsers)
      .set({
        googleId,
        googleEmail,
        authMethod: 'both',
      })
      .where(eq(schema.dashboardUsers.id, userId))
      .returning({ id: schema.dashboardUsers.id });

    logger.info('Linked Google account to dashboard user', { userId, googleEmail });
    return result.length > 0;
  }

  async createDashboardUserWithGoogle(googleId: string, email: string): Promise<number> {
    const db = this.db;
    const result = await db
      .insert(schema.dashboardUsers)
      .values({
        username: email,
        passwordHash: null,
        googleId,
        googleEmail: email,
        authMethod: 'google',
      })
      .returning({ id: schema.dashboardUsers.id });

    logger.info('Created dashboard user with Google', { email, id: result[0].id });
    return result[0].id;
  }

  async createDashboardUser(username: string, passwordHash: string): Promise<number> {
    const db = this.db;
    const result = await db
      .insert(schema.dashboardUsers)
      .values({ username, passwordHash })
      .returning({ id: schema.dashboardUsers.id });

    logger.info('Created dashboard user', { username, id: result[0].id });
    return result[0].id;
  }

  async updateDashboardUserPassword(username: string, passwordHash: string): Promise<boolean> {
    const db = this.db;
    const result = await db
      .update(schema.dashboardUsers)
      .set({ passwordHash })
      .where(eq(schema.dashboardUsers.username, username))
      .returning({ id: schema.dashboardUsers.id });

    return result.length > 0;
  }

  async deleteDashboardUser(username: string): Promise<boolean> {
    const db = this.db;
    const result = await db
      .delete(schema.dashboardUsers)
      .where(eq(schema.dashboardUsers.username, username))
      .returning({ id: schema.dashboardUsers.id });

    if (result.length > 0) {
      logger.info('Deleted dashboard user', { username });
    }
    return result.length > 0;
  }

  async getAllDashboardUsers(): Promise<{ id: number; username: string; createdAt: string }[]> {
    const db = this.db;
    const results = await db
      .select({
        id: schema.dashboardUsers.id,
        username: schema.dashboardUsers.username,
        createdAt: schema.dashboardUsers.createdAt,
      })
      .from(schema.dashboardUsers)
      .orderBy(desc(schema.dashboardUsers.createdAt));

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return results.map((r: any) => ({
      id: r.id,
      username: r.username,
      createdAt: r.createdAt?.toISOString() || '',
    }));
  }

  async hasDashboardUsers(): Promise<boolean> {
    const db = this.db;
    const results = await db.select({ count: count() }).from(schema.dashboardUsers);

    return results[0].count > 0;
  }

  // ============================================
  // SYSTEM PROMPTS MANAGEMENT
  // ============================================

  async getSystemPrompt(
    platform: PromptPlatform,
    chatId: string
  ): Promise<SystemPromptRecord | undefined> {
    const db = this.db;
    // First try specific chat
    let results = await db
      .select()
      .from(schema.systemPrompts)
      .where(
        and(
          eq(schema.systemPrompts.platform, platform),
          eq(schema.systemPrompts.chatId, chatId),
          eq(schema.systemPrompts.isActive, true)
        )
      )
      .limit(1);

    if (results.length > 0) {
      const r = results[0];
      return {
        id: r.id,
        chatId: r.chatId,
        platform: r.platform as PromptPlatform,
        promptText: r.promptText,
        isActive: r.isActive ?? true,
        createdAt: r.createdAt ?? undefined,
        updatedAt: r.updatedAt ?? undefined,
      };
    }

    // Fall back to platform default
    results = await db
      .select()
      .from(schema.systemPrompts)
      .where(
        and(
          eq(schema.systemPrompts.platform, platform),
          eq(schema.systemPrompts.chatId, '*'),
          eq(schema.systemPrompts.isActive, true)
        )
      )
      .limit(1);

    if (results.length === 0) return undefined;

    const r = results[0];
    return {
      id: r.id,
      chatId: r.chatId,
      platform: r.platform as PromptPlatform,
      promptText: r.promptText,
      isActive: r.isActive ?? true,
      createdAt: r.createdAt ?? undefined,
      updatedAt: r.updatedAt ?? undefined,
    };
  }

  async getSystemPromptText(platform: PromptPlatform, chatId: string): Promise<string | undefined> {
    const prompt = await this.getSystemPrompt(platform, chatId);
    return prompt?.promptText;
  }

  async getDefaultPrompt(platform: PromptPlatform): Promise<SystemPromptRecord | undefined> {
    const db = this.db;
    const results = await db
      .select()
      .from(schema.systemPrompts)
      .where(and(eq(schema.systemPrompts.platform, platform), eq(schema.systemPrompts.chatId, '*')))
      .limit(1);

    if (results.length === 0) return undefined;

    const r = results[0];
    return {
      id: r.id,
      chatId: r.chatId,
      platform: r.platform as PromptPlatform,
      promptText: r.promptText,
      isActive: r.isActive ?? true,
      createdAt: r.createdAt ?? undefined,
      updatedAt: r.updatedAt ?? undefined,
    };
  }

  async setSystemPrompt(
    platform: PromptPlatform,
    chatId: string,
    promptText: string
  ): Promise<SystemPromptRecord> {
    const db = this.db;
    const result = await db
      .insert(schema.systemPrompts)
      .values({
        chatId,
        platform,
        promptText,
        updatedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: [schema.systemPrompts.chatId, schema.systemPrompts.platform],
        set: {
          promptText,
          isActive: true,
          updatedAt: new Date(),
        },
      })
      .returning();

    logger.info('System prompt updated', { platform, chatId, promptLength: promptText.length });

    const r = result[0];
    return {
      id: r.id,
      chatId: r.chatId,
      platform: r.platform as PromptPlatform,
      promptText: r.promptText,
      isActive: r.isActive ?? true,
      createdAt: r.createdAt ?? undefined,
      updatedAt: r.updatedAt ?? undefined,
    };
  }

  async deleteSystemPrompt(platform: PromptPlatform, chatId: string): Promise<boolean> {
    const db = this.db;
    if (chatId === '*') {
      logger.warn('Cannot delete platform default prompt', { platform });
      return false;
    }

    const result = await db
      .delete(schema.systemPrompts)
      .where(
        and(eq(schema.systemPrompts.platform, platform), eq(schema.systemPrompts.chatId, chatId))
      )
      .returning({ id: schema.systemPrompts.id });

    if (result.length > 0) {
      logger.info('System prompt deleted', { platform, chatId });
      return true;
    }
    return false;
  }

  async listSystemPrompts(platform?: PromptPlatform): Promise<SystemPromptWithInfo[]> {
    let results: SystemPromptWithInfo[];
    if (platform) {
      results = await executeRawSql<SystemPromptWithInfo>(
        `
        SELECT
          sp.id,
          sp.chat_id as chatId,
          sp.platform,
          sp.prompt_text as promptText,
          sp.is_active as isActive,
          sp.created_at as createdAt,
          sp.updated_at as updatedAt,
          COALESCE(g.group_name, cp.display_name) as displayName,
          (sp.chat_id = '*') as isDefault
        FROM system_prompts sp
        LEFT JOIN groups g ON sp.chat_id = g.group_id
        LEFT JOIN chat_permissions cp ON sp.chat_id = cp.chat_id
        WHERE sp.platform = ?
        ORDER BY
          sp.chat_id = '*' DESC,
          sp.updated_at DESC
      `,
        [platform]
      );
    } else {
      results = await executeRawSql<SystemPromptWithInfo>(`
        SELECT
          sp.id,
          sp.chat_id as chatId,
          sp.platform,
          sp.prompt_text as promptText,
          sp.is_active as isActive,
          sp.created_at as createdAt,
          sp.updated_at as updatedAt,
          COALESCE(g.group_name, cp.display_name) as displayName,
          (sp.chat_id = '*') as isDefault
        FROM system_prompts sp
        LEFT JOIN groups g ON sp.chat_id = g.group_id
        LEFT JOIN chat_permissions cp ON sp.chat_id = cp.chat_id
        ORDER BY
          sp.platform ASC,
          sp.chat_id = '*' DESC,
          sp.updated_at DESC
      `);
    }

    return results;
  }

  async getDefaultPrompts(): Promise<Record<PromptPlatform, SystemPromptRecord | null>> {
    const db = this.db;
    const results = await db
      .select()
      .from(schema.systemPrompts)
      .where(eq(schema.systemPrompts.chatId, '*'));

    const defaults: Record<PromptPlatform, SystemPromptRecord | null> = {
      whatsapp: null,
      slack: null,
    };

    for (const r of results) {
      defaults[r.platform as PromptPlatform] = {
        id: r.id,
        chatId: r.chatId,
        platform: r.platform as PromptPlatform,
        promptText: r.promptText,
        isActive: r.isActive ?? true,
        createdAt: r.createdAt ?? undefined,
        updatedAt: r.updatedAt ?? undefined,
      };
    }

    return defaults;
  }

  async seedDefaultPrompts(): Promise<void> {
    const defaults = await this.getDefaultPrompts();

    const defaultWhatsAppPrompt = `You are an Orient Project Management assistant. You have access to JIRA, Slack, WhatsApp, and Google Slides tools through the orienter MCP server. Focus on:

- Querying and managing JIRA issues for the YOUR_COMPONENT component
- Checking blockers, SLA breaches, and sprint progress
- Sending Slack messages and looking up users
- Searching WhatsApp messages and conversations
- Updating weekly presentations

Always provide concise, actionable summaries when reporting on project status. Use the discover_tools tool first if you need to find the right tool for a task.`;

    const defaultSlackPrompt = `You are an Orient Project Management assistant. You have access to JIRA, Slack, WhatsApp, and Google Slides tools through the orienter MCP server. Focus on:

- Querying and managing JIRA issues for the YOUR_COMPONENT component
- Checking blockers, SLA breaches, and sprint progress
- Sending Slack messages and looking up users
- Searching WhatsApp messages and conversations
- Updating weekly presentations

CRITICAL FORMATTING RULES FOR SLACK:
You are responding in Slack, so use Slack's mrkdwn format, NOT standard markdown:
- Bold text: Use *single asterisks* (not **double**)
- Italic text: Use _underscores_ (not *asterisks*)
- Code/monospace: Use \`backticks\` (same as markdown)
- DO NOT use markdown headers like ## or ###. Instead, use bold text
- Lists: Use bullet points with • or -
- Links: Use <url|text> format
- Emoji: Use Slack emoji codes like :white_check_mark: :warning: :rocket:

Always provide concise, actionable summaries when reporting on project status.`;

    if (!defaults.whatsapp) {
      await this.setSystemPrompt('whatsapp', '*', defaultWhatsAppPrompt);
      logger.info('Seeded default WhatsApp prompt');
    }

    if (!defaults.slack) {
      await this.setSystemPrompt('slack', '*', defaultSlackPrompt);
      logger.info('Seeded default Slack prompt');
    }
  }

  async close(): Promise<void> {
    await closeDatabase();
    logger.info('Database connection pool closed');
  }

  // ============================================
  // DEMO MEETINGS MANAGEMENT
  // ============================================

  async listDemoMeetings(limit: number = 100): Promise<DemoMeeting[]> {
    const db = this.db;
    const results = await db
      .select()
      .from(schema.demoMeetings)
      .orderBy(desc(schema.demoMeetings.startTime))
      .limit(limit);

    return results.map((r) => ({
      id: r.id,
      title: r.title,
      description: r.description || undefined,
      attendees: r.attendees || undefined,
      startTime: r.startTime,
      durationMinutes: r.durationMinutes,
      sendReminder: r.sendReminder ?? true,
      createdAt: r.createdAt || new Date(),
    }));
  }

  async createDemoMeeting(input: CreateDemoMeetingInput): Promise<DemoMeeting> {
    const db = this.db;
    const result = await db
      .insert(schema.demoMeetings)
      .values({
        title: input.title,
        description: input.description || null,
        attendees: input.attendees || null,
        startTime: input.startTime instanceof Date ? input.startTime : new Date(input.startTime),
        durationMinutes: input.durationMinutes,
        sendReminder: input.sendReminder ?? true,
      })
      .returning();

    const r = result[0];
    return {
      id: r.id,
      title: r.title,
      description: r.description || undefined,
      attendees: r.attendees || undefined,
      startTime: r.startTime,
      durationMinutes: r.durationMinutes,
      sendReminder: r.sendReminder ?? true,
      createdAt: r.createdAt || new Date(),
    };
  }

  // ============================================
  // DEMO GITHUB MONITORS MANAGEMENT
  // ============================================

  async listDemoGithubMonitors(limit: number = 100): Promise<DemoGithubMonitor[]> {
    const db = this.db;
    const results = await db
      .select()
      .from(schema.demoGithubMonitors)
      .orderBy(desc(schema.demoGithubMonitors.createdAt))
      .limit(limit);

    return results.map((r) => ({
      id: r.id,
      repoUrl: r.repoUrl,
      slackChannel: r.slackChannel,
      scheduleTime: r.scheduleTime,
      isActive: r.isActive ?? true,
      lastChecked: r.lastChecked || undefined,
      createdAt: r.createdAt || new Date(),
    }));
  }

  async createDemoGithubMonitor(input: CreateDemoGithubMonitorInput): Promise<DemoGithubMonitor> {
    const db = this.db;
    const result = await db
      .insert(schema.demoGithubMonitors)
      .values({
        repoUrl: input.repoUrl,
        slackChannel: input.slackChannel,
        scheduleTime: input.scheduleTime,
        isActive: input.isActive ?? true,
      })
      .returning();

    const r = result[0];
    return {
      id: r.id,
      repoUrl: r.repoUrl,
      slackChannel: r.slackChannel,
      scheduleTime: r.scheduleTime,
      isActive: r.isActive ?? true,
      lastChecked: r.lastChecked || undefined,
      createdAt: r.createdAt || new Date(),
    };
  }

  async markDemoGithubMonitorChecked(id: number): Promise<boolean> {
    const db = this.db;
    const result = await db
      .update(schema.demoGithubMonitors)
      .set({ lastChecked: new Date() })
      .where(eq(schema.demoGithubMonitors.id, id))
      .returning({ id: schema.demoGithubMonitors.id });

    return result.length > 0;
  }

  async deleteDemoGithubMonitor(id: number): Promise<boolean> {
    const db = this.db;
    const result = await db
      .delete(schema.demoGithubMonitors)
      .where(eq(schema.demoGithubMonitors.id, id))
      .returning({ id: schema.demoGithubMonitors.id });

    return result.length > 0;
  }

  // ============================================
  // UNIFIED CHATS
  // ============================================

  async getAllChatsUnified(): Promise<UnifiedChat[]> {
    // Get WhatsApp chats with permissions
    const whatsappChats = await this.getAllChatsWithPermissions();

    return whatsappChats.map((chat) => ({
      id: chat.chatId,
      platform: 'whatsapp' as const,
      type: chat.chatType as 'individual' | 'group',
      displayName: chat.displayName || chat.chatId,
      permission: chat.permission || undefined,
      messageCount: chat.messageCount,
      lastMessageAt: chat.lastMessageAt,
    }));
  }

  // ============================================
  // ONBOARDING STATUS
  // ============================================

  async checkOnboardingCompleted(platform: 'whatsapp' | 'slack'): Promise<boolean> {
    // Check if the platform has any activity indicating it's set up
    if (platform === 'whatsapp') {
      // Check if there are any messages
      const [result] = await executeRawSql<{ count: number }>(
        'SELECT COUNT(*) as count FROM messages LIMIT 1'
      );
      return (result?.count || 0) > 0;
    } else if (platform === 'slack') {
      // Check if there are any Slack messages
      const [result] = await executeRawSql<{ count: number }>(
        'SELECT COUNT(*) as count FROM slack_messages LIMIT 1'
      );
      return (result?.count || 0) > 0;
    }
    return false;
  }

  async markOnboardingCompleted(platform: 'whatsapp' | 'slack'): Promise<void> {
    // No-op for now - onboarding is considered complete when messages exist
    logger.info('Onboarding marked complete', { platform });
  }

  // ============================================
  // HEALTH MONITOR STATE (Key-Value Storage)
  // ============================================

  async getAllHealthMonitorState(): Promise<Record<string, unknown>> {
    try {
      const results = await executeRawSql<{ key: string; value: string }>(
        "SELECT key, value FROM app_storage WHERE app_name = 'health_monitor'"
      );

      const state: Record<string, unknown> = {};
      for (const row of results) {
        try {
          state[row.key] = JSON.parse(row.value);
        } catch {
          state[row.key] = row.value;
        }
      }
      return state;
    } catch {
      return {};
    }
  }

  async getHealthMonitorState(key: string): Promise<unknown | null> {
    try {
      const results = await executeRawSql<{ value: string }>(
        "SELECT value FROM app_storage WHERE app_name = 'health_monitor' AND key = ?",
        [key]
      );

      if (results.length === 0) return null;
      try {
        return JSON.parse(results[0].value);
      } catch {
        return results[0].value;
      }
    } catch {
      return null;
    }
  }

  async setHealthMonitorState(key: string, value: unknown): Promise<void> {
    const db = this.db;
    const valueStr = JSON.stringify(value);

    await db
      .insert(schema.appStorage)
      .values({
        appName: 'health_monitor',
        key,
        value: valueStr,
        updatedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: [schema.appStorage.appName, schema.appStorage.key],
        set: {
          value: valueStr,
          updatedAt: new Date(),
        },
      });
  }

  async deleteHealthMonitorState(key: string): Promise<boolean> {
    const db = this.db;
    const result = await db
      .delete(schema.appStorage)
      .where(and(eq(schema.appStorage.appName, 'health_monitor'), eq(schema.appStorage.key, key)))
      .returning({ id: schema.appStorage.id });

    return result.length > 0;
  }

  // ============================================
  // ONBOARDER SESSIONS
  // ============================================

  async getActiveOnboarderSession(userId: number): Promise<OnboarderSession | null> {
    const db = this.db;
    const results = await db
      .select()
      .from(schema.onboarderSessions)
      .where(
        and(
          eq(schema.onboarderSessions.userId, userId),
          eq(schema.onboarderSessions.isActive, true)
        )
      )
      .orderBy(desc(schema.onboarderSessions.lastActiveAt))
      .limit(1);

    if (results.length === 0) return null;

    const r = results[0];
    return {
      id: r.id,
      userId: r.userId,
      sessionId: r.sessionId,
      title: r.title,
      isActive: r.isActive ?? false,
      createdAt: r.createdAt || new Date(),
      lastActiveAt: r.lastActiveAt || new Date(),
    };
  }

  async touchOnboarderSession(sessionId: string): Promise<void> {
    const db = this.db;
    await db
      .update(schema.onboarderSessions)
      .set({ lastActiveAt: new Date() })
      .where(eq(schema.onboarderSessions.sessionId, sessionId));
  }

  async createOnboarderSession(
    userId: number,
    sessionId: string,
    title: string
  ): Promise<OnboarderSession> {
    const db = this.db;

    // Deactivate any existing active sessions for this user
    await db
      .update(schema.onboarderSessions)
      .set({ isActive: false })
      .where(
        and(
          eq(schema.onboarderSessions.userId, userId),
          eq(schema.onboarderSessions.isActive, true)
        )
      );

    // Create new session
    const result = await db
      .insert(schema.onboarderSessions)
      .values({
        userId,
        sessionId,
        title,
        isActive: true,
        lastActiveAt: new Date(),
      })
      .returning();

    const r = result[0];
    return {
      id: r.id,
      userId: r.userId,
      sessionId: r.sessionId,
      title: r.title,
      isActive: r.isActive ?? true,
      createdAt: r.createdAt || new Date(),
      lastActiveAt: r.lastActiveAt || new Date(),
    };
  }

  async getOnboarderSessions(userId: number): Promise<OnboarderSession[]> {
    const db = this.db;
    const results = await db
      .select()
      .from(schema.onboarderSessions)
      .where(eq(schema.onboarderSessions.userId, userId))
      .orderBy(desc(schema.onboarderSessions.lastActiveAt));

    return results.map((r) => ({
      id: r.id,
      userId: r.userId,
      sessionId: r.sessionId,
      title: r.title,
      isActive: r.isActive ?? false,
      createdAt: r.createdAt || new Date(),
      lastActiveAt: r.lastActiveAt || new Date(),
    }));
  }

  async setActiveOnboarderSession(userId: number, sessionId: string): Promise<boolean> {
    const db = this.db;

    // Deactivate all sessions for this user
    await db
      .update(schema.onboarderSessions)
      .set({ isActive: false })
      .where(eq(schema.onboarderSessions.userId, userId));

    // Activate the specified session
    const result = await db
      .update(schema.onboarderSessions)
      .set({ isActive: true, lastActiveAt: new Date() })
      .where(
        and(
          eq(schema.onboarderSessions.userId, userId),
          eq(schema.onboarderSessions.sessionId, sessionId)
        )
      )
      .returning({ id: schema.onboarderSessions.id });

    return result.length > 0;
  }

  async clearOnboarderSessions(userId: number): Promise<number> {
    const db = this.db;
    const result = await db
      .delete(schema.onboarderSessions)
      .where(eq(schema.onboarderSessions.userId, userId))
      .returning({ id: schema.onboarderSessions.id });

    return result.length;
  }
}

// ============================================
// DEMO TYPES
// ============================================

export interface DemoMeeting {
  id: number;
  title: string;
  description?: string;
  attendees?: string;
  startTime: Date;
  durationMinutes: number;
  sendReminder: boolean;
  createdAt: Date;
}

export interface CreateDemoMeetingInput {
  title: string;
  description?: string;
  attendees?: string;
  startTime: Date | string;
  durationMinutes: number;
  sendReminder?: boolean;
}

export interface DemoGithubMonitor {
  id: number;
  repoUrl: string;
  slackChannel: string;
  scheduleTime: string;
  isActive: boolean;
  lastChecked?: Date;
  createdAt: Date;
}

export interface CreateDemoGithubMonitorInput {
  repoUrl: string;
  slackChannel: string;
  scheduleTime: string;
  isActive?: boolean;
}

export interface UnifiedChat {
  id: string;
  platform: 'whatsapp' | 'slack';
  type: 'individual' | 'group' | 'channel';
  displayName: string;
  permission?: string;
  messageCount: number;
  lastMessageAt: Date | null;
}

export interface OnboarderSession {
  id: number;
  userId: number;
  sessionId: string;
  title: string;
  isActive: boolean;
  createdAt: Date;
  lastActiveAt: Date;
}

/**
 * Create a MessageDatabase instance using Drizzle ORM
 */
export function createMessageDatabase(): MessageDatabase {
  return new MessageDatabase();
}
