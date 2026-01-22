/**
 * Feature Flags Service
 *
 * Manages hierarchical feature flags with per-user overrides.
 * Supports dot-notation hierarchy (e.g., 'mini_apps.edit_with_ai').
 */

import pg from 'pg';
import { createServiceLogger } from '@orient/core';

const { Pool } = pg;
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
   * Get all feature flags (global values only)
   */
  async getAllFlags(): Promise<FeatureFlag[]> {
    const result = await this.pool.query(
      `SELECT
        id,
        name,
        description,
        enabled,
        category,
        sort_order,
        created_at,
        updated_at
       FROM feature_flags
       ORDER BY sort_order ASC, id ASC`
    );

    return result.rows.map((row) => ({
      id: row.id,
      name: row.name,
      description: row.description,
      enabled: row.enabled,
      category: row.category,
      sortOrder: row.sort_order,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    }));
  }

  /**
   * Get all flags with user overrides applied
   */
  async getAllFlagsWithOverrides(userId: number): Promise<FeatureFlagWithOverride[]> {
    const result = await this.pool.query(
      `SELECT
        f.id,
        f.name,
        f.description,
        f.enabled,
        f.category,
        f.sort_order,
        f.created_at,
        f.updated_at,
        o.enabled as user_override
       FROM feature_flags f
       LEFT JOIN user_feature_flag_overrides o
         ON f.id = o.flag_id AND o.user_id = $1
       ORDER BY f.sort_order ASC, f.id ASC`,
      [userId]
    );

    const flags = result.rows.map((row) => ({
      id: row.id,
      name: row.name,
      description: row.description,
      enabled: row.enabled,
      category: row.category,
      sortOrder: row.sort_order,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      userOverride: row.user_override,
      effectiveValue: row.user_override !== null ? row.user_override : row.enabled,
    }));

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
    const flagExists = await this.pool.query('SELECT id FROM feature_flags WHERE id = $1', [
      flagId,
    ]);

    if (flagExists.rows.length === 0) {
      throw new Error(`Feature flag '${flagId}' does not exist`);
    }

    await this.pool.query(
      `INSERT INTO user_feature_flag_overrides (user_id, flag_id, enabled, updated_at)
       VALUES ($1, $2, $3, NOW())
       ON CONFLICT (user_id, flag_id)
       DO UPDATE SET enabled = $3, updated_at = NOW()`,
      [userId, flagId, enabled]
    );

    logger.info('Set user feature flag override', { userId, flagId, enabled });
  }

  /**
   * Remove a user override (revert to global default)
   */
  async removeUserOverride(userId: number, flagId: string): Promise<void> {
    await this.pool.query(
      `DELETE FROM user_feature_flag_overrides
       WHERE user_id = $1 AND flag_id = $2`,
      [userId, flagId]
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
    await this.pool.end();
  }
}

// ============================================
// Factory
// ============================================

export function createFeatureFlagsService(connectionString?: string): FeatureFlagsService {
  return new FeatureFlagsService(connectionString);
}
