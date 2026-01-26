/**
 * Slack Database Service (Drizzle ORM Implementation)
 *
 * SQLite database for storing and querying Slack messages.
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
  desc,
  asc,
  sql,
  like,
  schema,
} from '@orient/database';
import type {
  Database,
  SlackMessage,
  SlackChannel,
  SlackChannelPermissionRecord as DbSlackChannelPermission,
  SlackMessageSearchOptions,
  StoreSlackMessageOptions,
  SlackMessageStats,
  SlackDashboardStats,
  SlackChannelType,
  SlackChannelPermission,
} from '@orient/database';

const logger = createServiceLogger('slack-db-drizzle');

// Re-export types for consumers (matching original interface)
export type StoredSlackMessage = SlackMessage;
export type StoredSlackChannel = SlackChannel;

export interface StoredSlackChannelPermission {
  channelId: string;
  permission: SlackChannelPermission;
  respondToMentions: boolean | null;
  respondToDMs: boolean | null;
  notes: string | null;
  createdAt: Date | null;
  updatedAt: Date | null;
}

export interface SlackChannelWithPermission {
  channelId: string;
  channelName: string | null;
  channelType: SlackChannelType | null;
  isMember: boolean | null;
  lastUpdated: Date | null;
  permission: SlackChannelPermission;
  respondToMentions: boolean;
  respondToDMs: boolean;
  notes: string | null;
  createdAt: Date | null;
  updatedAt: Date | null;
  messageCount: number;
  lastMessageAt: Date | null;
}

export {
  SlackMessageSearchOptions,
  StoreSlackMessageOptions,
  SlackMessageStats,
  SlackDashboardStats,
  SlackChannelType,
  SlackChannelPermission,
};

export class SlackDatabase {
  private initialized: boolean = false;
  private _db: Database | null = null;

  constructor() {
    // SQLite path is configured via SQLITE_DATABASE env var or defaults
    logger.info('Slack Drizzle database client initialized (SQLite)');
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

  async initialize(): Promise<void> {
    if (this.initialized) return;
    // Ensure database connection is established
    this._db = getDatabase();
    this.initialized = true;
    logger.info('Slack database initialized');
  }

  // ============================================
  // MESSAGE STORAGE
  // ============================================

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
    const db = this.db;
    const result = await db
      .insert(schema.slackMessages)
      .values({
        messageId,
        channelId,
        threadTs: threadTs || null,
        userId,
        userName,
        text,
        direction,
        timestamp,
        hasFiles: options?.hasFiles || false,
        // Store fileTypes as JSON string for SQLite
        fileTypes: options?.fileTypes ? JSON.stringify(options.fileTypes) : null,
      })
      .onConflictDoNothing({ target: schema.slackMessages.messageId })
      .returning({ id: schema.slackMessages.id });

    if (result.length > 0) {
      logger.debug('Stored Slack message', {
        direction,
        channelId,
        messageId,
        hasFiles: options?.hasFiles,
      });
      return result[0].id;
    }

    return 0;
  }

  // ============================================
  // MESSAGE QUERIES
  // ============================================

  async searchMessages(options: SlackMessageSearchOptions = {}): Promise<StoredSlackMessage[]> {
    const db = this.db;
    const conditions = [];

    if (options.channelId) {
      conditions.push(eq(schema.slackMessages.channelId, options.channelId));
    }
    if (options.userId) {
      conditions.push(eq(schema.slackMessages.userId, options.userId));
    }
    if (options.direction) {
      conditions.push(eq(schema.slackMessages.direction, options.direction));
    }
    if (options.threadTs) {
      conditions.push(eq(schema.slackMessages.threadTs, options.threadTs));
    }
    if (options.fromDate) {
      conditions.push(sql`${schema.slackMessages.timestamp} >= ${options.fromDate}`);
    }
    if (options.toDate) {
      conditions.push(sql`${schema.slackMessages.timestamp} <= ${options.toDate}`);
    }

    // Handle text search using LIKE (SQLite doesn't have full-text search)
    if (options.text) {
      const db = this.db;
      const pattern = `%${options.text}%`;
      return db
        .select()
        .from(schema.slackMessages)
        .where(like(schema.slackMessages.text, pattern))
        .orderBy(desc(schema.slackMessages.timestamp))
        .limit(options.limit || 100)
        .offset(options.offset || 0);
    }

    let query = db
      .select()
      .from(schema.slackMessages)
      .orderBy(desc(schema.slackMessages.timestamp))
      .limit(options.limit || 100)
      .offset(options.offset || 0);

    if (conditions.length > 0) {
      query = query.where(and(...conditions)) as typeof query;
    }

    return query;
  }

  async fullTextSearch(searchTerm: string, limit: number = 50): Promise<StoredSlackMessage[]> {
    const db = this.db;
    const pattern = `%${searchTerm}%`;
    return db
      .select()
      .from(schema.slackMessages)
      .where(like(schema.slackMessages.text, pattern))
      .orderBy(desc(schema.slackMessages.timestamp))
      .limit(limit);
  }

  async getRecentMessages(limit: number = 50): Promise<StoredSlackMessage[]> {
    const db = this.db;
    return db
      .select()
      .from(schema.slackMessages)
      .orderBy(desc(schema.slackMessages.timestamp))
      .limit(limit);
  }

  async getMessagesByChannel(
    channelId: string,
    limit: number = 100
  ): Promise<StoredSlackMessage[]> {
    const db = this.db;
    return db
      .select()
      .from(schema.slackMessages)
      .where(eq(schema.slackMessages.channelId, channelId))
      .orderBy(desc(schema.slackMessages.timestamp))
      .limit(limit);
  }

  async getMessagesByThread(
    channelId: string,
    threadTs: string,
    limit: number = 100
  ): Promise<StoredSlackMessage[]> {
    const db = this.db;
    return db
      .select()
      .from(schema.slackMessages)
      .where(
        and(
          eq(schema.slackMessages.channelId, channelId),
          eq(schema.slackMessages.threadTs, threadTs)
        )
      )
      .orderBy(asc(schema.slackMessages.timestamp))
      .limit(limit);
  }

  async getMessagesByUser(userId: string, limit: number = 100): Promise<StoredSlackMessage[]> {
    const db = this.db;
    return db
      .select()
      .from(schema.slackMessages)
      .where(eq(schema.slackMessages.userId, userId))
      .orderBy(desc(schema.slackMessages.timestamp))
      .limit(limit);
  }

  async getStats(): Promise<SlackMessageStats> {
    const [
      totalResult,
      incomingResult,
      outgoingResult,
      channelsResult,
      usersResult,
      firstResult,
      lastResult,
    ] = await Promise.all([
      executeRawSql<{ count: number }>('SELECT COUNT(*) as count FROM slack_messages'),
      executeRawSql<{ count: number }>(
        "SELECT COUNT(*) as count FROM slack_messages WHERE direction = 'incoming'"
      ),
      executeRawSql<{ count: number }>(
        "SELECT COUNT(*) as count FROM slack_messages WHERE direction = 'outgoing'"
      ),
      executeRawSql<{ count: number }>(
        'SELECT COUNT(DISTINCT channel_id) as count FROM slack_messages'
      ),
      executeRawSql<{ count: number }>(
        'SELECT COUNT(DISTINCT user_id) as count FROM slack_messages'
      ),
      executeRawSql<{ ts: string | null }>('SELECT MIN(timestamp) as ts FROM slack_messages'),
      executeRawSql<{ ts: string | null }>('SELECT MAX(timestamp) as ts FROM slack_messages'),
    ]);

    const formatTimestamp = (ts: unknown): string | null => {
      if (!ts) return null;
      if (typeof ts === 'string') return ts;
      return null;
    };

    return {
      totalMessages: Number(totalResult[0]?.count ?? 0),
      incomingMessages: Number(incomingResult[0]?.count ?? 0),
      outgoingMessages: Number(outgoingResult[0]?.count ?? 0),
      uniqueChannels: Number(channelsResult[0]?.count ?? 0),
      uniqueUsers: Number(usersResult[0]?.count ?? 0),
      firstMessage: formatTimestamp(firstResult[0]?.ts),
      lastMessage: formatTimestamp(lastResult[0]?.ts),
    };
  }

  // ============================================
  // CHANNEL MANAGEMENT
  // ============================================

  async upsertChannel(
    channelId: string,
    name?: string | null,
    channelType?: SlackChannelType,
    isMember?: boolean
  ): Promise<void> {
    const db = this.db;
    await db
      .insert(schema.slackChannels)
      .values({
        channelId,
        channelName: name || null,
        channelType: channelType || null,
        isMember: isMember ?? null,
        lastUpdated: new Date(),
      })
      .onConflictDoUpdate({
        target: schema.slackChannels.channelId,
        set: {
          channelName: name !== undefined ? name : sql`${schema.slackChannels.channelName}`,
          channelType:
            channelType !== undefined ? channelType : sql`${schema.slackChannels.channelType}`,
          isMember: isMember !== undefined ? isMember : sql`${schema.slackChannels.isMember}`,
          lastUpdated: new Date(),
        },
      });

    logger.debug('Upserted Slack channel', { channelId, name, channelType });
  }

  async getChannel(channelId: string): Promise<StoredSlackChannel | undefined> {
    const db = this.db;
    const results = await db
      .select()
      .from(schema.slackChannels)
      .where(eq(schema.slackChannels.channelId, channelId))
      .limit(1);
    return results[0];
  }

  async getChannelInfo(channelId: string): Promise<StoredSlackChannel | undefined> {
    return this.getChannel(channelId);
  }

  async messageExists(messageId: string): Promise<boolean> {
    const db = this.db;
    const results = await db
      .select({ id: schema.slackMessages.id })
      .from(schema.slackMessages)
      .where(eq(schema.slackMessages.messageId, messageId))
      .limit(1);
    return results.length > 0;
  }

  async getAllChannels(): Promise<StoredSlackChannel[]> {
    const db = this.db;
    return db.select().from(schema.slackChannels).orderBy(desc(schema.slackChannels.lastUpdated));
  }

  async searchChannels(searchTerm: string): Promise<StoredSlackChannel[]> {
    const db = this.db;
    const pattern = `%${searchTerm}%`;
    // Use LIKE with LOWER() for case-insensitive search in SQLite
    return db
      .select()
      .from(schema.slackChannels)
      .where(sql`LOWER(${schema.slackChannels.channelName}) LIKE LOWER(${pattern})`)
      .orderBy(desc(schema.slackChannels.lastUpdated));
  }

  // ============================================
  // CHANNEL PERMISSIONS
  // ============================================

  async getChannelPermission(channelId: string): Promise<StoredSlackChannelPermission | undefined> {
    const db = this.db;
    const results = await db
      .select()
      .from(schema.slackChannelPermissions)
      .where(eq(schema.slackChannelPermissions.channelId, channelId))
      .limit(1);

    if (results.length === 0) return undefined;

    const r = results[0];
    return {
      channelId: r.channelId,
      permission: r.permission as SlackChannelPermission,
      respondToMentions: r.respondToMentions,
      respondToDMs: r.respondToDMs,
      notes: r.notes,
      createdAt: r.createdAt,
      updatedAt: r.updatedAt,
    };
  }

  async getAllChannelPermissions(): Promise<StoredSlackChannelPermission[]> {
    const db = this.db;
    const results = await db
      .select()
      .from(schema.slackChannelPermissions)
      .orderBy(desc(schema.slackChannelPermissions.updatedAt));

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return results.map((r: any) => ({
      channelId: r.channelId,
      permission: r.permission as SlackChannelPermission,
      respondToMentions: r.respondToMentions,
      respondToDMs: r.respondToDMs,
      notes: r.notes,
      createdAt: r.createdAt,
      updatedAt: r.updatedAt,
    }));
  }

  async getAllChannelsWithPermissions(): Promise<SlackChannelWithPermission[]> {
    const results = await executeRawSql<SlackChannelWithPermission>(`
      SELECT
        c.channel_id as channelId,
        c.channel_name as channelName,
        c.channel_type as channelType,
        c.is_member as isMember,
        c.last_updated as lastUpdated,
        COALESCE(p.permission, 'read_only') as permission,
        COALESCE(p.respond_to_mentions, 1) as respondToMentions,
        COALESCE(p.respond_to_dms, 1) as respondToDMs,
        p.notes,
        p.created_at as createdAt,
        p.updated_at as updatedAt,
        (SELECT COUNT(*) FROM slack_messages m WHERE m.channel_id = c.channel_id) as messageCount,
        (SELECT MAX(timestamp) FROM slack_messages m WHERE m.channel_id = c.channel_id) as lastMessageAt
      FROM slack_channels c
      LEFT JOIN slack_channel_permissions p ON c.channel_id = p.channel_id
      ORDER BY CASE WHEN p.updated_at IS NULL THEN 1 ELSE 0 END, p.updated_at DESC
    `);
    return results;
  }

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
    const db = this.db;
    const oldRecord = await this.getChannelPermission(channelId);
    const oldPermission = oldRecord?.permission || null;

    await db
      .insert(schema.slackChannelPermissions)
      .values({
        channelId,
        permission,
        respondToMentions: options?.respondToMentions ?? true,
        respondToDMs: options?.respondToDMs ?? true,
        notes: options?.notes || null,
        createdAt: new Date(),
        updatedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: schema.slackChannelPermissions.channelId,
        set: {
          permission,
          respondToMentions:
            options?.respondToMentions !== undefined
              ? options.respondToMentions
              : sql`${schema.slackChannelPermissions.respondToMentions}`,
          respondToDMs:
            options?.respondToDMs !== undefined
              ? options.respondToDMs
              : sql`${schema.slackChannelPermissions.respondToDMs}`,
          notes:
            options?.notes !== undefined
              ? options.notes
              : sql`${schema.slackChannelPermissions.notes}`,
          updatedAt: new Date(),
        },
      });

    // Log audit entry if permission changed
    if (oldPermission !== permission) {
      await db.insert(schema.slackPermissionAuditLog).values({
        channelId,
        oldPermission,
        newPermission: permission,
        changedBy: options?.changedBy || null,
      });

      logger.info('Slack channel permission updated', {
        channelId,
        oldPermission,
        newPermission: permission,
        changedBy: options?.changedBy,
      });
    }
  }

  async deleteChannelPermission(channelId: string, changedBy?: string): Promise<boolean> {
    const db = this.db;
    const oldRecord = await this.getChannelPermission(channelId);

    const result = await db
      .delete(schema.slackChannelPermissions)
      .where(eq(schema.slackChannelPermissions.channelId, channelId))
      .returning({ channelId: schema.slackChannelPermissions.channelId });

    if (result.length > 0 && oldRecord) {
      await db.insert(schema.slackPermissionAuditLog).values({
        channelId,
        oldPermission: oldRecord.permission,
        newPermission: 'deleted',
        changedBy: changedBy || null,
      });

      logger.info('Slack channel permission deleted', { channelId, changedBy });
    }

    return result.length > 0;
  }

  async getDashboardStats(): Promise<SlackDashboardStats> {
    type PermissionRow = { permission: string; count: number };
    type TypeRow = { channel_type: string; count: number };

    const [permissionCounts, typeCounts, totalMessages, channelsWithoutPerms] = await Promise.all([
      executeRawSql<PermissionRow>(`
        SELECT permission, COUNT(*) as count
        FROM slack_channel_permissions
        GROUP BY permission
      `),
      executeRawSql<TypeRow>(`
        SELECT channel_type, COUNT(*) as count
        FROM slack_channels
        GROUP BY channel_type
      `),
      executeRawSql<{ count: number }>('SELECT COUNT(*) as count FROM slack_messages'),
      executeRawSql<{ count: number }>(`
        SELECT COUNT(*) as count FROM slack_channels c
        WHERE NOT EXISTS (
          SELECT 1 FROM slack_channel_permissions p WHERE p.channel_id = c.channel_id
        )
      `),
    ]);

    return {
      totalChannels: permissionCounts.reduce((sum, p) => sum + Number(p.count), 0),
      byPermission: {
        ignored: Number(permissionCounts.find((p) => p.permission === 'ignored')?.count ?? 0),
        read_only: Number(permissionCounts.find((p) => p.permission === 'read_only')?.count ?? 0),
        read_write: Number(permissionCounts.find((p) => p.permission === 'read_write')?.count ?? 0),
      },
      byType: {
        channel: Number(typeCounts.find((t) => t.channel_type === 'channel')?.count ?? 0),
        dm: Number(typeCounts.find((t) => t.channel_type === 'dm')?.count ?? 0),
        group_dm: Number(typeCounts.find((t) => t.channel_type === 'group_dm')?.count ?? 0),
        private: Number(typeCounts.find((t) => t.channel_type === 'private')?.count ?? 0),
      },
      totalMessages: Number(totalMessages[0]?.count ?? 0),
      channelsWithoutPermissions: Number(channelsWithoutPerms[0]?.count ?? 0),
    };
  }

  async close(): Promise<void> {
    await closeDatabase();
    logger.info('Slack database connection pool closed');
  }
}

/**
 * Create a SlackDatabase instance using Drizzle ORM
 */
export function createSlackDatabase(): SlackDatabase {
  return new SlackDatabase();
}
