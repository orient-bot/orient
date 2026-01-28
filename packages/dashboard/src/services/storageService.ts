/**
 * Storage Service
 *
 * Aggregates storage statistics from database, media files, sessions, and cloud providers.
 * Provides management actions for cleaning up old data.
 */

import fs from 'fs';
import path from 'path';
import { createServiceLogger } from '@orientbot/core';
import type { MessageDatabase, SlackDatabase } from '@orientbot/database-services';
import { getBillingService } from './billingService.js';

const logger = createServiceLogger('storage-service');

// Types
export interface TableStats {
  tableName: string;
  rowCount: number;
  estimatedSize?: string;
}

export interface DatabaseStorageStats {
  tables: TableStats[];
  totalRows: number;
  connectionStatus: 'connected' | 'error';
  error?: string;
}

export interface MediaStorageStats {
  totalFiles: number;
  byType: {
    image: number;
    audio: number;
    video: number;
    document: number;
  };
  oldestMedia?: string;
  newestMedia?: string;
}

export interface SessionStorageStats {
  status: 'connected' | 'disconnected' | 'unknown';
  path: string;
  sizeMB: number;
  exists: boolean;
  lastModified?: string;
}

export interface CloudStorageStats {
  cloudflare: {
    available: boolean;
    storageGB?: number;
    error?: string;
  };
  google: {
    available: boolean;
    storageGB?: number;
    error?: string;
  };
}

export interface StorageSummary {
  database: DatabaseStorageStats;
  media: MediaStorageStats;
  session: SessionStorageStats;
  cloud: CloudStorageStats;
  fetchedAt: string;
}

export interface CleanupPreview {
  messagesCount: number;
  oldestMessage?: string;
  newestAffected?: string;
}

export interface CleanupResult {
  success: boolean;
  deletedCount: number;
  error?: string;
}

// Storage Service class
export class StorageService {
  private db: MessageDatabase;
  private slackDb: SlackDatabase | null;
  private sessionPath: string;

  constructor(db: MessageDatabase, slackDb: SlackDatabase | null = null) {
    this.db = db;
    this.slackDb = slackDb;
    // Default session path for WhatsApp auth state
    this.sessionPath = process.env.WHATSAPP_SESSION_PATH || '/data/session';
  }

