/**
 * Slack Database Service
 *
 * PostgreSQL database for storing and querying Slack messages.
 * Stores all incoming and outgoing messages for searchability and history.
 * Follows the same patterns as messageDatabase.ts for WhatsApp.
 */

import pg from 'pg';
import { createServiceLogger } from '@orient/core';
import {
  SlackChannelType,
  SlackChannelPermission,
  StoredSlackMessage,
  StoredSlackChannel,
  StoredSlackChannelPermission,
  SlackMessageSearchOptions,
  SlackMessageStats,
  SlackDashboardStats,
  SlackChannelWithPermission,
  StoreSlackMessageOptions,
} from '../types/slack.js';

const { Pool } = pg;
const logger = createServiceLogger('slack-db');

export class SlackDatabase {
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

    logger.info('Slack database pool created', {
      connectionString: dbUrl.replace(/:[^:@]+@/, ':****@'),
    });
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
   * Initialize database tables for Slack
   */
  private async initializeTables(): Promise<void> {
    const client = await this.pool.connect();

    try {
      await client.query('BEGIN');

      // Slack messages table
      await client.query(`
        CREATE TABLE IF NOT EXISTS slack_messages (
          id SERIAL PRIMARY KEY,
          message_id TEXT UNIQUE,
          channel_id TEXT NOT NULL,
          thread_ts TEXT,
          user_id TEXT NOT NULL,
          user_name TEXT,
          text TEXT NOT NULL,
          direction TEXT NOT NULL CHECK (direction IN ('incoming', 'outgoing')),
          timestamp TIMESTAMPTZ NOT NULL,
          created_at TIMESTAMPTZ DEFAULT NOW(),
          has_files BOOLEAN DEFAULT FALSE,
          file_types TEXT[]
        )
      `);

      // Slack channels table
      await client.query(`
        CREATE TABLE IF NOT EXISTS slack_channels (
          channel_id TEXT PRIMARY KEY,
          channel_name TEXT,
          channel_type TEXT CHECK (channel_type IN ('channel', 'dm', 'group_dm', 'private')),
          is_member BOOLEAN DEFAULT TRUE,
          last_updated TIMESTAMPTZ DEFAULT NOW()
        )
      `);

      // Slack channel permissions table
      await client.query(`
        CREATE TABLE IF NOT EXISTS slack_channel_permissions (
          channel_id TEXT PRIMARY KEY,
          permission TEXT NOT NULL DEFAULT 'read_only'
            CHECK (permission IN ('ignored', 'read_only', 'read_write')),
          respond_to_mentions BOOLEAN DEFAULT TRUE,
          respond_to_dms BOOLEAN DEFAULT TRUE,
          notes TEXT,
          created_at TIMESTAMPTZ DEFAULT NOW(),
          updated_at TIMESTAMPTZ DEFAULT NOW()
        )
      `);

      // Slack permission audit log
      await client.query(`
        CREATE TABLE IF NOT EXISTS slack_permission_audit_log (
          id SERIAL PRIMARY KEY,
          channel_id TEXT NOT NULL,
          old_permission TEXT,
          new_permission TEXT NOT NULL,
          changed_by TEXT,
          changed_at TIMESTAMPTZ DEFAULT NOW()
        )
      `);

      // Create indexes
      await client.query(`
        CREATE INDEX IF NOT EXISTS idx_slack_messages_channel ON slack_messages(channel_id);
        CREATE INDEX IF NOT EXISTS idx_slack_messages_timestamp ON slack_messages(timestamp);
        CREATE INDEX IF NOT EXISTS idx_slack_messages_direction ON slack_messages(direction);
        CREATE INDEX IF NOT EXISTS idx_slack_messages_thread ON slack_messages(thread_ts);
        CREATE INDEX IF NOT EXISTS idx_slack_messages_user ON slack_messages(user_id);
        CREATE INDEX IF NOT EXISTS idx_slack_channels_name ON slack_channels(channel_name);
        CREATE INDEX IF NOT EXISTS idx_slack_channels_type ON slack_channels(channel_type);
        CREATE INDEX IF NOT EXISTS idx_slack_permissions_permission ON slack_channel_permissions(permission);
        CREATE INDEX IF NOT EXISTS idx_slack_audit_channel ON slack_permission_audit_log(channel_id);
        CREATE INDEX IF NOT EXISTS idx_slack_audit_time ON slack_permission_audit_log(changed_at);
      `);

      // Create full-text search index on messages
      await client.query(`
        CREATE INDEX IF NOT EXISTS idx_slack_messages_text_search
        ON slack_messages USING gin(to_tsvector('english', text))
      `);

      await client.query('COMMIT');
      logger.info('Slack database tables initialized');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  // ============================================
  // MESSAGE STORAGE
  // ============================================

  /**
   * Store an incoming Slack message
   */
  async storeIncomingMessage(
    messageId: string,
    channelId: string,
    userId: string,
    userName: string | null,
    text: string,
    timestamp: Date,
    threadTs?: string,
    options?: StoreSlackMessageOptions
  ): Promise<number> {
    return this.storeMessage(
      'incoming',
      messageId,
      channelId,
      userId,
      userName,
      text,
      timestamp,
      threadTs,
      options
    );
  }

  /**
   * Store an outgoing Slack message
   */
  async storeOutgoingMessage(
    messageId: string,
    channelId: string,
    userId: string,
    userName: string | null,
    text: string,
    threadTs?: string,
    options?: StoreSlackMessageOptions
  ): Promise<number> {
    return this.storeMessage(
      'outgoing',
      messageId,
      channelId,
      userId,
      userName,
      text,
      new Date(),
      threadTs,
      options
    );
  }

  /**
   * Store a message in the database
   */
  private async storeMessage(
    direction: 'incoming' | 'outgoing',
    messageId: string,
    channelId: string,
    userId: string,
    userName: string | null,
    text: string,
    timestamp: Date,
    threadTs?: string,
    options?: StoreSlackMessageOptions
  ): Promise<number> {
    const result = await this.pool.query(
      `
      INSERT INTO slack_messages (
        message_id, channel_id, thread_ts, user_id, user_name, text, direction, timestamp,
        has_files, file_types
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      ON CONFLICT (message_id) DO NOTHING
      RETURNING id
    `,
      [
        messageId,
        channelId,
        threadTs || null,
        userId,
        userName,
        text,
        direction,
        timestamp.toISOString(),
        options?.hasFiles || false,
        options?.fileTypes || null,
      ]
    );

    if (result.rows.length > 0) {
      logger.debug('Stored Slack message', {
        direction,
        channelId,
        messageId,
        hasFiles: options?.hasFiles,
      });
      return result.rows[0].id;
    }

    return 0;
  }

  // ============================================
  // MESSAGE QUERIES
  // ============================================

  /**
   * Search messages with various filters
   */
  async searchMessages(options: SlackMessageSearchOptions = {}): Promise<StoredSlackMessage[]> {
    const conditions: string[] = [];
    const params: unknown[] = [];
    let paramIndex = 1;

    if (options.channelId) {
      conditions.push(`channel_id = $${paramIndex++}`);
      params.push(options.channelId);
    }

    if (options.userId) {
      conditions.push(`user_id = $${paramIndex++}`);
      params.push(options.userId);
    }

    if (options.direction) {
      conditions.push(`direction = $${paramIndex++}`);
      params.push(options.direction);
    }

    if (options.threadTs) {
      conditions.push(`thread_ts = $${paramIndex++}`);
      params.push(options.threadTs);
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
      SELECT * FROM slack_messages
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
  async fullTextSearch(searchTerm: string, limit: number = 50): Promise<StoredSlackMessage[]> {
    const result = await this.pool.query(
      `
      SELECT * FROM slack_messages
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
  async getRecentMessages(limit: number = 50): Promise<StoredSlackMessage[]> {
    const result = await this.pool.query(
      `
      SELECT * FROM slack_messages
      ORDER BY timestamp DESC
      LIMIT $1
    `,
      [limit]
    );

    return result.rows;
  }

  /**
   * Get messages from a specific channel
   */
  async getMessagesByChannel(
    channelId: string,
    limit: number = 100
  ): Promise<StoredSlackMessage[]> {
    const result = await this.pool.query(
      `
      SELECT * FROM slack_messages
      WHERE channel_id = $1
      ORDER BY timestamp DESC
      LIMIT $2
    `,
      [channelId, limit]
    );

    return result.rows;
  }

  /**
   * Get messages from a specific thread
   */
  async getMessagesByThread(
    channelId: string,
    threadTs: string,
    limit: number = 100
  ): Promise<StoredSlackMessage[]> {
    const result = await this.pool.query(
      `
      SELECT * FROM slack_messages
      WHERE channel_id = $1 AND thread_ts = $2
      ORDER BY timestamp ASC
      LIMIT $3
    `,
      [channelId, threadTs, limit]
    );

    return result.rows;
  }

  /**
   * Get messages from a specific user
   */
  async getMessagesByUser(userId: string, limit: number = 100): Promise<StoredSlackMessage[]> {
    const result = await this.pool.query(
      `
      SELECT * FROM slack_messages
      WHERE user_id = $1
      ORDER BY timestamp DESC
      LIMIT $2
    `,
      [userId, limit]
    );

    return result.rows;
  }

  /**
   * Get database statistics
   */
  async getStats(): Promise<SlackMessageStats> {
    const [total, incoming, outgoing, channels, users, first, last] = await Promise.all([
      this.pool.query('SELECT COUNT(*) as count FROM slack_messages'),
      this.pool.query("SELECT COUNT(*) as count FROM slack_messages WHERE direction = 'incoming'"),
      this.pool.query("SELECT COUNT(*) as count FROM slack_messages WHERE direction = 'outgoing'"),
      this.pool.query('SELECT COUNT(DISTINCT channel_id) as count FROM slack_messages'),
      this.pool.query('SELECT COUNT(DISTINCT user_id) as count FROM slack_messages'),
      this.pool.query('SELECT MIN(timestamp) as ts FROM slack_messages'),
      this.pool.query('SELECT MAX(timestamp) as ts FROM slack_messages'),
    ]);

    return {
      totalMessages: parseInt(total.rows[0].count),
      incomingMessages: parseInt(incoming.rows[0].count),
      outgoingMessages: parseInt(outgoing.rows[0].count),
      uniqueChannels: parseInt(channels.rows[0].count),
      uniqueUsers: parseInt(users.rows[0].count),
      firstMessage: first.rows[0]?.ts?.toISOString() || null,
      lastMessage: last.rows[0]?.ts?.toISOString() || null,
    };
  }

  // ============================================
  // CHANNEL MANAGEMENT
  // ============================================

  /**
   * Store or update channel metadata
   */
  async upsertChannel(
    channelId: string,
    name?: string | null,
    channelType?: SlackChannelType,
    isMember?: boolean
  ): Promise<void> {
    await this.pool.query(
      `
      INSERT INTO slack_channels (channel_id, channel_name, channel_type, is_member, last_updated)
      VALUES ($1, $2, $3, $4, NOW())
      ON CONFLICT (channel_id) DO UPDATE SET
        channel_name = COALESCE($2, slack_channels.channel_name),
        channel_type = COALESCE($3, slack_channels.channel_type),
        is_member = COALESCE($4, slack_channels.is_member),
        last_updated = NOW()
    `,
      [channelId, name || null, channelType || null, isMember ?? null]
    );

    logger.debug('Upserted Slack channel', { channelId, name, channelType });
  }

  /**
   * Get channel by ID
   */
  async getChannel(channelId: string): Promise<StoredSlackChannel | undefined> {
    const result = await this.pool.query(
      `
      SELECT * FROM slack_channels WHERE channel_id = $1
    `,
      [channelId]
    );
    return result.rows[0];
  }

  /**
   * Get channel info by ID (alias for getChannel)
   */
  async getChannelInfo(channelId: string): Promise<StoredSlackChannel | undefined> {
    return this.getChannel(channelId);
  }

  /**
   * Check if a message already exists in the database
   */
  async messageExists(messageId: string): Promise<boolean> {
    const result = await this.pool.query(
      `SELECT 1 FROM slack_messages WHERE message_id = $1 LIMIT 1`,
      [messageId]
    );
    return result.rows.length > 0;
  }

  /**
   * Get all stored channels
   */
  async getAllChannels(): Promise<StoredSlackChannel[]> {
    const result = await this.pool.query(`
      SELECT * FROM slack_channels ORDER BY last_updated DESC
    `);
    return result.rows;
  }

  /**
   * Search channels by name
   */
  async searchChannels(searchTerm: string): Promise<StoredSlackChannel[]> {
    const result = await this.pool.query(
      `
      SELECT * FROM slack_channels
      WHERE channel_name ILIKE $1
      ORDER BY last_updated DESC
    `,
      [`%${searchTerm}%`]
    );
    return result.rows;
  }

  // ============================================
  // CHANNEL PERMISSIONS
  // ============================================

  /**
   * Get channel permission
   */
  async getChannelPermission(channelId: string): Promise<StoredSlackChannelPermission | undefined> {
    const result = await this.pool.query(
      `
      SELECT * FROM slack_channel_permissions WHERE channel_id = $1
    `,
      [channelId]
    );
    return result.rows[0];
  }

  /**
   * Get all channel permissions
   */
  async getAllChannelPermissions(): Promise<StoredSlackChannelPermission[]> {
    const result = await this.pool.query(`
      SELECT * FROM slack_channel_permissions
      ORDER BY updated_at DESC
    `);
    return result.rows;
  }

  /**
   * Get all channels with their permissions
   */
  async getAllChannelsWithPermissions(): Promise<SlackChannelWithPermission[]> {
    const result = await this.pool.query(`
      SELECT
        c.channel_id as "channelId",
        c.channel_name as "channelName",
        c.channel_type as "channelType",
        c.is_member as "isMember",
        c.last_updated as "lastUpdated",
        COALESCE(p.permission, 'read_only') as permission,
        COALESCE(p.respond_to_mentions, true) as "respondToMentions",
        COALESCE(p.respond_to_dms, true) as "respondToDMs",
        p.notes,
        p.created_at as "createdAt",
        p.updated_at as "updatedAt",
        (SELECT COUNT(*) FROM slack_messages m WHERE m.channel_id = c.channel_id) as "messageCount",
        (SELECT MAX(timestamp) FROM slack_messages m WHERE m.channel_id = c.channel_id) as "lastMessageAt"
      FROM slack_channels c
      LEFT JOIN slack_channel_permissions p ON c.channel_id = p.channel_id
      ORDER BY p.updated_at DESC NULLS LAST
    `);
    return result.rows;
  }

  /**
   * Set channel permission
   */
  async setChannelPermission(
    channelId: string,
    permission: SlackChannelPermission,
    options?: {
      respondToMentions?: boolean;
      respondToDMs?: boolean;
      notes?: string;
      changedBy?: string;
    }
  ): Promise<void> {
    const oldRecord = await this.getChannelPermission(channelId);
    const oldPermission = oldRecord?.permission || null;

    await this.pool.query(
      `
      INSERT INTO slack_channel_permissions (
        channel_id, permission, respond_to_mentions, respond_to_dms, notes, created_at, updated_at
      )
      VALUES ($1, $2, $3, $4, $5, NOW(), NOW())
      ON CONFLICT (channel_id) DO UPDATE SET
        permission = EXCLUDED.permission,
        respond_to_mentions = COALESCE(EXCLUDED.respond_to_mentions, slack_channel_permissions.respond_to_mentions),
        respond_to_dms = COALESCE(EXCLUDED.respond_to_dms, slack_channel_permissions.respond_to_dms),
        notes = COALESCE(EXCLUDED.notes, slack_channel_permissions.notes),
        updated_at = NOW()
    `,
      [
        channelId,
        permission,
        options?.respondToMentions ?? true,
        options?.respondToDMs ?? true,
        options?.notes || null,
      ]
    );

    // Log audit entry if permission changed
    if (oldPermission !== permission) {
      await this.pool.query(
        `
        INSERT INTO slack_permission_audit_log (channel_id, old_permission, new_permission, changed_by)
        VALUES ($1, $2, $3, $4)
      `,
        [channelId, oldPermission, permission, options?.changedBy || null]
      );

      logger.info('Slack channel permission updated', {
        channelId,
        oldPermission,
        newPermission: permission,
        changedBy: options?.changedBy,
      });
    }
  }

  /**
   * Delete channel permission (reverts to default)
   */
  async deleteChannelPermission(channelId: string, changedBy?: string): Promise<boolean> {
    const oldRecord = await this.getChannelPermission(channelId);

    const result = await this.pool.query(
      `DELETE FROM slack_channel_permissions WHERE channel_id = $1`,
      [channelId]
    );

    if ((result.rowCount || 0) > 0 && oldRecord) {
      await this.pool.query(
        `
        INSERT INTO slack_permission_audit_log (channel_id, old_permission, new_permission, changed_by)
        VALUES ($1, $2, 'deleted', $3)
      `,
        [channelId, oldRecord.permission, changedBy || null]
      );

      logger.info('Slack channel permission deleted', { channelId, changedBy });
    }

    return (result.rowCount || 0) > 0;
  }

  /**
   * Get dashboard statistics
   */
  async getDashboardStats(): Promise<SlackDashboardStats> {
    const [permissionCounts, typeCounts, totalMessages, channelsWithoutPerms] = await Promise.all([
      this.pool.query(`
        SELECT permission, COUNT(*) as count
        FROM slack_channel_permissions
        GROUP BY permission
      `),
      this.pool.query(`
        SELECT channel_type, COUNT(*) as count
        FROM slack_channels
        GROUP BY channel_type
      `),
      this.pool.query(`SELECT COUNT(*) as count FROM slack_messages`),
      this.pool.query(`
        SELECT COUNT(*) as count FROM slack_channels c
        WHERE NOT EXISTS (
          SELECT 1 FROM slack_channel_permissions p WHERE p.channel_id = c.channel_id
        )
      `),
    ]);

    type CountRow = { permission?: string; channel_type?: string; count: string };

    return {
      totalChannels: permissionCounts.rows.reduce(
        (sum: number, p: CountRow) => sum + parseInt(p.count),
        0
      ),
      byPermission: {
        ignored: parseInt(
          permissionCounts.rows.find((p: CountRow) => p.permission === 'ignored')?.count || '0'
        ),
        read_only: parseInt(
          permissionCounts.rows.find((p: CountRow) => p.permission === 'read_only')?.count || '0'
        ),
        read_write: parseInt(
          permissionCounts.rows.find((p: CountRow) => p.permission === 'read_write')?.count || '0'
        ),
      },
      byType: {
        channel: parseInt(
          typeCounts.rows.find((t: CountRow) => t.channel_type === 'channel')?.count || '0'
        ),
        dm: parseInt(typeCounts.rows.find((t: CountRow) => t.channel_type === 'dm')?.count || '0'),
        group_dm: parseInt(
          typeCounts.rows.find((t: CountRow) => t.channel_type === 'group_dm')?.count || '0'
        ),
        private: parseInt(
          typeCounts.rows.find((t: CountRow) => t.channel_type === 'private')?.count || '0'
        ),
      },
      totalMessages: parseInt(totalMessages.rows[0].count),
      channelsWithoutPermissions: parseInt(channelsWithoutPerms.rows[0].count),
    };
  }

  /**
   * Close the database connection pool
   */
  async close(): Promise<void> {
    await this.pool.end();
    logger.info('Slack database connection pool closed');
  }
}

/**
 * Create a SlackDatabase instance
 */
export function createSlackDatabase(connectionString?: string): SlackDatabase {
  return new SlackDatabase(connectionString);
}
