/**
 * Feature Flags Service
 *
 * Manages hierarchical feature flags with per-user overrides.
 * Supports dot-notation hierarchy (e.g., 'mini_apps.edit_with_ai').
 *
 * Uses Drizzle ORM with SQLite.
 */

import { createServiceLogger } from '@orient/core';
import { getDatabase, closeDatabase, eq, and, asc, schema } from '@orient/database';
import type { Database } from '@orient/database';

const logger = createServiceLogger('feature-flags-service');

// ============================================
// Types
// ============================================

export interface FeatureFlag {
  id: string;
  name: string;
  description: string | null;
  enabled: boolean;
  category: string;
  sortOrder: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface FeatureFlagWithOverride extends FeatureFlag {
  userOverride: boolean | null; // null = using global default
  effectiveValue: boolean; // Resolved value considering hierarchy
}

export interface SetOverrideInput {
  enabled: boolean;
}

// ============================================
// Service
// ============================================

export class FeatureFlagsService {
  private _db: Database | null = null;

  constructor() {
    // SQLite path is configured via SQLITE_DATABASE env var or defaults
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
   * Get all feature flags (global values only)
   */
  async getAllFlags(): Promise<FeatureFlag[]> {
    const results = await this.db
      .select()
      .from(schema.featureFlags)
      .orderBy(asc(schema.featureFlags.sortOrder), asc(schema.featureFlags.id));

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return results.map((row: any) => ({
      id: row.id,
      name: row.name,
      description: row.description,
      enabled: row.enabled ?? true,
      category: row.category ?? 'ui',
      sortOrder: row.sortOrder ?? 0,
      createdAt: row.createdAt ?? new Date(),
      updatedAt: row.updatedAt ?? new Date(),
    }));
  }

  /**
   * Get all flags with user overrides applied
   */
  async getAllFlagsWithOverrides(userId: number): Promise<FeatureFlagWithOverride[]> {
    // Get all flags
    const flagResults = await this.db
      .select()
      .from(schema.featureFlags)
      .orderBy(asc(schema.featureFlags.sortOrder), asc(schema.featureFlags.id));

    // Get user overrides
    const overrideResults = await this.db
      .select()
      .from(schema.userFeatureFlagOverrides)
      .where(eq(schema.userFeatureFlagOverrides.userId, userId));

    // Build override map
    const overrideMap = new Map<string, boolean>();
    for (const override of overrideResults) {
      overrideMap.set(override.flagId, override.enabled);
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const flags: FeatureFlagWithOverride[] = flagResults.map((row: any) => {
      const userOverride = overrideMap.has(row.id) ? overrideMap.get(row.id)! : null;
      const baseEnabled = row.enabled ?? true;
      return {
        id: row.id,
        name: row.name,
        description: row.description,
        enabled: baseEnabled,
        category: row.category ?? 'ui',
        sortOrder: row.sortOrder ?? 0,
        createdAt: row.createdAt ?? new Date(),
        updatedAt: row.updatedAt ?? new Date(),
        userOverride,
        effectiveValue: userOverride !== null ? userOverride : baseEnabled,
      };
    });

    // Build a map for quick lookup
    const flagMap = new Map<string, FeatureFlagWithOverride>();
    for (const flag of flags) {
      flagMap.set(flag.id, flag);
    }

    // Apply cascade logic: if parent is off, children are effectively off
    for (const flag of flags) {
      flag.effectiveValue = this.computeEffectiveValue(flag.id, flagMap);
    }

    return flags;
  }

  /**
   * Get effective flag values as a flat record (for frontend)
   * Returns: { 'mini_apps': true, 'mini_apps.create': true, ... }
   */
  async getEffectiveFlags(userId: number): Promise<Record<string, boolean>> {
    const flags = await this.getAllFlagsWithOverrides(userId);
    const result: Record<string, boolean> = {};

    for (const flag of flags) {
      result[flag.id] = flag.effectiveValue;
    }

    return result;
  }

  /**
   * Set a user override for a flag
   */
  async setUserOverride(userId: number, flagId: string, enabled: boolean): Promise<void> {
    // Verify the flag exists
    const flagExists = await this.db
      .select({ id: schema.featureFlags.id })
      .from(schema.featureFlags)
      .where(eq(schema.featureFlags.id, flagId))
      .limit(1);

    if (flagExists.length === 0) {
      throw new Error(`Feature flag '${flagId}' does not exist`);
    }

    await this.db
      .insert(schema.userFeatureFlagOverrides)
      .values({
        userId,
        flagId,
        enabled,
        updatedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: [schema.userFeatureFlagOverrides.userId, schema.userFeatureFlagOverrides.flagId],
        set: {
          enabled,
          updatedAt: new Date(),
        },
      });

    logger.info('Set user feature flag override', { userId, flagId, enabled });
  }

  /**
   * Remove a user override (revert to global default)
   */
  async removeUserOverride(userId: number, flagId: string): Promise<void> {
    await this.db
      .delete(schema.userFeatureFlagOverrides)
      .where(
        and(
          eq(schema.userFeatureFlagOverrides.userId, userId),
          eq(schema.userFeatureFlagOverrides.flagId, flagId)
        )
      );

    logger.info('Removed user feature flag override', { userId, flagId });
  }

  /**
   * Get parent flag ID from a hierarchical flag ID
   * e.g., 'mini_apps.create' -> 'mini_apps'
   *       'mini_apps' -> null
   */
  getParentId(flagId: string): string | null {
    const lastDot = flagId.lastIndexOf('.');
    if (lastDot === -1) {
      return null;
    }
    return flagId.substring(0, lastDot);
  }

  /**
   * Get all ancestor flag IDs (including self)
   * e.g., 'a.b.c' -> ['a', 'a.b', 'a.b.c']
   */
  getAncestorIds(flagId: string): string[] {
    const parts = flagId.split('.');
    const ancestors: string[] = [];
    for (let i = 1; i <= parts.length; i++) {
      ancestors.push(parts.slice(0, i).join('.'));
    }
    return ancestors;
  }

  /**
   * Compute effective value considering hierarchy
   * A flag is only enabled if ALL ancestors are enabled
   */
  private computeEffectiveValue(
    flagId: string,
    flagMap: Map<string, FeatureFlagWithOverride>
  ): boolean {
    const ancestors = this.getAncestorIds(flagId);

    for (const ancestorId of ancestors) {
      const ancestor = flagMap.get(ancestorId);
      if (ancestor) {
        const baseValue = ancestor.userOverride !== null ? ancestor.userOverride : ancestor.enabled;
        if (!baseValue) {
          return false;
        }
      }
    }

    return true;
  }

  /**
   * Close the database connection pool
   */
  async close(): Promise<void> {
    await closeDatabase();
  }
}

// ============================================
// Factory
// ============================================

export function createFeatureFlagsService(): FeatureFlagsService {
  return new FeatureFlagsService();
}
