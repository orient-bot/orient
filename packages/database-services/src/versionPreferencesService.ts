/**
 * Version Preferences Service
 *
 * Manages user preferences for version update notifications.
 * Handles notification settings, dismissed versions, and remind-later timestamps.
 */

import pg from 'pg';
import { createServiceLogger } from '@orient/core';

const { Pool } = pg;
const logger = createServiceLogger('version-preferences-service');

// ============================================
// Types
// ============================================

export interface UserVersionPreferences {
  userId: number;
  notificationsEnabled: boolean;
  dismissedVersions: string[];
  remindLaterUntil: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface UpdatePreferencesInput {
  notificationsEnabled?: boolean;
}

// ============================================
// Service
// ============================================

export class VersionPreferencesService {
  private pool: pg.Pool;

  constructor(connectionString?: string) {
    const dbUrl =
      connectionString ||
      process.env.DATABASE_URL ||
      'postgresql://aibot:aibot123@localhost:5432/whatsapp_bot_0';

    this.pool = new Pool({
      connectionString: dbUrl,
      max: 10,
      idleTimeoutMillis: 30000,
    });
  }

  /**
   * Get user's version preferences
   * Creates default preferences if none exist
   */
  async getPreferences(userId: number): Promise<UserVersionPreferences> {
    // Try to get existing preferences
    const result = await this.pool.query(
      `SELECT
        user_id,
        notifications_enabled,
        dismissed_versions,
        remind_later_until,
        created_at,
        updated_at
       FROM user_version_preferences
       WHERE user_id = $1`,
      [userId]
    );

    if (result.rows.length > 0) {
      const row = result.rows[0];
      return {
        userId: row.user_id,
        notificationsEnabled: row.notifications_enabled,
        dismissedVersions: row.dismissed_versions || [],
        remindLaterUntil: row.remind_later_until,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      };
    }

    // Create default preferences
    const insertResult = await this.pool.query(
      `INSERT INTO user_version_preferences (user_id, notifications_enabled, dismissed_versions)
       VALUES ($1, true, '{}')
       ON CONFLICT (user_id) DO NOTHING
       RETURNING
        user_id,
        notifications_enabled,
        dismissed_versions,
        remind_later_until,
        created_at,
        updated_at`,
      [userId]
    );

    // If insert succeeded, return the new row
    if (insertResult.rows.length > 0) {
      const row = insertResult.rows[0];
      return {
        userId: row.user_id,
        notificationsEnabled: row.notifications_enabled,
        dismissedVersions: row.dismissed_versions || [],
        remindLaterUntil: row.remind_later_until,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      };
    }

    // Race condition: another process inserted, fetch again
    return this.getPreferences(userId);
  }

  /**
   * Update user's version preferences
   */
  async updatePreferences(
    userId: number,
    updates: UpdatePreferencesInput
  ): Promise<UserVersionPreferences> {
    // Ensure preferences exist
    await this.getPreferences(userId);

    // Build update query dynamically
    const setClauses: string[] = ['updated_at = NOW()'];
    const values: unknown[] = [];
    let paramIndex = 1;

    if (updates.notificationsEnabled !== undefined) {
      setClauses.push(`notifications_enabled = $${paramIndex++}`);
      values.push(updates.notificationsEnabled);
    }

    values.push(userId);

    const result = await this.pool.query(
      `UPDATE user_version_preferences
       SET ${setClauses.join(', ')}
       WHERE user_id = $${paramIndex}
       RETURNING
        user_id,
        notifications_enabled,
        dismissed_versions,
        remind_later_until,
        created_at,
        updated_at`,
      values
    );

    const row = result.rows[0];
    logger.info('Updated version preferences', { userId, updates });

    return {
      userId: row.user_id,
      notificationsEnabled: row.notifications_enabled,
      dismissedVersions: row.dismissed_versions || [],
      remindLaterUntil: row.remind_later_until,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  /**
   * Dismiss a specific version notification
   */
  async dismissVersion(userId: number, version: string): Promise<void> {
    // Ensure preferences exist
    await this.getPreferences(userId);

    await this.pool.query(
      `UPDATE user_version_preferences
       SET
        dismissed_versions = array_append(
          array_remove(dismissed_versions, $2),
          $2
        ),
        remind_later_until = NULL,
        updated_at = NOW()
       WHERE user_id = $1`,
      [userId, version]
    );

    logger.info('Dismissed version notification', { userId, version });
  }

  /**
   * Set "remind me later" for version notifications
   */
  async remindLater(userId: number, hours: number): Promise<void> {
    // Ensure preferences exist
    await this.getPreferences(userId);

    const remindUntil = new Date(Date.now() + hours * 60 * 60 * 1000);

    await this.pool.query(
      `UPDATE user_version_preferences
       SET
        remind_later_until = $2,
        updated_at = NOW()
       WHERE user_id = $1`,
      [userId, remindUntil]
    );

    logger.info('Set remind later for version notification', { userId, hours, remindUntil });
  }

  /**
   * Check if a version has been dismissed by the user
   */
  async isVersionDismissed(userId: number, version: string): Promise<boolean> {
    const prefs = await this.getPreferences(userId);
    return prefs.dismissedVersions.includes(version);
  }

  /**
   * Check if the user should see version notifications
   * (enabled and not in remind-later period)
   */
  async shouldShowNotification(userId: number, version: string): Promise<boolean> {
    const prefs = await this.getPreferences(userId);

    // Check if notifications are enabled
    if (!prefs.notificationsEnabled) {
      return false;
    }

    // Check if version is dismissed
    if (prefs.dismissedVersions.includes(version)) {
      return false;
    }

    // Check if in remind-later period
    if (prefs.remindLaterUntil && prefs.remindLaterUntil > new Date()) {
      return false;
    }

    return true;
  }

  /**
   * Clear remind-later if it has expired
   */
  async clearExpiredRemindLater(userId: number): Promise<void> {
    await this.pool.query(
      `UPDATE user_version_preferences
       SET remind_later_until = NULL, updated_at = NOW()
       WHERE user_id = $1 AND remind_later_until < NOW()`,
      [userId]
    );
  }

  /**
   * Close the database connection pool
   */
  async close(): Promise<void> {
    await this.pool.end();
  }
}

// ============================================
// Factory
// ============================================

export function createVersionPreferencesService(
  connectionString?: string
): VersionPreferencesService {
  return new VersionPreferencesService(connectionString);
}
