/**
 * Message Database Service
 *
 * PostgreSQL database for storing and querying WhatsApp messages.
 * Stores all incoming and outgoing messages for searchability and history.
 */

import pg from 'pg';
import { createServiceLogger } from '@orient/core';
import {
  ChatPermission,
  ChatType,
  ChatPermissionRecord,
  PermissionAuditEntry,
  DashboardUser,
  ChatWithPermission,
  DashboardStats,
  PromptPlatform,
  SystemPromptRecord,
  SystemPromptWithInfo,
} from './types/index.js';

const { Pool } = pg;
const logger = createServiceLogger('message-db');

export interface StoredMessage {
  id: number;
  message_id: string;
  direction: 'incoming' | 'outgoing';
  jid: string;
  phone: string;
  text: string;
  is_group: boolean;
  group_id: string | null;
  timestamp: string;
  created_at: string;
  // Media fields
  media_type: string | null;
  media_path: string | null;
  media_mime_type: string | null;
  transcribed_text: string | null;
  transcribed_language: string | null;
}

export interface StoredGroup {
  group_id: string;
  group_name: string | null;
  group_subject: string | null;
  participant_count: number | null;
  last_updated: string;
}

export interface StoreMessageOptions {
  mediaType?: 'image' | 'audio' | 'video' | 'document';
  mediaPath?: string;
  mediaMimeType?: string;
  transcribedText?: string;
  transcribedLanguage?: string;
}

export interface MessageSearchOptions {
  phone?: string;
  text?: string;
  direction?: 'incoming' | 'outgoing';
  isGroup?: boolean;
  fromDate?: Date;
  toDate?: Date;
  limit?: number;
  offset?: number;
}

export interface MessageStats {
  totalMessages: number;
  incomingMessages: number;
  outgoingMessages: number;
  uniqueContacts: number;
  uniqueGroups: number;
  firstMessage: string | null;
  lastMessage: string | null;
}

export class MessageDatabase {
  private pool: pg.Pool;
  private initialized: boolean = false;

  constructor(connectionString?: string) {
    const dbUrl =
      connectionString ||
      process.env.DATABASE_URL ||
      'postgresql://aibot:aibot123@localhost:5432/whatsapp_bot_0';

    this.pool = new Pool({
      connectionString: dbUrl,
      max: 10,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 5000,
    });

    this.pool.on('error', (err: Error) => {
      logger.error('Unexpected database pool error', { error: err.message });
    });

    logger.info('Database pool created', { connectionString: dbUrl.replace(/:[^:@]+@/, ':****@') });
  }

  /**
   * Initialize the database (must be called before using)
   */
  async initialize(): Promise<void> {
    if (this.initialized) return;

    await this.initializeTables();
    this.initialized = true;
  }