  /**
   * Get database table statistics
   */
  async getDatabaseStats(): Promise<DatabaseStorageStats> {
    try {
      // Query row counts for all relevant tables
      const tableQueries = [
        { name: 'messages', query: 'SELECT COUNT(*) as count FROM messages' },
        { name: 'groups', query: 'SELECT COUNT(*) as count FROM groups' },
        { name: 'chat_permissions', query: 'SELECT COUNT(*) as count FROM chat_permissions' },
        {
          name: 'permission_audit_log',
          query: 'SELECT COUNT(*) as count FROM permission_audit_log',
        },
        { name: 'system_prompts', query: 'SELECT COUNT(*) as count FROM system_prompts' },
        { name: 'dashboard_users', query: 'SELECT COUNT(*) as count FROM dashboard_users' },
        { name: 'demo_meetings', query: 'SELECT COUNT(*) as count FROM demo_meetings' },
        {
          name: 'demo_github_monitors',
          query: 'SELECT COUNT(*) as count FROM demo_github_monitors',
        },
        {
          name: 'health_monitor_state',
          query: 'SELECT COUNT(*) as count FROM health_monitor_state',
        },
        { name: 'onboarder_sessions', query: 'SELECT COUNT(*) as count FROM onboarder_sessions' },
      ];

      const tables: TableStats[] = [];
      let totalRows = 0;

      // Use the internal pool from db (we need to access it via a method)
      // Since we can't directly access the pool, we'll use the db methods
      for (const tableInfo of tableQueries) {
        try {
          // We need to add a generic query method or use existing methods
          // For now, we'll get the stats we can from existing methods
          let rowCount = 0;

          if (tableInfo.name === 'messages') {
            const stats = await this.db.getStats();
            rowCount = stats.totalMessages;
          } else if (tableInfo.name === 'groups') {
            const groups = await this.db.getAllGroups();
            rowCount = groups.length;
          } else if (tableInfo.name === 'chat_permissions') {
            const perms = await this.db.getAllChatPermissions();
            rowCount = perms.length;
          } else if (tableInfo.name === 'permission_audit_log') {
            const log = await this.db.getPermissionAuditLog(10000);
            rowCount = log.length;
          } else if (tableInfo.name === 'system_prompts') {
            const prompts = await this.db.listSystemPrompts();
            rowCount = prompts.length;
          } else if (tableInfo.name === 'dashboard_users') {
            const users = await this.db.getAllDashboardUsers();
            rowCount = users.length;
          } else if (tableInfo.name === 'demo_meetings') {
            const meetings = await this.db.listDemoMeetings(10000);
            rowCount = meetings.length;
          } else if (tableInfo.name === 'demo_github_monitors') {
            const monitors = await this.db.listDemoGithubMonitors(10000);
            rowCount = monitors.length;
          } else if (tableInfo.name === 'health_monitor_state') {
            const state = await this.db.getAllHealthMonitorState();
            rowCount = Object.keys(state).length;
          } else if (tableInfo.name === 'onboarder_sessions') {
            // Count all sessions - we'd need to query all users, so estimate 0 for now
            rowCount = 0;
          }

          tables.push({
            tableName: tableInfo.name,
            rowCount,
          });
          totalRows += rowCount;
        } catch (err) {
          logger.warn(`Failed to get stats for table ${tableInfo.name}`, {
            error: String(err),
          });
          tables.push({
            tableName: tableInfo.name,
            rowCount: 0,
          });
        }
      }

      // Add Slack tables if available
      if (this.slackDb) {
        try {
          const slackStats = await this.slackDb.getStats();
          tables.push({
            tableName: 'slack_channels',
            rowCount: slackStats.uniqueChannels,
          });
          tables.push({
            tableName: 'slack_messages',
            rowCount: slackStats.totalMessages,
          });
          totalRows += slackStats.uniqueChannels + slackStats.totalMessages;
        } catch (err) {
          logger.warn('Failed to get Slack stats', { error: String(err) });
        }
      }

      return {
        tables,
        totalRows,
        connectionStatus: 'connected',
      };
    } catch (error) {
      logger.error('Failed to get database stats', { error: String(error) });
      return {
        tables: [],
        totalRows: 0,
        connectionStatus: 'error',
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * Get media file statistics from the messages table
   */
  async getMediaStats(): Promise<MediaStorageStats> {
    try {
      const stats = await this.db.getMediaStats();

      // Get date range of media messages
      const mediaMessages = await this.db.getMediaMessages(1000);
      const withTimestamps = mediaMessages.filter((m) => m.timestamp);
      const oldest = withTimestamps.length > 0 ? withTimestamps[withTimestamps.length - 1] : null;
      const newest = withTimestamps.length > 0 ? withTimestamps[0] : null;

      return {
        totalFiles:
          (stats.imageCount ?? 0) +
          (stats.audioCount ?? 0) +
          (stats.videoCount ?? 0) +
          (stats.documentCount ?? 0),
        byType: {
          image: stats.imageCount ?? 0,
          audio: stats.audioCount ?? 0,
          video: stats.videoCount ?? 0,
          document: stats.documentCount ?? 0,
        },
        oldestMedia: oldest?.timestamp ? oldest.timestamp.toISOString() : undefined,
        newestMedia: newest?.timestamp ? newest.timestamp.toISOString() : undefined,
      };
    } catch (error) {
      logger.error('Failed to get media stats', { error: String(error) });
      return {
        totalFiles: 0,
        byType: {
          image: 0,
          audio: 0,
          video: 0,
          document: 0,
        },
      };
    }
  }

  /**
   * Get session storage information
   */
  async getSessionStats(): Promise<SessionStorageStats> {
    const sessionPath = this.sessionPath;

    try {
      const exists = fs.existsSync(sessionPath);

      if (!exists) {
        return {
          status: 'unknown',
          path: sessionPath,
          sizeMB: 0,
          exists: false,
        };
      }

      // Calculate directory size
      const sizeMB = await this.getDirectorySize(sessionPath);

      // Get last modified time
      const stat = fs.statSync(sessionPath);

      // Try to determine connection status from health monitor state
      let status: 'connected' | 'disconnected' | 'unknown' = 'unknown';
      try {
        const pairingStatus = await this.db.getHealthMonitorState('pairing_complete');
        if (pairingStatus === 'true') {
          status = 'connected';
        } else if (pairingStatus === 'false') {
          status = 'disconnected';
        }
      } catch {
        // Ignore - status stays unknown
      }

      return {
        status,
        path: sessionPath,
        sizeMB,
        exists: true,
        lastModified: stat.mtime.toISOString(),
      };
    } catch (error) {
      logger.error('Failed to get session stats', { error: String(error) });
      return {
        status: 'unknown',
        path: sessionPath,
        sizeMB: 0,
        exists: false,
      };
    }
  }

  /**
   * Get cloud storage statistics from billing service
   */
  async getCloudStats(): Promise<CloudStorageStats> {
    const result: CloudStorageStats = {
      cloudflare: { available: false },
      google: { available: false },
    };

    try {
      const billingService = getBillingService();
      const configStatus = await billingService.getConfigStatus();

      // Get Cloudflare stats
      if (configStatus['cloudflare']) {
        try {
          const cfBilling = await billingService.getCloudflareBilling();
          result.cloudflare = {
            available: cfBilling.available,
            storageGB: cfBilling.storageGB,
            error: cfBilling.error,
          };
        } catch (err) {
          result.cloudflare = {
            available: false,
            error: err instanceof Error ? err.message : String(err),
          };
        }
      }

      // Get Google Cloud stats
      if (configStatus['google']) {
        try {
          const gBilling = await billingService.getGoogleBilling();
          result.google = {
            available: gBilling.available,
            storageGB: gBilling.storageGB,
            error: gBilling.error,
          };
        } catch (err) {
          result.google = {
            available: false,
            error: err instanceof Error ? err.message : String(err),
          };
        }
      }
    } catch (error) {
      logger.error('Failed to get cloud stats', { error: String(error) });
    }

    return result;
  }

  /**
   * Get complete storage summary
   */
  async getSummary(): Promise<StorageSummary> {
    const [database, media, session, cloud] = await Promise.all([
      this.getDatabaseStats(),
      this.getMediaStats(),
      this.getSessionStats(),
      this.getCloudStats(),
    ]);

    return {
      database,
      media,
      session,
      cloud,
      fetchedAt: new Date().toISOString(),
    };
  }

  /**
   * Preview what would be deleted when cleaning up old messages
   */
  async previewCleanup(beforeDate: Date): Promise<CleanupPreview> {
    try {
      // Search for messages before the cutoff date
      const oldMessages = await this.db.searchMessages({
        toDate: beforeDate,
        limit: 10000,
      });

      return {
        messagesCount: oldMessages.length,
        oldestMessage:
          oldMessages.length > 0 && oldMessages[oldMessages.length - 1]?.timestamp
            ? oldMessages[oldMessages.length - 1].timestamp.toISOString()
            : undefined,
        newestAffected:
          oldMessages.length > 0 && oldMessages[0]?.timestamp
            ? oldMessages[0].timestamp.toISOString()
            : undefined,
      };
    } catch (error) {
      logger.error('Failed to preview cleanup', { error: String(error) });
      return {
        messagesCount: 0,
      };
    }
  }

  /**
   * Delete old messages before a given date
   */
  async cleanupOldMessages(beforeDate: Date): Promise<CleanupResult> {
    try {
      const daysAgo = Math.ceil((Date.now() - beforeDate.getTime()) / (1000 * 60 * 60 * 24));
      const deletedCount = await this.db.deleteOldMessages(daysAgo);

      logger.info('Cleaned up old messages', {
        beforeDate: beforeDate.toISOString(),
        deletedCount,
      });

      return {
        success: true,
        deletedCount,
      };
    } catch (error) {
      logger.error('Failed to cleanup old messages', { error: String(error) });
      return {
        success: false,
        deletedCount: 0,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * Calculate directory size in MB
   */
  private async getDirectorySize(dirPath: string): Promise<number> {
    let totalSize = 0;

    try {
      const items = fs.readdirSync(dirPath);

      for (const item of items) {
        const fullPath = path.join(dirPath, item);
        const stat = fs.statSync(fullPath);

        if (stat.isFile()) {
          totalSize += stat.size;
        } else if (stat.isDirectory()) {
          totalSize += await this.getDirectorySize(fullPath);
        }
      }
    } catch (error) {
      logger.warn('Failed to calculate directory size', {
        path: dirPath,
        error: String(error),
      });
    }

    // Convert to MB
    return totalSize / (1024 * 1024);
  }
}

// Singleton instance
let storageServiceInstance: StorageService | null = null;

/**
 * Initialize the storage service (call once during startup)
 */
export function initStorageService(
  db: MessageDatabase,
  slackDb: SlackDatabase | null = null
): StorageService {
  storageServiceInstance = new StorageService(db, slackDb);
  logger.info('Storage service initialized');
  return storageServiceInstance;
}

/**
 * Get the storage service instance
 */
export function getStorageService(): StorageService {
  if (!storageServiceInstance) {
    throw new Error('Storage service not initialized. Call initStorageService first.');
  }
  return storageServiceInstance;
}
