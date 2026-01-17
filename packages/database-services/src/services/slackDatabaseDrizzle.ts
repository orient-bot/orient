/**
 * Slack Database Service (Drizzle ORM Implementation)
 *
 * PostgreSQL database for storing and querying Slack messages.
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
  desc,
  asc,
  sql,
  schema,
} from '@orient/database';
import type {
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
  private connectionString: string;

  constructor(connectionString?: string) {
    this.connectionString =
      connectionString ||
      process.env.DATABASE_URL ||
      'postgresql://aibot:aibot123@localhost:5432/whatsapp_bot_0';

    logger.info('Slack Drizzle database client initialized', {
      connectionString: this.connectionString.replace(/:[^:@]+@/, ':****@'),
    });
  }

  private get db() {
    return getDatabase({ connectionString: this.connectionString });
  }

  async initialize(): Promise<void> {
    if (this.initialized) return;
    await this.initializeTables();
    this.initialized = true;
  }

  private async initializeTables(): Promise<void> {
    const sql = getSqlClient();

    // CREATE TABLE IF NOT EXISTS is idempotent, no transaction needed

    // Slack messages table
    await sql`
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
      `;

    // Slack channels table
    await sql`
        CREATE TABLE IF NOT EXISTS slack_channels (
          channel_id TEXT PRIMARY KEY,
          channel_name TEXT,
          channel_type TEXT CHECK (channel_type IN ('channel', 'dm', 'group_dm', 'private')),
          is_member BOOLEAN DEFAULT TRUE,
          last_updated TIMESTAMPTZ DEFAULT NOW()
        )
      `;

    // Slack channel permissions table
    await sql`
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
      `;

    // Slack permission audit log
    await sql`
        CREATE TABLE IF NOT EXISTS slack_permission_audit_log (
          id SERIAL PRIMARY KEY,
          channel_id TEXT NOT NULL,
          old_permission TEXT,
          new_permission TEXT NOT NULL,
          changed_by TEXT,
          changed_at TIMESTAMPTZ DEFAULT NOW()
        )
      `;

    // Create indexes
    await sql`CREATE INDEX IF NOT EXISTS idx_slack_messages_channel ON slack_messages(channel_id)`;
    await sql`CREATE INDEX IF NOT EXISTS idx_slack_messages_timestamp ON slack_messages(timestamp)`;
    await sql`CREATE INDEX IF NOT EXISTS idx_slack_messages_direction ON slack_messages(direction)`;
    await sql`CREATE INDEX IF NOT EXISTS idx_slack_messages_thread ON slack_messages(thread_ts)`;
    await sql`CREATE INDEX IF NOT EXISTS idx_slack_messages_user ON slack_messages(user_id)`;
    await sql`CREATE INDEX IF NOT EXISTS idx_slack_channels_name ON slack_channels(channel_name)`;
    await sql`CREATE INDEX IF NOT EXISTS idx_slack_channels_type ON slack_channels(channel_type)`;
    await sql`CREATE INDEX IF NOT EXISTS idx_slack_permissions_permission ON slack_channel_permissions(permission)`;
    await sql`CREATE INDEX IF NOT EXISTS idx_slack_audit_channel ON slack_permission_audit_log(channel_id)`;
    await sql`CREATE INDEX IF NOT EXISTS idx_slack_audit_time ON slack_permission_audit_log(changed_at)`;

    // Full-text search index
    await sql`
      CREATE INDEX IF NOT EXISTS idx_slack_messages_text_search
      ON slack_messages USING gin(to_tsvector('english', text))
    `;

    logger.info('Slack database tables initialized');
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
    const result = await this.db
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
        fileTypes: options?.fileTypes || null,
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

    // Handle full-text search separately
    if (options.text) {
      const sqlClient = getSqlClient();
      const results = await sqlClient`
        SELECT * FROM slack_messages
        WHERE to_tsvector('english', text) @@ plainto_tsquery('english', ${options.text})
        ORDER BY timestamp DESC
        LIMIT ${options.limit || 100} OFFSET ${options.offset || 0}
      `;
      return results as unknown as StoredSlackMessage[];
    }

    let query = this.db
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
    const sqlClient = getSqlClient();
    const results = await sqlClient`
      SELECT * FROM slack_messages
      WHERE to_tsvector('english', text) @@ plainto_tsquery('english', ${searchTerm})
      ORDER BY timestamp DESC
      LIMIT ${limit}
    `;
    return results as unknown as StoredSlackMessage[];
  }

  async getRecentMessages(limit: number = 50): Promise<StoredSlackMessage[]> {
    return this.db
      .select()
      .from(schema.slackMessages)
      .orderBy(desc(schema.slackMessages.timestamp))
      .limit(limit);
  }

  async getMessagesByChannel(
    channelId: string,
    limit: number = 100
  ): Promise<StoredSlackMessage[]> {
    return this.db
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
    return this.db
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
    return this.db
      .select()
      .from(schema.slackMessages)
      .where(eq(schema.slackMessages.userId, userId))
      .orderBy(desc(schema.slackMessages.timestamp))
      .limit(limit);
  }

  async getStats(): Promise<SlackMessageStats> {
    const sqlClient = getSqlClient();

    const [
      totalResult,
      incomingResult,
      outgoingResult,
      channelsResult,
      usersResult,
      firstResult,
      lastResult,
    ] = await Promise.all([
      sqlClient`SELECT COUNT(*) as count FROM slack_messages`,
      sqlClient`SELECT COUNT(*) as count FROM slack_messages WHERE direction = 'incoming'`,
      sqlClient`SELECT COUNT(*) as count FROM slack_messages WHERE direction = 'outgoing'`,
      sqlClient`SELECT COUNT(DISTINCT channel_id) as count FROM slack_messages`,
      sqlClient`SELECT COUNT(DISTINCT user_id) as count FROM slack_messages`,
      sqlClient`SELECT MIN(timestamp) as ts FROM slack_messages`,
      sqlClient`SELECT MAX(timestamp) as ts FROM slack_messages`,
    ]);

    return {
      totalMessages: parseInt((totalResult as unknown as Array<{ count: string }>)[0].count),
      incomingMessages: parseInt((incomingResult as unknown as Array<{ count: string }>)[0].count),
      outgoingMessages: parseInt((outgoingResult as unknown as Array<{ count: string }>)[0].count),
      uniqueChannels: parseInt((channelsResult as unknown as Array<{ count: string }>)[0].count),
      uniqueUsers: parseInt((usersResult as unknown as Array<{ count: string }>)[0].count),
      firstMessage:
        (firstResult as unknown as Array<{ ts: Date | null }>)[0]?.ts?.toISOString() || null,
      lastMessage:
        (lastResult as unknown as Array<{ ts: Date | null }>)[0]?.ts?.toISOString() || null,
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
    await this.db
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
    const results = await this.db
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
    const results = await this.db
      .select({ id: schema.slackMessages.id })
      .from(schema.slackMessages)
      .where(eq(schema.slackMessages.messageId, messageId))
      .limit(1);
    return results.length > 0;
  }

  async getAllChannels(): Promise<StoredSlackChannel[]> {
    return this.db
      .select()
      .from(schema.slackChannels)
      .orderBy(desc(schema.slackChannels.lastUpdated));
  }

  async searchChannels(searchTerm: string): Promise<StoredSlackChannel[]> {
    const pattern = `%${searchTerm}%`;
    return this.db
      .select()
      .from(schema.slackChannels)
      .where(sql`${schema.slackChannels.channelName} ILIKE ${pattern}`)
      .orderBy(desc(schema.slackChannels.lastUpdated));
  }

  // ============================================
  // CHANNEL PERMISSIONS
  // ============================================

  async getChannelPermission(channelId: string): Promise<StoredSlackChannelPermission | undefined> {
    const results = await this.db
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
    const results = await this.db
      .select()
      .from(schema.slackChannelPermissions)
      .orderBy(desc(schema.slackChannelPermissions.updatedAt));

    return results.map((r) => ({
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
    const sqlClient = getSqlClient();
    const results = await sqlClient`
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
    `;
    return results as unknown as SlackChannelWithPermission[];
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
    const oldRecord = await this.getChannelPermission(channelId);
    const oldPermission = oldRecord?.permission || null;

    await this.db
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
      await this.db.insert(schema.slackPermissionAuditLog).values({
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
    const oldRecord = await this.getChannelPermission(channelId);

    const result = await this.db
      .delete(schema.slackChannelPermissions)
      .where(eq(schema.slackChannelPermissions.channelId, channelId))
      .returning({ channelId: schema.slackChannelPermissions.channelId });

    if (result.length > 0 && oldRecord) {
      await this.db.insert(schema.slackPermissionAuditLog).values({
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
    const sqlClient = getSqlClient();

    const [permissionCounts, typeCounts, totalMessages, channelsWithoutPerms] = await Promise.all([
      sqlClient`
        SELECT permission, COUNT(*) as count
        FROM slack_channel_permissions
        GROUP BY permission
      `,
      sqlClient`
        SELECT channel_type, COUNT(*) as count
        FROM slack_channels
        GROUP BY channel_type
      `,
      sqlClient`SELECT COUNT(*) as count FROM slack_messages`,
      sqlClient`
        SELECT COUNT(*) as count FROM slack_channels c
        WHERE NOT EXISTS (
          SELECT 1 FROM slack_channel_permissions p WHERE p.channel_id = c.channel_id
        )
      `,
    ]);

    type CountRow = { permission?: string; channel_type?: string; count: string };

    const typedPermissionCounts = permissionCounts as unknown as CountRow[];
    const typedTypeCounts = typeCounts as unknown as CountRow[];

    return {
      totalChannels: typedPermissionCounts.reduce((sum, p) => sum + parseInt(p.count), 0),
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
        channel: parseInt(typedTypeCounts.find((t) => t.channel_type === 'channel')?.count || '0'),
        dm: parseInt(typedTypeCounts.find((t) => t.channel_type === 'dm')?.count || '0'),
        group_dm: parseInt(
          typedTypeCounts.find((t) => t.channel_type === 'group_dm')?.count || '0'
        ),
        private: parseInt(typedTypeCounts.find((t) => t.channel_type === 'private')?.count || '0'),
      },
      totalMessages: parseInt((totalMessages as unknown as Array<{ count: string }>)[0].count),
      channelsWithoutPermissions: parseInt(
        (channelsWithoutPerms as unknown as Array<{ count: string }>)[0].count
      ),
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
export function createSlackDatabase(connectionString?: string): SlackDatabase {
  return new SlackDatabase(connectionString);
}