  /**
   * Initialize database tables
   */
  private async initializeTables(): Promise<void> {
    const client = await this.pool.connect();

    try {
      await client.query('BEGIN');

      // Messages table
      await client.query(`
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
      `);

      // Groups table
      await client.query(`
        CREATE TABLE IF NOT EXISTS groups (
          group_id TEXT PRIMARY KEY,
          group_name TEXT,
          group_subject TEXT,
          participant_count INTEGER,
          last_updated TIMESTAMPTZ DEFAULT NOW()
        )
      `);

      // Chat permissions table
      await client.query(`
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
      `);

      // Permission audit log
      await client.query(`
        CREATE TABLE IF NOT EXISTS permission_audit_log (
          id SERIAL PRIMARY KEY,
          chat_id TEXT NOT NULL,
          old_permission TEXT,
          new_permission TEXT NOT NULL,
          changed_by TEXT,
          changed_at TIMESTAMPTZ DEFAULT NOW()
        )
      `);

      // Dashboard users
      await client.query(`
        CREATE TABLE IF NOT EXISTS dashboard_users (
          id SERIAL PRIMARY KEY,
          username TEXT UNIQUE NOT NULL,
          password_hash TEXT NOT NULL,
          created_at TIMESTAMPTZ DEFAULT NOW()
        )
      `);

      // System prompts table for per-chat custom prompts
      // chat_id = '*' means platform default
      await client.query(`
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
      `);

      // Health monitor state table for persisting pairing state across restarts
      await client.query(`
        CREATE TABLE IF NOT EXISTS health_monitor_state (
          key TEXT PRIMARY KEY,
          value TEXT NOT NULL,
          updated_at TIMESTAMPTZ DEFAULT NOW()
        )
      `);

      // Workspace onboarding tracking
      await client.query(`
        CREATE TABLE IF NOT EXISTS workspace_onboarding (
          id SERIAL PRIMARY KEY,
          onboarding_type TEXT NOT NULL UNIQUE,
          completed_at TIMESTAMPTZ DEFAULT NOW(),
          triggered_by TEXT,
          metadata JSONB
        )
      `);

      // Create indexes
      await client.query(`
        CREATE INDEX IF NOT EXISTS idx_messages_phone ON messages(phone);
        CREATE INDEX IF NOT EXISTS idx_messages_timestamp ON messages(timestamp);
        CREATE INDEX IF NOT EXISTS idx_messages_direction ON messages(direction);
        CREATE INDEX IF NOT EXISTS idx_messages_is_group ON messages(is_group);
        CREATE INDEX IF NOT EXISTS idx_messages_group_id ON messages(group_id);
        CREATE INDEX IF NOT EXISTS idx_messages_media_type ON messages(media_type);
        CREATE INDEX IF NOT EXISTS idx_groups_name ON groups(group_name);
        CREATE INDEX IF NOT EXISTS idx_groups_subject ON groups(group_subject);
        CREATE INDEX IF NOT EXISTS idx_chat_permissions_type ON chat_permissions(chat_type);
        CREATE INDEX IF NOT EXISTS idx_chat_permissions_permission ON chat_permissions(permission);
        CREATE INDEX IF NOT EXISTS idx_permission_audit_chat ON permission_audit_log(chat_id);
        CREATE INDEX IF NOT EXISTS idx_permission_audit_time ON permission_audit_log(changed_at);
        CREATE INDEX IF NOT EXISTS idx_system_prompts_lookup ON system_prompts(platform, chat_id);
        CREATE INDEX IF NOT EXISTS idx_system_prompts_platform ON system_prompts(platform);
        CREATE INDEX IF NOT EXISTS idx_onboarding_type ON workspace_onboarding(onboarding_type);
      `);

      // Create full-text search index on messages (PostgreSQL native)
      await client.query(`
        CREATE INDEX IF NOT EXISTS idx_messages_text_search 
        ON messages USING gin(to_tsvector('english', text))
      `);

      await client.query('COMMIT');
      logger.info('Database tables initialized');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Store an incoming message
   */
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

  /**
   * Store an outgoing message
   */
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

  /**
   * Store a message in the database
   */
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
    const result = await this.pool.query(
      `
      INSERT INTO messages (
        message_id, direction, jid, phone, text, is_group, group_id, timestamp,
        media_type, media_path, media_mime_type, transcribed_text, transcribed_language
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
      ON CONFLICT (message_id) DO NOTHING
      RETURNING id
    `,
      [
        messageId,
        direction,
        jid,
        phone,
        text,
        isGroup,
        groupId || null,
        timestamp.toISOString(),
        options?.mediaType || null,
        options?.mediaPath || null,
        options?.mediaMimeType || null,
        options?.transcribedText || null,
        options?.transcribedLanguage || null,
      ]
    );

    if (result.rows.length > 0) {
      logger.debug('Stored message', {
        direction,
        phone,
        messageId,
        isGroup,
        hasMedia: !!options?.mediaType,
      });
      return result.rows[0].id;
    }

    return 0;
  }

  /**
   * Store a historical message from history sync
   */
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

  /**
   * Search messages with various filters
   */
  async searchMessages(options: MessageSearchOptions = {}): Promise<StoredMessage[]> {
    const conditions: string[] = [];
    const params: any[] = [];
    let paramIndex = 1;

    if (options.phone) {
      conditions.push(`phone = $${paramIndex++}`);
      params.push(options.phone);
    }

    if (options.direction) {
      conditions.push(`direction = $${paramIndex++}`);
      params.push(options.direction);
    }

    if (options.isGroup !== undefined) {
      conditions.push(`is_group = $${paramIndex++}`);
      params.push(options.isGroup);
    }

    if (options.fromDate) {
      conditions.push(`timestamp >= $${paramIndex++}`);
      params.push(options.fromDate.toISOString());
    }

    if (options.toDate) {
      conditions.push(`timestamp <= $${paramIndex++}`);
      params.push(options.toDate.toISOString());
    }

    if (options.text) {
      conditions.push(
        `to_tsvector('english', text) @@ plainto_tsquery('english', $${paramIndex++})`
      );
      params.push(options.text);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const limit = options.limit || 100;
    const offset = options.offset || 0;

    params.push(limit, offset);

    const result = await this.pool.query(
      `
      SELECT * FROM messages 
      ${whereClause}
      ORDER BY timestamp DESC
      LIMIT $${paramIndex++} OFFSET $${paramIndex++}
    `,
      params
    );

    return result.rows;
  }

  /**
   * Full-text search across all messages
   */
  async fullTextSearch(searchTerm: string, limit: number = 50): Promise<StoredMessage[]> {
    const result = await this.pool.query(
      `
      SELECT * FROM messages
      WHERE to_tsvector('english', text) @@ plainto_tsquery('english', $1)
      ORDER BY timestamp DESC
      LIMIT $2
    `,
      [searchTerm, limit]
    );

    return result.rows;
  }

  /**
   * Get recent messages
   */
  async getRecentMessages(limit: number = 50): Promise<StoredMessage[]> {
    const result = await this.pool.query(
      `
      SELECT * FROM messages
      ORDER BY timestamp DESC
      LIMIT $1
    `,
      [limit]
    );

    return result.rows;
  }

  /**
   * Get messages from a specific contact
   */
  async getMessagesByPhone(phone: string, limit: number = 100): Promise<StoredMessage[]> {
    const result = await this.pool.query(
      `
      SELECT * FROM messages
      WHERE phone = $1
      ORDER BY timestamp DESC
      LIMIT $2
    `,
      [phone, limit]
    );

    return result.rows;
  }

  /**
   * Get messages from a specific group
   */
  async getMessagesByGroup(groupId: string, limit: number = 100): Promise<StoredMessage[]> {
    const result = await this.pool.query(
      `
      SELECT * FROM messages
      WHERE group_id = $1
      ORDER BY timestamp DESC
      LIMIT $2
    `,
      [groupId, limit]
    );

    return result.rows;
  }

  /**
   * Get messages from a specific date range
   */
  async getMessagesByDateRange(
    fromDate: Date,
    toDate: Date,
    limit: number = 500
  ): Promise<StoredMessage[]> {
    const result = await this.pool.query(
      `
      SELECT * FROM messages
      WHERE timestamp >= $1 AND timestamp <= $2
      ORDER BY timestamp DESC
      LIMIT $3
    `,
      [fromDate.toISOString(), toDate.toISOString(), limit]
    );

    return result.rows;
  }

  /**
   * Get message by ID
   */
  async getMessageById(messageId: string): Promise<StoredMessage | undefined> {
    const result = await this.pool.query(
      `
      SELECT * FROM messages WHERE message_id = $1
    `,
      [messageId]
    );

    return result.rows[0];
  }

  /**
   * Get database statistics
   */
  async getStats(): Promise<MessageStats> {
    const [total, incoming, outgoing, contacts, groups, first, last] = await Promise.all([
      this.pool.query('SELECT COUNT(*) as count FROM messages'),
      this.pool.query("SELECT COUNT(*) as count FROM messages WHERE direction = 'incoming'"),
      this.pool.query("SELECT COUNT(*) as count FROM messages WHERE direction = 'outgoing'"),
      this.pool.query('SELECT COUNT(DISTINCT phone) as count FROM messages'),
      this.pool.query(
        'SELECT COUNT(DISTINCT group_id) as count FROM messages WHERE is_group = true'
      ),
      this.pool.query('SELECT MIN(timestamp) as ts FROM messages'),
      this.pool.query('SELECT MAX(timestamp) as ts FROM messages'),
    ]);

    return {
      totalMessages: parseInt(total.rows[0].count),
      incomingMessages: parseInt(incoming.rows[0].count),
      outgoingMessages: parseInt(outgoing.rows[0].count),
      uniqueContacts: parseInt(contacts.rows[0].count),
      uniqueGroups: parseInt(groups.rows[0].count),
      firstMessage: first.rows[0]?.ts?.toISOString() || null,
      lastMessage: last.rows[0]?.ts?.toISOString() || null,
    };
  }

  /**
   * Get all unique contacts/phones
   */
  async getUniqueContacts(): Promise<string[]> {
    const result = await this.pool.query(`
      SELECT DISTINCT phone FROM messages ORDER BY phone
    `);
    return result.rows.map((row: { phone: string }) => row.phone);
  }

  /**
   * Get all unique groups
   */
  async getUniqueGroups(): Promise<string[]> {
    const result = await this.pool.query(`
      SELECT DISTINCT group_id FROM messages 
      WHERE is_group = true AND group_id IS NOT NULL 
      ORDER BY group_id
    `);
    return result.rows.map((row: { group_id: string }) => row.group_id);
  }

  // ============================================
  // GROUP METADATA MANAGEMENT
  // ============================================

  /**
   * Store or update group metadata
   */
  async upsertGroup(
    groupId: string,
    name?: string,
    subject?: string,
    participantCount?: number
  ): Promise<void> {
    await this.pool.query(
      `
      INSERT INTO groups (group_id, group_name, group_subject, participant_count, last_updated)
      VALUES ($1, $2, $3, $4, NOW())
      ON CONFLICT (group_id) DO UPDATE SET
        group_name = COALESCE($2, groups.group_name),
        group_subject = COALESCE($3, groups.group_subject),
        participant_count = COALESCE($4, groups.participant_count),
        last_updated = NOW()
    `,
      [groupId, name || null, subject || null, participantCount || null]
    );

    logger.debug('Upserted group metadata', { groupId, name, subject });
  }

  /**
   * Get group by ID
   */
  async getGroup(groupId: string): Promise<StoredGroup | undefined> {
    const result = await this.pool.query(
      `
      SELECT * FROM groups WHERE group_id = $1
    `,
      [groupId]
    );
    return result.rows[0];
  }

  /**
   * Get all stored groups with metadata
   */
  async getAllGroups(): Promise<StoredGroup[]> {
    const result = await this.pool.query(`
      SELECT * FROM groups ORDER BY last_updated DESC
    `);
    return result.rows;
  }

  /**
   * Search groups by name or subject
   */
  async searchGroups(searchTerm: string): Promise<StoredGroup[]> {
    const result = await this.pool.query(
      `
      SELECT * FROM groups 
      WHERE group_name ILIKE $1 OR group_subject ILIKE $1
      ORDER BY last_updated DESC
    `,
      [`%${searchTerm}%`]
    );
    return result.rows;
  }

  /**
   * Find group by name
   */
  async findGroupByName(name: string): Promise<StoredGroup | undefined> {
    const groups = await this.searchGroups(name);
    return groups.length > 0 ? groups[0] : undefined;
  }

  /**
   * Get group IDs that have messages but no metadata
   */
  async getGroupsWithoutNames(): Promise<string[]> {
    const result = await this.pool.query(`
      SELECT DISTINCT m.group_id
      FROM messages m
      WHERE m.is_group = true 
        AND m.group_id IS NOT NULL
        AND m.group_id NOT IN (
          SELECT g.group_id FROM groups g WHERE g.group_name IS NOT NULL
        )
    `);
    return result.rows.map((row: { group_id: string }) => row.group_id);
  }

  /**
   * Get all groups that have names stored
   */
  async getAllGroupsWithNames(): Promise<StoredGroup[]> {
    const result = await this.pool.query(`
      SELECT * FROM groups 
      WHERE group_name IS NOT NULL AND group_name != ''
      ORDER BY last_updated DESC
    `);
    return result.rows;
  }

  // ============================================
  // MEDIA MESSAGE QUERIES
  // ============================================

  async getMediaMessages(limit: number = 50, mediaType?: string): Promise<StoredMessage[]> {
    if (mediaType) {
      const result = await this.pool.query(
        `
        SELECT * FROM messages
        WHERE media_type = $1
        ORDER BY timestamp DESC
        LIMIT $2
      `,
        [mediaType, limit]
      );
      return result.rows;
    }

    const result = await this.pool.query(
      `
      SELECT * FROM messages
      WHERE media_type IS NOT NULL
      ORDER BY timestamp DESC
      LIMIT $1
    `,
      [limit]
    );
    return result.rows;
  }

  async getMediaMessagesByGroup(
    groupId: string,
    limit: number = 50,
    mediaType?: string
  ): Promise<StoredMessage[]> {
    if (mediaType) {
      const result = await this.pool.query(
        `
        SELECT * FROM messages
        WHERE group_id = $1 AND media_type = $2
        ORDER BY timestamp DESC
        LIMIT $3
      `,
        [groupId, mediaType, limit]
      );
      return result.rows;
    }

    const result = await this.pool.query(
      `
      SELECT * FROM messages
      WHERE group_id = $1 AND media_type IS NOT NULL
      ORDER BY timestamp DESC
      LIMIT $2
    `,
      [groupId, limit]
    );
    return result.rows;
  }

  async getImageMessages(limit: number = 50): Promise<StoredMessage[]> {
    return this.getMediaMessages(limit, 'image');
  }

  async getVoiceMessages(limit: number = 50): Promise<StoredMessage[]> {
    return this.getMediaMessages(limit, 'audio');
  }

  async getMediaStats(): Promise<{
    imageCount: number;
    audioCount: number;
    videoCount: number;
    documentCount: number;
  }> {
    const result = await this.pool.query(`
      SELECT media_type, COUNT(*) as count 
      FROM messages 
      WHERE media_type IS NOT NULL 
      GROUP BY media_type
    `);

    type MediaCountRow = { media_type: string; count: string };
    return {
      imageCount: parseInt(
        result.rows.find((r: MediaCountRow) => r.media_type === 'image')?.count || '0'
      ),
      audioCount: parseInt(
        result.rows.find((r: MediaCountRow) => r.media_type === 'audio')?.count || '0'
      ),
      videoCount: parseInt(
        result.rows.find((r: MediaCountRow) => r.media_type === 'video')?.count || '0'
      ),
      documentCount: parseInt(
        result.rows.find((r: MediaCountRow) => r.media_type === 'document')?.count || '0'
      ),
    };
  }

  async getConversationHistory(phone: string, limit: number = 100): Promise<StoredMessage[]> {
    const result = await this.pool.query(
      `
      SELECT * FROM messages
      WHERE phone = $1
      ORDER BY timestamp ASC
      LIMIT $2
    `,
      [phone, limit]
    );
    return result.rows;
  }

  async deleteOldMessages(daysToKeep: number): Promise<number> {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - daysToKeep);

    const result = await this.pool.query(
      `
      DELETE FROM messages WHERE timestamp < $1
    `,
      [cutoffDate.toISOString()]
    );

    const deleted = result.rowCount || 0;
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
    const result = await this.pool.query(
      `
      SELECT 
        chat_id as "chatId",
        chat_type as "chatType",
        permission,
        display_name as "displayName",
        notes,
        created_at as "createdAt",
        updated_at as "updatedAt"
      FROM chat_permissions 
      WHERE chat_id = $1
    `,
      [chatId]
    );
    return result.rows[0];
  }

  async getAllChatPermissions(): Promise<ChatPermissionRecord[]> {
    const result = await this.pool.query(`
      SELECT 
        chat_id as "chatId",
        chat_type as "chatType",
        permission,
        display_name as "displayName",
        notes,
        created_at as "createdAt",
        updated_at as "updatedAt"
      FROM chat_permissions 
      ORDER BY updated_at DESC
    `);
    return result.rows;
  }

  async getAllChatsWithPermissions(): Promise<ChatWithPermission[]> {
    const result = await this.pool.query(`
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
    `);
    return result.rows;
  }

  async getChatsWithoutPermissions(): Promise<ChatWithPermission[]> {
    // Find groups without permissions
    const groupsResult = await this.pool.query(`
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
    `);

    // Find individual chats without permissions
    const individualsResult = await this.pool.query(`
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
    `);

    return [...groupsResult.rows, ...individualsResult.rows];
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

    await this.pool.query(
      `
      INSERT INTO chat_permissions (chat_id, chat_type, permission, display_name, notes, created_at, updated_at)
      VALUES ($1, $2, $3, $4, $5, NOW(), NOW())
      ON CONFLICT (chat_id) DO UPDATE SET
        permission = EXCLUDED.permission,
        display_name = COALESCE(EXCLUDED.display_name, chat_permissions.display_name),
        notes = COALESCE(EXCLUDED.notes, chat_permissions.notes),
        updated_at = NOW()
    `,
      [chatId, chatType, permission, displayName || null, notes || null]
    );

    if (oldPermission !== permission) {
      await this.pool.query(
        `
        INSERT INTO permission_audit_log (chat_id, old_permission, new_permission, changed_by)
        VALUES ($1, $2, $3, $4)
      `,
        [chatId, oldPermission, permission, changedBy || null]
      );

      logger.info('Chat permission updated', {
        chatId,
        oldPermission,
        newPermission: permission,
        changedBy,
      });
    }
  }

  async updateChatDetails(chatId: string, displayName?: string, notes?: string): Promise<boolean> {
    const result = await this.pool.query(
      `
      UPDATE chat_permissions 
      SET 
        display_name = COALESCE($1, display_name),
        notes = COALESCE($2, notes),
        updated_at = NOW()
      WHERE chat_id = $3
    `,
      [displayName || null, notes || null, chatId]
    );
    return (result.rowCount || 0) > 0;
  }

  async deleteChatPermission(chatId: string, changedBy?: string): Promise<boolean> {
    const oldRecord = await this.getChatPermission(chatId);

    const result = await this.pool.query(`DELETE FROM chat_permissions WHERE chat_id = $1`, [
      chatId,
    ]);

    if ((result.rowCount || 0) > 0 && oldRecord) {
      await this.pool.query(
        `
        INSERT INTO permission_audit_log (chat_id, old_permission, new_permission, changed_by)
        VALUES ($1, $2, 'deleted', $3)
      `,
        [chatId, oldRecord.permission, changedBy || null]
      );

      logger.info('Chat permission deleted', { chatId, changedBy });
    }

    return (result.rowCount || 0) > 0;
  }

  async getPermissionAuditLog(
    limit: number = 100,
    chatId?: string
  ): Promise<PermissionAuditEntry[]> {
    if (chatId) {
      const result = await this.pool.query(
        `
        SELECT 
          id,
          chat_id as "chatId",
          old_permission as "oldPermission",
          new_permission as "newPermission",
          changed_by as "changedBy",
          changed_at as "changedAt"
        FROM permission_audit_log 
        WHERE chat_id = $1
        ORDER BY changed_at DESC
        LIMIT $2
      `,
        [chatId, limit]
      );
      return result.rows;
    }

    const result = await this.pool.query(
      `
      SELECT 
        id,
        chat_id as "chatId",
        old_permission as "oldPermission",
        new_permission as "newPermission",
        changed_by as "changedBy",
        changed_at as "changedAt"
      FROM permission_audit_log 
      ORDER BY changed_at DESC
      LIMIT $1
    `,
      [limit]
    );
    return result.rows;
  }

  async getDashboardStats(): Promise<DashboardStats> {
    const [permissionCounts, typeCounts, totalMessages, chatsWithoutPerms] = await Promise.all([
      this.pool.query(`
        SELECT permission, COUNT(*) as count 
        FROM chat_permissions 
        GROUP BY permission
      `),
      this.pool.query(`
        SELECT chat_type, COUNT(*) as count 
        FROM chat_permissions 
        GROUP BY chat_type
      `),
      this.pool.query(`SELECT COUNT(*) as count FROM messages`),
      this.getChatsWithoutPermissions(),
    ]);

    type PermissionRow = { permission: string; count: string };
    type TypeRow = { chat_type: string; count: string };

    return {
      totalChats: permissionCounts.rows.reduce(
        (sum: number, p: PermissionRow) => sum + parseInt(p.count),
        0
      ),
      byPermission: {
        ignored: parseInt(
          permissionCounts.rows.find((p: PermissionRow) => p.permission === 'ignored')?.count || '0'
        ),
        read_only: parseInt(
          permissionCounts.rows.find((p: PermissionRow) => p.permission === 'read_only')?.count ||
            '0'
        ),
        read_write: parseInt(
          permissionCounts.rows.find((p: PermissionRow) => p.permission === 'read_write')?.count ||
            '0'
        ),
      },
      byType: {
        individual: parseInt(
          typeCounts.rows.find((t: TypeRow) => t.chat_type === 'individual')?.count || '0'
        ),
        group: parseInt(
          typeCounts.rows.find((t: TypeRow) => t.chat_type === 'group')?.count || '0'
        ),
      },
      totalMessages: parseInt(totalMessages.rows[0].count),
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
        const displayName = group?.group_name || group?.group_subject || undefined;

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
    const result = await this.pool.query(
      `
      SELECT
        id,
        username,
        password_hash as "passwordHash",
        google_id as "googleId",
        google_email as "googleEmail",
        auth_method as "authMethod",
        created_at as "createdAt"
      FROM dashboard_users
      WHERE username = $1
    `,
      [username]
    );
    return result.rows[0];
  }

  async getDashboardUserById(id: number): Promise<DashboardUser | undefined> {
    const result = await this.pool.query(
      `
      SELECT
        id,
        username,
        password_hash as "passwordHash",
        google_id as "googleId",
        google_email as "googleEmail",
        auth_method as "authMethod",
        created_at as "createdAt"
      FROM dashboard_users
      WHERE id = $1
    `,
      [id]
    );
    return result.rows[0];
  }

  async getDashboardUserByGoogleId(googleId: string): Promise<DashboardUser | undefined> {
    const result = await this.pool.query(
      `
      SELECT
        id,
        username,
        password_hash as "passwordHash",
        google_id as "googleId",
        google_email as "googleEmail",
        auth_method as "authMethod",
        created_at as "createdAt"
      FROM dashboard_users
      WHERE google_id = $1
    `,
      [googleId]
    );
    return result.rows[0];
  }

  async getDashboardUserByEmail(email: string): Promise<DashboardUser | undefined> {
    const result = await this.pool.query(
      `
      SELECT
        id,
        username,
        password_hash as "passwordHash",
        google_id as "googleId",
        google_email as "googleEmail",
        auth_method as "authMethod",
        created_at as "createdAt"
      FROM dashboard_users
      WHERE username = $1
    `,
      [email]
    );
    return result.rows[0];
  }

  async linkGoogleAccount(userId: number, googleId: string, googleEmail: string): Promise<boolean> {
    const result = await this.pool.query(
      `
      UPDATE dashboard_users
      SET google_id = $1, google_email = $2, auth_method = 'both'
      WHERE id = $3
    `,
      [googleId, googleEmail, userId]
    );
    logger.info('Linked Google account to dashboard user', { userId, googleEmail });
    return (result.rowCount || 0) > 0;
  }

  async createDashboardUserWithGoogle(googleId: string, email: string): Promise<number> {
    const result = await this.pool.query(
      `
      INSERT INTO dashboard_users (username, password_hash, google_id, google_email, auth_method)
      VALUES ($1, NULL, $2, $3, 'google')
      RETURNING id
    `,
      [email, googleId, email]
    );
    logger.info('Created dashboard user with Google', { email, id: result.rows[0].id });
    return result.rows[0].id;
  }

  async createDashboardUser(username: string, passwordHash: string): Promise<number> {
    const result = await this.pool.query(
      `
      INSERT INTO dashboard_users (username, password_hash)
      VALUES ($1, $2)
      RETURNING id
    `,
      [username, passwordHash]
    );
    logger.info('Created dashboard user', { username, id: result.rows[0].id });
    return result.rows[0].id;
  }

  async updateDashboardUserPassword(username: string, passwordHash: string): Promise<boolean> {
    const result = await this.pool.query(
      `
      UPDATE dashboard_users 
      SET password_hash = $1
      WHERE username = $2
    `,
      [passwordHash, username]
    );
    return (result.rowCount || 0) > 0;
  }

  async deleteDashboardUser(username: string): Promise<boolean> {
    const result = await this.pool.query(`DELETE FROM dashboard_users WHERE username = $1`, [
      username,
    ]);
    if ((result.rowCount || 0) > 0) {
      logger.info('Deleted dashboard user', { username });
    }
    return (result.rowCount || 0) > 0;
  }

  async getAllDashboardUsers(): Promise<{ id: number; username: string; createdAt: string }[]> {
    const result = await this.pool.query(`
      SELECT id, username, created_at as "createdAt"
      FROM dashboard_users 
      ORDER BY created_at DESC
    `);
    return result.rows;
  }

  async hasDashboardUsers(): Promise<boolean> {
    const result = await this.pool.query(`SELECT COUNT(*) as count FROM dashboard_users`);
    return parseInt(result.rows[0].count) > 0;
  }

  // ============================================
  // SYSTEM PROMPTS MANAGEMENT
  // ============================================

  /**
   * Get system prompt for a specific chat/channel
   * Returns custom prompt if set, otherwise returns platform default (chat_id = '*')
   */
  async getSystemPrompt(
    platform: PromptPlatform,
    chatId: string
  ): Promise<SystemPromptRecord | undefined> {
    // First try to get the specific chat prompt
    const specificResult = await this.pool.query(
      `
      SELECT 
        id,
        chat_id as "chatId",
        platform,
        prompt_text as "promptText",
        is_active as "isActive",
        created_at as "createdAt",
        updated_at as "updatedAt"
      FROM system_prompts 
      WHERE platform = $1 AND chat_id = $2 AND is_active = true
    `,
      [platform, chatId]
    );

    if (specificResult.rows.length > 0) {
      return specificResult.rows[0];
    }

    // Fall back to platform default
    const defaultResult = await this.pool.query(
      `
      SELECT 
        id,
        chat_id as "chatId",
        platform,
        prompt_text as "promptText",
        is_active as "isActive",
        created_at as "createdAt",
        updated_at as "updatedAt"
      FROM system_prompts 
      WHERE platform = $1 AND chat_id = '*' AND is_active = true
    `,
      [platform]
    );

    return defaultResult.rows[0];
  }

  /**
   * Get system prompt text for a chat (convenience method)
   * Returns undefined if no prompt is set
   */
  async getSystemPromptText(platform: PromptPlatform, chatId: string): Promise<string | undefined> {
    const prompt = await this.getSystemPrompt(platform, chatId);
    return prompt?.promptText;
  }

  /**
   * Get the default prompt for a platform
   */
  async getDefaultPrompt(platform: PromptPlatform): Promise<SystemPromptRecord | undefined> {
    const result = await this.pool.query(
      `
      SELECT 
        id,
        chat_id as "chatId",
        platform,
        prompt_text as "promptText",
        is_active as "isActive",
        created_at as "createdAt",
        updated_at as "updatedAt"
      FROM system_prompts 
      WHERE platform = $1 AND chat_id = '*'
    `,
      [platform]
    );
    return result.rows[0];
  }

  /**
   * Set or update system prompt for a chat/channel
   * Use chatId = '*' for platform default
   */
  async setSystemPrompt(
    platform: PromptPlatform,
    chatId: string,
    promptText: string
  ): Promise<SystemPromptRecord> {
    const result = await this.pool.query(
      `
      INSERT INTO system_prompts (chat_id, platform, prompt_text, updated_at)
      VALUES ($1, $2, $3, NOW())
      ON CONFLICT (chat_id, platform) DO UPDATE SET
        prompt_text = EXCLUDED.prompt_text,
        is_active = true,
        updated_at = NOW()
      RETURNING
        id,
        chat_id as "chatId",
        platform,
        prompt_text as "promptText",
        is_active as "isActive",
        created_at as "createdAt",
        updated_at as "updatedAt"
    `,
      [chatId, platform, promptText]
    );

    logger.info('System prompt updated', { platform, chatId, promptLength: promptText.length });
    return result.rows[0];
  }

  /**
   * Delete a custom prompt (chat reverts to platform default)
   * Cannot delete the platform default prompt
   */
  async deleteSystemPrompt(platform: PromptPlatform, chatId: string): Promise<boolean> {
    if (chatId === '*') {
      logger.warn('Cannot delete platform default prompt', { platform });
      return false;
    }

    const result = await this.pool.query(
      `
      DELETE FROM system_prompts 
      WHERE platform = $1 AND chat_id = $2
    `,
      [platform, chatId]
    );

    if ((result.rowCount || 0) > 0) {
      logger.info('System prompt deleted', { platform, chatId });
      return true;
    }
    return false;
  }

  /**
   * List all system prompts, optionally filtered by platform
   */
  async listSystemPrompts(platform?: PromptPlatform): Promise<SystemPromptWithInfo[]> {
    let query: string;
    let params: (string | undefined)[];

    if (platform) {
      query = `
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
        WHERE sp.platform = $1
        ORDER BY 
          sp.chat_id = '*' DESC,
          sp.updated_at DESC
      `;
      params = [platform];
    } else {
      query = `
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
      params = [];
    }

    const result = await this.pool.query(query, params);
    return result.rows;
  }

  /**
   * Get all default prompts for both platforms
   */
  async getDefaultPrompts(): Promise<Record<PromptPlatform, SystemPromptRecord | null>> {
    const result = await this.pool.query(`
      SELECT 
        id,
        chat_id as "chatId",
        platform,
        prompt_text as "promptText",
        is_active as "isActive",
        created_at as "createdAt",
        updated_at as "updatedAt"
      FROM system_prompts 
      WHERE chat_id = '*'
    `);

    const defaults: Record<PromptPlatform, SystemPromptRecord | null> = {
      whatsapp: null,
      slack: null,
    };

    for (const row of result.rows) {
      defaults[row.platform as PromptPlatform] = row;
    }

    return defaults;
  }

  /**
   * Seed default prompts if they don't exist
   */
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

  // ============================================
  // HEALTH MONITOR STATE
  // ============================================

  /**
   * Get a health monitor state value
   */
  async getHealthMonitorState(key: string): Promise<string | null> {
    const result = await this.pool.query('SELECT value FROM health_monitor_state WHERE key = $1', [
      key,
    ]);
    return result.rows.length > 0 ? result.rows[0].value : null;
  }

  /**
   * Set a health monitor state value
   */
  async setHealthMonitorState(key: string, value: string): Promise<void> {
    await this.pool.query(
      `INSERT INTO health_monitor_state (key, value, updated_at) 
       VALUES ($1, $2, NOW()) 
       ON CONFLICT (key) DO UPDATE SET value = $2, updated_at = NOW()`,
      [key, value]
    );
  }

  /**
   * Delete a health monitor state value
   */
  async deleteHealthMonitorState(key: string): Promise<void> {
    await this.pool.query('DELETE FROM health_monitor_state WHERE key = $1', [key]);
  }

  /**
   * Get all health monitor state values
   */
  async getAllHealthMonitorState(): Promise<Record<string, string>> {
    const result = await this.pool.query('SELECT key, value FROM health_monitor_state');
    const state: Record<string, string> = {};
    for (const row of result.rows) {
      state[row.key] = row.value;
    }
    return state;
  }

  // ============================================
  // ONBOARDING TRACKING
  // ============================================

  /**
   * Check if onboarding has been completed for a given type
   */
  async checkOnboardingCompleted(type: string): Promise<boolean> {
    const result = await this.pool.query(
      'SELECT 1 FROM workspace_onboarding WHERE onboarding_type = $1',
      [type]
    );
    return result.rows.length > 0;
  }

  /**
   * Mark onboarding as completed for a given type
   */
  async markOnboardingCompleted(
    type: string,
    triggeredBy: string,
    metadata: Record<string, any>
  ): Promise<void> {
    await this.pool.query(
      `INSERT INTO workspace_onboarding (onboarding_type, triggered_by, metadata)
       VALUES ($1, $2, $3)
       ON CONFLICT (onboarding_type) DO NOTHING`,
      [type, triggeredBy, JSON.stringify(metadata)]
    );
    logger.info('Onboarding completed', { type, triggeredBy });
  }

  /**
   * Close the database connection pool
   */
  async close(): Promise<void> {
    await this.pool.end();
    logger.info('Database connection pool closed');
  }
}

/**
 * Create a MessageDatabase instance
 */
export function createMessageDatabase(connectionString?: string): MessageDatabase {
  return new MessageDatabase(connectionString);
}
