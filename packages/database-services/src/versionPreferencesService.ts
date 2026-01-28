/**
 * Version Preferences Service
 *
 * Manages user preferences for version update notifications using Drizzle ORM.
 * Handles notification settings, dismissed versions, and remind-later timestamps.
 */

import { createServiceLogger } from '@orientbot/core';
import { getDatabase, eq, and, lt, schema, sql } from '@orientbot/database';
import type { Database } from '@orientbot/database';

const logger = createServiceLogger('version-preferences-service');

// ============================================
// Types
// ============================================

export interface UserVersionPreferences {
  userId: number;
  notificationsEnabled: boolean;
  dismissedVersions: string[];
  remindLaterUntil: Date | null;
  createdAt: Date | null;
  updatedAt: Date | null;
}

export interface UpdatePreferencesInput {
  notificationsEnabled?: boolean;
}

// ============================================
// Service
// ============================================

export class VersionPreferencesService {
  private _db: Database | null = null;

  private get db(): Database {
    if (!this._db) {
      this._db = getDatabase();
    }
    return this._db;
  }

  private parseVersions(json: string | null): string[] {
    if (!json) return [];
    try {
      return JSON.parse(json);
    } catch {
      return [];
    }
  }

  /**
   * Get user's version preferences
   * Creates default preferences if none exist
   */
  async getPreferences(userId: number): Promise<UserVersionPreferences> {
    const result = await this.db
      .select()
      .from(schema.userVersionPreferences)
      .where(eq(schema.userVersionPreferences.userId, userId))
      .limit(1);

    if (result.length > 0) {
      const row = result[0];
      return {
        userId: row.userId,
        notificationsEnabled: row.notificationsEnabled ?? true,
        dismissedVersions: this.parseVersions(row.dismissedVersions),
        remindLaterUntil: row.remindLaterUntil,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
      };
    }

    // Create default preferences
    await this.db
      .insert(schema.userVersionPreferences)
      .values({
        userId,
        notificationsEnabled: true,
        dismissedVersions: '[]',
      })
      .onConflictDoNothing();

    // Fetch the inserted row
    const insertedResult = await this.db
      .select()
      .from(schema.userVersionPreferences)
      .where(eq(schema.userVersionPreferences.userId, userId))
      .limit(1);

    if (insertedResult.length > 0) {
      const row = insertedResult[0];
      return {
        userId: row.userId,
        notificationsEnabled: row.notificationsEnabled ?? true,
        dismissedVersions: this.parseVersions(row.dismissedVersions),
        remindLaterUntil: row.remindLaterUntil,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
      };
    }

    // Race condition: return default
    return {
      userId,
      notificationsEnabled: true,
      dismissedVersions: [],
      remindLaterUntil: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
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

    const updateData: Record<string, unknown> = {
      updatedAt: new Date(),
    };

    if (updates.notificationsEnabled !== undefined) {
      updateData.notificationsEnabled = updates.notificationsEnabled;
    }

    await this.db
      .update(schema.userVersionPreferences)
      .set(updateData)
      .where(eq(schema.userVersionPreferences.userId, userId));

    logger.info('Updated version preferences', { userId, updates });

    return this.getPreferences(userId);
  }

  /**
   * Dismiss a specific version notification
   */
  async dismissVersion(userId: number, version: string): Promise<void> {
    const prefs = await this.getPreferences(userId);
    const versions = prefs.dismissedVersions.filter((v) => v !== version);
    versions.push(version);

    await this.db
      .update(schema.userVersionPreferences)
      .set({
        dismissedVersions: JSON.stringify(versions),
        remindLaterUntil: null,
        updatedAt: new Date(),
      })
      .where(eq(schema.userVersionPreferences.userId, userId));

    logger.info('Dismissed version notification', { userId, version });
  }

  /**
   * Set "remind me later" for version notifications
   */
  async remindLater(userId: number, hours: number): Promise<void> {
    await this.getPreferences(userId);

    const remindUntil = new Date(Date.now() + hours * 60 * 60 * 1000);

    await this.db
      .update(schema.userVersionPreferences)
      .set({
        remindLaterUntil: remindUntil,
        updatedAt: new Date(),
      })
      .where(eq(schema.userVersionPreferences.userId, userId));

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

    if (!prefs.notificationsEnabled) {
      return false;
    }

    if (prefs.dismissedVersions.includes(version)) {
      return false;
    }

    if (prefs.remindLaterUntil && prefs.remindLaterUntil > new Date()) {
      return false;
    }

    return true;
  }

  /**
   * Clear remind-later if it has expired
   */
  async clearExpiredRemindLater(userId: number): Promise<void> {
    await this.db
      .update(schema.userVersionPreferences)
      .set({
        remindLaterUntil: null,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(schema.userVersionPreferences.userId, userId),
          lt(schema.userVersionPreferences.remindLaterUntil, new Date())
        )
      );
  }

  /**
   * Close the database connection
   */
  async close(): Promise<void> {
    // No-op for SQLite singleton
  }
}

// ============================================
// Factory
// ============================================

export function createVersionPreferencesService(): VersionPreferencesService {
  return new VersionPreferencesService();
}
