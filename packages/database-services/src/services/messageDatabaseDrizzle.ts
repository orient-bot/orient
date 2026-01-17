/**
 * Message Database Service (Drizzle ORM Implementation)
 *
 * PostgreSQL database for storing and querying WhatsApp messages.
 * This is a type-safe implementation using Drizzle ORM.
 *
 * Exported via @orient/database-services package.
 */

import { createServiceLogger } from '@orient/core';
import {
  getDatabase,
  getSqlClient,
  closeDatabase,
  eq,
  and,
  or,
  desc,
  asc,
  sql,
  count,
  isNull,
  schema,
} from '@orient/database';
import type {
  Message,
  NewMessage,
  Group,
  NewGroup,
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

// Re-export types for consumers (matching original interface)
export type StoredMessage = Message;
export type StoredGroup = Group;

export interface ChatPermissionRecord {
  chatId: string;
  chatType: ChatType;
  permission: ChatPermission;
  displayName: string | null;
  notes: string | null;
  createdAt: Date | null;
  updatedAt: Date | null;
}

export interface PermissionAuditEntry {
  id: number;
  chatId: string;
  oldPermission: string | null;
  newPermission: string;
  changedBy: string | null;
  changedAt: Date | null;
}

export interface DashboardUser {
  id: number;
  username: string;
  passwordHash: string;
  createdAt: Date | null;
}

export interface SystemPromptRecord {
  id: number;
  chatId: string;
  platform: PromptPlatform;
  promptText: string;
  isActive: boolean | null;
  createdAt: Date | null;
  updatedAt: Date | null;
}

export interface SystemPromptWithInfo extends SystemPromptRecord {
  displayName: string | null;
  isDefault: boolean;
}

export interface ChatWithPermission extends ChatPermissionRecord {
  messageCount: number;
  lastMessageAt: Date | null;
}

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
  private connectionString: string;

  constructor(connectionString?: string) {
    this.connectionString =
      connectionString ||
      process.env.DATABASE_URL ||
      'postgresql://aibot:aibot123@localhost:5432/whatsapp_bot_0';

    logger.info('Drizzle database client initialized', {
      connectionString: this.connectionString.replace(/:[^:@]+@/, ':****@'),
    });
  }

  /**
   * Get the database instance
   */
  private get db() {
    return getDatabase({ connectionString: this.connectionString });
  }

  /**
   * Initialize the database (creates tables if they don't exist)
   */
  async initialize(): Promise<void> {
    if (this.initialized) return;

    await this.initializeTables();
    this.initialized = true;
  }

  /**
   * Initialize database tables using raw SQL
   * Note: In production, use Drizzle migrations instead
   */
  private async initializeTables(): Promise<void> {
    const sql = getSqlClient();

    // CREATE TABLE IF NOT EXISTS is idempotent, no transaction needed

    // Messages table
    await sql`
        CREATE TABLE IF NOT EXISTS messages (
          id SERIAL PRIMARY KEY,
          message_id TEXT UNIQUE,
          direction TEXT NOT NULL CHECK (direction IN ('incoming', 'outgoing')),
          jid TEXT NOT NULL,
          phone TEXT NOT NULL,
          text TEXT NOT NULL,
          is_group BOOLEAN NOT NULL DEFAULT FALSE,
          group_id TEXT,
          timestamp TIMESTAMPTZ NOT NULL,
          created_at TIMESTAMPTZ DEFAULT NOW(),
          media_type TEXT,
          media_path TEXT,
          media_mime_type TEXT,
          transcribed_text TEXT,
          transcribed_language TEXT
        )
      `;

    // Groups table
    await sql`
        CREATE TABLE IF NOT EXISTS groups (
          group_id TEXT PRIMARY KEY,
          group_name TEXT,
          group_subject TEXT,
          participant_count INTEGER,
          last_updated TIMESTAMPTZ DEFAULT NOW()
        )
      `;

    // Chat permissions table
    await sql`
        CREATE TABLE IF NOT EXISTS chat_permissions (
          chat_id TEXT PRIMARY KEY,
          chat_type TEXT NOT NULL CHECK (chat_type IN ('individual', 'group')),
          permission TEXT NOT NULL DEFAULT 'read_only' 
            CHECK (permission IN ('ignored', 'read_only', 'read_write')),
          display_name TEXT,
          notes TEXT,
          created_at TIMESTAMPTZ DEFAULT NOW(),
          updated_at TIMESTAMPTZ DEFAULT NOW()
        )
      `;

    // Permission audit log
    await sql`
        CREATE TABLE IF NOT EXISTS permission_audit_log (
          id SERIAL PRIMARY KEY,
          chat_id TEXT NOT NULL,
          old_permission TEXT,
          new_permission TEXT NOT NULL,
          changed_by TEXT,
          changed_at TIMESTAMPTZ DEFAULT NOW()
        )
      `;

    // Dashboard users
    await sql`
        CREATE TABLE IF NOT EXISTS dashboard_users (
          id SERIAL PRIMARY KEY,
          username TEXT UNIQUE NOT NULL,
          password_hash TEXT NOT NULL,
          created_at TIMESTAMPTZ DEFAULT NOW()
        )
      `;

    // System prompts table
    await sql`
        CREATE TABLE IF NOT EXISTS system_prompts (
          id SERIAL PRIMARY KEY,
          chat_id TEXT NOT NULL,
          platform TEXT NOT NULL CHECK (platform IN ('whatsapp', 'slack')),
          prompt_text TEXT NOT NULL,
          is_active BOOLEAN DEFAULT true,
          created_at TIMESTAMPTZ DEFAULT NOW(),
          updated_at TIMESTAMPTZ DEFAULT NOW(),
          UNIQUE(chat_id, platform)
        )
      `;

    // Create indexes
    await sql`CREATE INDEX IF NOT EXISTS idx_messages_phone ON messages(phone)`;
    await sql`CREATE INDEX IF NOT EXISTS idx_messages_timestamp ON messages(timestamp)`;
    await sql`CREATE INDEX IF NOT EXISTS idx_messages_direction ON messages(direction)`;
    await sql`CREATE INDEX IF NOT EXISTS idx_messages_is_group ON messages(is_group)`;
    await sql`CREATE INDEX IF NOT EXISTS idx_messages_group_id ON messages(group_id)`;
    await sql`CREATE INDEX IF NOT EXISTS idx_messages_media_type ON messages(media_type)`;
    await sql`CREATE INDEX IF NOT EXISTS idx_groups_name ON groups(group_name)`;
    await sql`CREATE INDEX IF NOT EXISTS idx_groups_subject ON groups(group_subject)`;
    await sql`CREATE INDEX IF NOT EXISTS idx_chat_permissions_type ON chat_permissions(chat_type)`;
    await sql`CREATE INDEX IF NOT EXISTS idx_chat_permissions_permission ON chat_permissions(permission)`;
    await sql`CREATE INDEX IF NOT EXISTS idx_permission_audit_chat ON permission_audit_log(chat_id)`;
    await sql`CREATE INDEX IF NOT EXISTS idx_permission_audit_time ON permission_audit_log(changed_at)`;
    await sql`CREATE INDEX IF NOT EXISTS idx_system_prompts_lookup ON system_prompts(platform, chat_id)`;
    await sql`CREATE INDEX IF NOT EXISTS idx_system_prompts_platform ON system_prompts(platform)`;

    // Full-text search index
    await sql`
      CREATE INDEX IF NOT EXISTS idx_messages_text_search 
      ON messages USING gin(to_tsvector('english', text))
    `;

    logger.info('Database tables initialized');
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
    options?: StoreMessageOptions
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
    options?: StoreMessageOptions
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
    options?: StoreMessageOptions
  ): Promise<number> {
    const result = await this.db
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

    let query = this.db
      .select()
      .from(schema.messages)
      .orderBy(desc(schema.messages.timestamp))
      .limit(options.limit || 100)
      .offset(options.offset || 0);

    if (conditions.length > 0) {
      query = query.where(and(...conditions)) as typeof query;
    }

    // Handle full-text search separately using raw SQL
    if (options.text) {
      const sqlClient = getSqlClient();
      const results = await sqlClient`
        SELECT * FROM messages 
        WHERE to_tsvector('english', text) @@ plainto_tsquery('english', ${options.text})
        ORDER BY timestamp DESC
        LIMIT ${options.limit || 100} OFFSET ${options.offset || 0}
      `;
      return results as unknown as StoredMessage[];
    }

    return query;
  }

  async fullTextSearch(searchTerm: string, limit: number = 50): Promise<StoredMessage[]> {
    const sqlClient = getSqlClient();
    const results = await sqlClient`
      SELECT * FROM messages
      WHERE to_tsvector('english', text) @@ plainto_tsquery('english', ${searchTerm})
      ORDER BY timestamp DESC
      LIMIT ${limit}
    `;
    return results as unknown as StoredMessage[];
  }

  async getRecentMessages(limit: number = 50): Promise<StoredMessage[]> {
    return this.db
      .select()
      .from(schema.messages)
      .orderBy(desc(schema.messages.timestamp))
      .limit(limit);
  }

  async getMessagesByPhone(phone: string, limit: number = 100): Promise<StoredMessage[]> {
    return this.db
      .select()
      .from(schema.messages)
      .where(eq(schema.messages.phone, phone))
      .orderBy(desc(schema.messages.timestamp))
      .limit(limit);
  }

  async getMessagesByGroup(groupId: string, limit: number = 100): Promise<StoredMessage[]> {
    return this.db
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
    return this.db
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
    const results = await this.db
      .select()
      .from(schema.messages)
      .where(eq(schema.messages.messageId, messageId))
      .limit(1);
    return results[0];
  }

  async getStats(): Promise<MessageStats> {
    const sqlClient = getSqlClient();

    const [
      totalResult,
      incomingResult,
      outgoingResult,
      contactsResult,
      groupsResult,
      firstResult,
      lastResult,
    ] = await Promise.all([
      sqlClient`SELECT COUNT(*) as count FROM messages`,
      sqlClient`SELECT COUNT(*) as count FROM messages WHERE direction = 'incoming'`,
      sqlClient`SELECT COUNT(*) as count FROM messages WHERE direction = 'outgoing'`,
      sqlClient`SELECT COUNT(DISTINCT phone) as count FROM messages`,
      sqlClient`SELECT COUNT(DISTINCT group_id) as count FROM messages WHERE is_group = true`,
      sqlClient`SELECT MIN(timestamp) as ts FROM messages`,
      sqlClient`SELECT MAX(timestamp) as ts FROM messages`,
    ]);

    // Handle timestamp formatting - might be Date or string depending on driver
    const formatTimestamp = (ts: unknown): string | null => {
      if (!ts) return null;
      if (ts instanceof Date) return ts.toISOString();
      if (typeof ts === 'string') return ts;
      return null;
    };

    return {
      totalMessages: parseInt((totalResult as unknown as Array<{ count: string }>)[0].count),
      incomingMessages: parseInt((incomingResult as unknown as Array<{ count: string }>)[0].count),
      outgoingMessages: parseInt((outgoingResult as unknown as Array<{ count: string }>)[0].count),
      uniqueContacts: parseInt((contactsResult as unknown as Array<{ count: string }>)[0].count),
      uniqueGroups: parseInt((groupsResult as unknown as Array<{ count: string }>)[0].count),
      firstMessage: formatTimestamp((firstResult as unknown as Array<{ ts: unknown }>)[0]?.ts),
      lastMessage: formatTimestamp((lastResult as unknown as Array<{ ts: unknown }>)[0]?.ts),
    };
  }

  async getUniqueContacts(): Promise<string[]> {
    const results = await this.db
      .selectDistinct({ phone: schema.messages.phone })
      .from(schema.messages)
      .orderBy(schema.messages.phone);
    return results.map((r) => r.phone);
  }

  async getUniqueGroups(): Promise<string[]> {
    const results = await this.db
      .selectDistinct({ groupId: schema.messages.groupId })
      .from(schema.messages)
      .where(and(eq(schema.messages.isGroup, true), sql`${schema.messages.groupId} IS NOT NULL`))
      .orderBy(schema.messages.groupId);
    return results.filter((r) => r.groupId !== null).map((r) => r.groupId!);
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
    await this.db
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
    const results = await this.db
      .select()
      .from(schema.groups)
      .where(eq(schema.groups.groupId, groupId))
      .limit(1);
    return results[0];
  }

  async getAllGroups(): Promise<StoredGroup[]> {
    return this.db.select().from(schema.groups).orderBy(desc(schema.groups.lastUpdated));
  }

  async searchGroups(searchTerm: string): Promise<StoredGroup[]> {
    const pattern = `%${searchTerm}%`;
    return this.db
      .select()
      .from(schema.groups)
      .where(
        or(
          sql`${schema.groups.groupName} ILIKE ${pattern}`,
          sql`${schema.groups.groupSubject} ILIKE ${pattern}`
        )
      )
      .orderBy(desc(schema.groups.lastUpdated));
  }

  async findGroupByName(name: string): Promise<StoredGroup | undefined> {
    const groups = await this.searchGroups(name);
    return groups.length > 0 ? groups[0] : undefined;
  }

  async getGroupsWithoutNames(): Promise<string[]> {
    const sqlClient = getSqlClient();
    const results = await sqlClient`
      SELECT DISTINCT m.group_id
      FROM messages m
      WHERE m.is_group = true 
        AND m.group_id IS NOT NULL
        AND m.group_id NOT IN (
          SELECT g.group_id FROM groups g WHERE g.group_name IS NOT NULL
        )
    `;
    return (results as unknown as Array<{ group_id: string }>).map((r) => r.group_id);
  }

  async getAllGroupsWithNames(): Promise<StoredGroup[]> {
    return this.db
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
    if (mediaType) {
      return this.db
        .select()
        .from(schema.messages)
        .where(eq(schema.messages.mediaType, mediaType))
        .orderBy(desc(schema.messages.timestamp))
        .limit(limit);
    }

    return this.db
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
    const conditions = [eq(schema.messages.groupId, groupId)];

    if (mediaType) {
      conditions.push(eq(schema.messages.mediaType, mediaType));
    } else {
      conditions.push(sql`${schema.messages.mediaType} IS NOT NULL`);
    }

    return this.db
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
    const sqlClient = getSqlClient();
    const results = await sqlClient`
      SELECT media_type, COUNT(*) as count 
      FROM messages 
      WHERE media_type IS NOT NULL 
      GROUP BY media_type
    `;

    type MediaCountRow = { media_type: string; count: string };
    const typedResults = results as unknown as MediaCountRow[];
    const imageCount = parseInt(typedResults.find((r) => r.media_type === 'image')?.count || '0');
    const audioCount = parseInt(typedResults.find((r) => r.media_type === 'audio')?.count || '0');
    const videoCount = parseInt(typedResults.find((r) => r.media_type === 'video')?.count || '0');
    const documentCount = parseInt(
      typedResults.find((r) => r.media_type === 'document')?.count || '0'
    );
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
    return this.db
      .select()
      .from(schema.messages)
      .where(eq(schema.messages.phone, phone))
      .orderBy(asc(schema.messages.timestamp))
      .limit(limit);
  }

  async deleteOldMessages(daysToKeep: number): Promise<number> {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - daysToKeep);

    const result = await this.db
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
    const results = await this.db
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
      displayName: r.displayName,
      notes: r.notes,
      createdAt: r.createdAt,
      updatedAt: r.updatedAt,
    };
  }

  async getAllChatPermissions(): Promise<ChatPermissionRecord[]> {
    const results = await this.db
      .select()
      .from(schema.chatPermissions)
      .orderBy(desc(schema.chatPermissions.updatedAt));

    return results.map((r) => ({
      chatId: r.chatId,
      chatType: r.chatType as ChatType,
      permission: r.permission as ChatPermission,
      displayName: r.displayName,
      notes: r.notes,
      createdAt: r.createdAt,
      updatedAt: r.updatedAt,
    }));
  }

  async getAllChatsWithPermissions(): Promise<ChatWithPermission[]> {
    const sqlClient = getSqlClient();
    const results = await sqlClient`
      SELECT 
        cp.chat_id as "chatId",
        cp.chat_type as "chatType",
        cp.permission,
        COALESCE(cp.display_name, g.group_name, g.group_subject) as "displayName",
        cp.notes,
        cp.created_at as "createdAt",
        cp.updated_at as "updatedAt",
        (SELECT COUNT(*) FROM messages m WHERE m.jid = cp.chat_id OR m.group_id = cp.chat_id) as "messageCount",
        (SELECT MAX(timestamp) FROM messages m WHERE m.jid = cp.chat_id OR m.group_id = cp.chat_id) as "lastMessageAt"
      FROM chat_permissions cp
      LEFT JOIN groups g ON cp.chat_id = g.group_id
      ORDER BY cp.updated_at DESC
    `;
    return results as unknown as ChatWithPermission[];
  }

  async getChatsWithoutPermissions(): Promise<ChatWithPermission[]> {
    const sqlClient = getSqlClient();

    // Find groups without permissions
    const groupsResult = await sqlClient`
      SELECT DISTINCT 
        m.group_id as "chatId",
        'group' as "chatType",
        NULL as permission,
        COALESCE(g.group_name, g.group_subject) as "displayName",
        NULL as notes,
        NULL as "createdAt",
        NULL as "updatedAt",
        COUNT(*) as "messageCount",
        MAX(m.timestamp) as "lastMessageAt"
      FROM messages m
      LEFT JOIN groups g ON m.group_id = g.group_id
      LEFT JOIN chat_permissions cp ON m.group_id = cp.chat_id
      WHERE m.is_group = true 
        AND m.group_id IS NOT NULL
        AND cp.chat_id IS NULL
      GROUP BY m.group_id, g.group_name, g.group_subject
    `;

    // Find individual chats without permissions
    const individualsResult = await sqlClient`
      SELECT DISTINCT 
        m.jid as "chatId",
        'individual' as "chatType",
        NULL as permission,
        m.phone as "displayName",
        NULL as notes,
        NULL as "createdAt",
        NULL as "updatedAt",
        COUNT(*) as "messageCount",
        MAX(m.timestamp) as "lastMessageAt"
      FROM messages m
      LEFT JOIN chat_permissions cp ON m.jid = cp.chat_id
      WHERE m.is_group = false
        AND cp.chat_id IS NULL
      GROUP BY m.jid, m.phone
    `;

    return [
      ...(groupsResult as unknown as ChatWithPermission[]),
      ...(individualsResult as unknown as ChatWithPermission[]),
    ];
  }

  async setChatPermission(
    chatId: string,
    chatType: ChatType,
    permission: ChatPermission,
    displayName?: string,
    notes?: string,
    changedBy?: string
  ): Promise<void> {
    const oldRecord = await this.getChatPermission(chatId);
    const oldPermission = oldRecord?.permission || null;

    await this.db
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
      await this.db.insert(schema.permissionAuditLog).values({
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
    const result = await this.db
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
    const oldRecord = await this.getChatPermission(chatId);

    const result = await this.db
      .delete(schema.chatPermissions)
      .where(eq(schema.chatPermissions.chatId, chatId))
      .returning({ chatId: schema.chatPermissions.chatId });

    if (result.length > 0 && oldRecord) {
      await this.db.insert(schema.permissionAuditLog).values({
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
    let query = this.db
      .select()
      .from(schema.permissionAuditLog)
      .orderBy(desc(schema.permissionAuditLog.changedAt))
      .limit(limit);

    if (chatId) {
      query = query.where(eq(schema.permissionAuditLog.chatId, chatId)) as typeof query;
    }

    const results = await query;
    return results.map((r) => ({
      id: r.id,
      chatId: r.chatId,
      oldPermission: r.oldPermission,
      newPermission: r.newPermission,
      changedBy: r.changedBy,
      changedAt: r.changedAt,
    }));
  }

  async getDashboardStats(): Promise<DashboardStats> {
    const sqlClient = getSqlClient();

    const [permissionCounts, typeCounts, totalMessages, chatsWithoutPerms] = await Promise.all([
      sqlClient`
        SELECT permission, COUNT(*) as count 
        FROM chat_permissions 
        GROUP BY permission
      `,
      sqlClient`
        SELECT chat_type, COUNT(*) as count 
        FROM chat_permissions 
        GROUP BY chat_type
      `,
      sqlClient`SELECT COUNT(*) as count FROM messages`,
      this.getChatsWithoutPermissions(),
    ]);

    type PermissionRow = { permission: string; count: string };
    type TypeRow = { chat_type: string; count: string };

    const typedPermissionCounts = permissionCounts as unknown as PermissionRow[];
    const typedTypeCounts = typeCounts as unknown as TypeRow[];

    return {
      totalChats: typedPermissionCounts.reduce((sum, p) => sum + parseInt(p.count), 0),
      byPermission: {
        ignored: parseInt(
          typedPermissionCounts.find((p) => p.permission === 'ignored')?.count || '0'
        ),
        read_only: parseInt(
          typedPermissionCounts.find((p) => p.permission === 'read_only')?.count || '0'
        ),
        read_write: parseInt(
          typedPermissionCounts.find((p) => p.permission === 'read_write')?.count || '0'
        ),
      },
      byType: {
        individual: parseInt(
          typedTypeCounts.find((t) => t.chat_type === 'individual')?.count || '0'
        ),
        group: parseInt(typedTypeCounts.find((t) => t.chat_type === 'group')?.count || '0'),
      },
      totalMessages: parseInt((totalMessages as unknown as Array<{ count: string }>)[0].count),
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
    const results = await this.db
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
      createdAt: r.createdAt,
    };
  }

  async getDashboardUserById(id: number): Promise<DashboardUser | undefined> {
    const results = await this.db
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
      createdAt: r.createdAt,
    };
  }

  async createDashboardUser(username: string, passwordHash: string): Promise<number> {
    const result = await this.db
      .insert(schema.dashboardUsers)
      .values({ username, passwordHash })
      .returning({ id: schema.dashboardUsers.id });

    logger.info('Created dashboard user', { username, id: result[0].id });
    return result[0].id;
  }

  async updateDashboardUserPassword(username: string, passwordHash: string): Promise<boolean> {
    const result = await this.db
      .update(schema.dashboardUsers)
      .set({ passwordHash })
      .where(eq(schema.dashboardUsers.username, username))
      .returning({ id: schema.dashboardUsers.id });

    return result.length > 0;
  }

  async deleteDashboardUser(username: string): Promise<boolean> {
    const result = await this.db
      .delete(schema.dashboardUsers)
      .where(eq(schema.dashboardUsers.username, username))
      .returning({ id: schema.dashboardUsers.id });

    if (result.length > 0) {
      logger.info('Deleted dashboard user', { username });
    }
    return result.length > 0;
  }

  async getAllDashboardUsers(): Promise<{ id: number; username: string; createdAt: string }[]> {
    const results = await this.db
      .select({
        id: schema.dashboardUsers.id,
        username: schema.dashboardUsers.username,
        createdAt: schema.dashboardUsers.createdAt,
      })
      .from(schema.dashboardUsers)
      .orderBy(desc(schema.dashboardUsers.createdAt));

    return results.map((r) => ({
      id: r.id,
      username: r.username,
      createdAt: r.createdAt?.toISOString() || '',
    }));
  }

  async hasDashboardUsers(): Promise<boolean> {
    const results = await this.db.select({ count: count() }).from(schema.dashboardUsers);

    return results[0].count > 0;
  }

  // ============================================
  // SYSTEM PROMPTS MANAGEMENT
  // ============================================

  async getSystemPrompt(
    platform: PromptPlatform,
    chatId: string
  ): Promise<SystemPromptRecord | undefined> {
    // First try specific chat
    let results = await this.db
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
        isActive: r.isActive,
        createdAt: r.createdAt,
        updatedAt: r.updatedAt,
      };
    }

    // Fall back to platform default
    results = await this.db
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
      isActive: r.isActive,
      createdAt: r.createdAt,
      updatedAt: r.updatedAt,
    };
  }

  async getSystemPromptText(platform: PromptPlatform, chatId: string): Promise<string | undefined> {
    const prompt = await this.getSystemPrompt(platform, chatId);
    return prompt?.promptText;
  }

  async getDefaultPrompt(platform: PromptPlatform): Promise<SystemPromptRecord | undefined> {
    const results = await this.db
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
      isActive: r.isActive,
      createdAt: r.createdAt,
      updatedAt: r.updatedAt,
    };
  }

  async setSystemPrompt(
    platform: PromptPlatform,
    chatId: string,
    promptText: string
  ): Promise<SystemPromptRecord> {
    const result = await this.db
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
      isActive: r.isActive,
      createdAt: r.createdAt,
      updatedAt: r.updatedAt,
    };
  }

  async deleteSystemPrompt(platform: PromptPlatform, chatId: string): Promise<boolean> {
    if (chatId === '*') {
      logger.warn('Cannot delete platform default prompt', { platform });
      return false;
    }

    const result = await this.db
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
    const sqlClient = getSqlClient();

    let results;
    if (platform) {
      results = await sqlClient`
        SELECT 
          sp.id,
          sp.chat_id as "chatId",
          sp.platform,
          sp.prompt_text as "promptText",
          sp.is_active as "isActive",
          sp.created_at as "createdAt",
          sp.updated_at as "updatedAt",
          COALESCE(g.group_name, cp.display_name) as "displayName",
          (sp.chat_id = '*') as "isDefault"
        FROM system_prompts sp
        LEFT JOIN groups g ON sp.chat_id = g.group_id
        LEFT JOIN chat_permissions cp ON sp.chat_id = cp.chat_id
        WHERE sp.platform = ${platform}
        ORDER BY 
          sp.chat_id = '*' DESC,
          sp.updated_at DESC
      `;
    } else {
      results = await sqlClient`
        SELECT 
          sp.id,
          sp.chat_id as "chatId",
          sp.platform,
          sp.prompt_text as "promptText",
          sp.is_active as "isActive",
          sp.created_at as "createdAt",
          sp.updated_at as "updatedAt",
          COALESCE(g.group_name, cp.display_name) as "displayName",
          (sp.chat_id = '*') as "isDefault"
        FROM system_prompts sp
        LEFT JOIN groups g ON sp.chat_id = g.group_id
        LEFT JOIN chat_permissions cp ON sp.chat_id = cp.chat_id
        ORDER BY 
          sp.platform ASC,
          sp.chat_id = '*' DESC,
          sp.updated_at DESC
      `;
    }

    return results as unknown as SystemPromptWithInfo[];
  }

  async getDefaultPrompts(): Promise<Record<PromptPlatform, SystemPromptRecord | null>> {
    const results = await this.db
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
        isActive: r.isActive,
        createdAt: r.createdAt,
        updatedAt: r.updatedAt,
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
}

/**
 * Create a MessageDatabase instance using Drizzle ORM
 */
export function createMessageDatabase(connectionString?: string): MessageDatabase {
  return new MessageDatabase(connectionString);
}
