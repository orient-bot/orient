/**
 * Feature Flags Routes
 *
 * API endpoints for managing feature flags.
 * Feature flags are stored in the database and can be toggled from the UI.
 */

import { Router, Request, Response } from 'express';
import { createServiceLogger } from '@orient/core';
import { getDatabase, featureFlags, eq } from '@orient/database';

const logger = createServiceLogger('feature-flags-routes');

export function createFeatureFlagsRoutes(
  requireAuth: (req: Request, res: Response, next: () => void) => void
): Router {
  const router = Router();
  const db = getDatabase();

  /**
   * GET /api/feature-flags
   * Retrieve all feature flags from the database as array with effective values
   */
  router.get('/', requireAuth, async (_req: Request, res: Response) => {
    try {
      const dbFlags = await db.select().from(featureFlags).orderBy(featureFlags.sortOrder);

      // Transform to FeatureFlagWithOverride format expected by frontend
      const flags = dbFlags.map((flag) => ({
        id: flag.id,
        name: flag.name,
        description: flag.description,
        enabled: flag.enabled ?? true,
        category: flag.category ?? 'ui',
        sortOrder: flag.sortOrder ?? 0,
        createdAt: flag.createdAt?.toISOString() ?? new Date().toISOString(),
        updatedAt: flag.updatedAt?.toISOString() ?? new Date().toISOString(),
        userOverride: null, // No user overrides implemented yet
        effectiveValue: flag.enabled ?? true,
      }));

      res.json({ flags });
    } catch (error) {
      logger.error('Failed to retrieve feature flags', { error: String(error) });
      res.status(500).json({ error: 'Failed to retrieve feature flags' });
    }
  });

  /**
   * GET /api/feature-flags/list
   * Get detailed list of all flags with metadata
   */
  router.get('/list', requireAuth, async (_req: Request, res: Response) => {
    try {
      const flags = await db.select().from(featureFlags).orderBy(featureFlags.sortOrder);

      res.json({ flags });
    } catch (error) {
      logger.error('Failed to list feature flags', { error: String(error) });
      res.status(500).json({ error: 'Failed to list feature flags' });
    }
  });

  /**
   * GET /api/feature-flags/effective
   * Get flat map of flag IDs to their effective boolean values
   */
  router.get('/effective', requireAuth, async (_req: Request, res: Response) => {
    try {
      const dbFlags = await db.select().from(featureFlags).orderBy(featureFlags.sortOrder);

      const flags: Record<string, boolean> = {};
      for (const flag of dbFlags) {
        flags[flag.id] = flag.enabled ?? true;
      }

      res.json({ flags });
    } catch (error) {
      logger.error('Failed to retrieve effective flags', { error: String(error) });
      res.status(500).json({ error: 'Failed to retrieve effective flags' });
    }
  });

  /**
   * PUT /api/feature-flags/:flagId
   * Update a specific feature flag - persisted to database
   */
  router.put('/:flagId', requireAuth, async (req: Request, res: Response) => {
    try {
      const { flagId } = req.params;
      const { enabled } = req.body;

      // Validate enabled is a boolean
      if (typeof enabled !== 'boolean') {
        return res.status(400).json({ error: 'enabled must be a boolean' });
      }

      // Check if flag exists
      const existingFlag = await db
        .select()
        .from(featureFlags)
        .where(eq(featureFlags.id, flagId))
        .limit(1);

      if (existingFlag.length === 0) {
        return res.status(404).json({
          error: `Feature flag '${flagId}' not found`,
        });
      }

      // Update the flag
      await db
        .update(featureFlags)
        .set({
          enabled,
          updatedAt: new Date(),
        })
        .where(eq(featureFlags.id, flagId));

      logger.info('Feature flag updated', { flagId, enabled });

      // Return updated flags list
      const dbFlags = await db.select().from(featureFlags).orderBy(featureFlags.sortOrder);

      const flags = dbFlags.map((flag) => ({
        id: flag.id,
        name: flag.name,
        description: flag.description,
        enabled: flag.enabled ?? true,
        category: flag.category ?? 'ui',
        sortOrder: flag.sortOrder ?? 0,
        createdAt: flag.createdAt?.toISOString() ?? new Date().toISOString(),
        updatedAt: flag.updatedAt?.toISOString() ?? new Date().toISOString(),
        userOverride: null,
        effectiveValue: flag.enabled ?? true,
      }));

      res.json({
        success: true,
        flags,
      });
    } catch (error) {
      logger.error('Failed to update feature flag', { error: String(error) });
      res.status(500).json({ error: 'Failed to update feature flag' });
    }
  });

  /**
   * PUT /api/feature-flags/:flagId/override
   * Set a user override for a flag (currently updates global flag)
   */
  router.put('/:flagId/override', requireAuth, async (req: Request, res: Response) => {
    try {
      const { flagId } = req.params;
      const { enabled } = req.body;

      if (typeof enabled !== 'boolean') {
        return res.status(400).json({ error: 'enabled must be a boolean' });
      }

      // Check if flag exists
      const existingFlag = await db
        .select()
        .from(featureFlags)
        .where(eq(featureFlags.id, flagId))
        .limit(1);

      if (existingFlag.length === 0) {
        return res.status(404).json({ error: `Feature flag '${flagId}' not found` });
      }

      // Update the flag (for now, updates global value)
      await db
        .update(featureFlags)
        .set({ enabled, updatedAt: new Date() })
        .where(eq(featureFlags.id, flagId));

      logger.info('Feature flag override set', { flagId, enabled });

      // Return updated flags list
      const dbFlags = await db.select().from(featureFlags).orderBy(featureFlags.sortOrder);

      const flags = dbFlags.map((flag) => ({
        id: flag.id,
        name: flag.name,
        description: flag.description,
        enabled: flag.enabled ?? true,
        category: flag.category ?? 'ui',
        sortOrder: flag.sortOrder ?? 0,
        createdAt: flag.createdAt?.toISOString() ?? new Date().toISOString(),
        updatedAt: flag.updatedAt?.toISOString() ?? new Date().toISOString(),
        userOverride: flag.id === flagId ? enabled : null,
        effectiveValue: flag.enabled ?? true,
      }));

      res.json({ success: true, flags });
    } catch (error) {
      logger.error('Failed to set feature flag override', { error: String(error) });
      res.status(500).json({ error: 'Failed to set feature flag override' });
    }
  });

  /**
   * DELETE /api/feature-flags/:flagId/override
   * Remove a user override (no-op currently, returns current state)
   */
  router.delete('/:flagId/override', requireAuth, async (req: Request, res: Response) => {
    try {
      const { flagId } = req.params;

      // Check if flag exists
      const existingFlag = await db
        .select()
        .from(featureFlags)
        .where(eq(featureFlags.id, flagId))
        .limit(1);

      if (existingFlag.length === 0) {
        return res.status(404).json({ error: `Feature flag '${flagId}' not found` });
      }

      logger.info('Feature flag override removed', { flagId });

      // Return current flags list
      const dbFlags = await db.select().from(featureFlags).orderBy(featureFlags.sortOrder);

      const flags = dbFlags.map((flag) => ({
        id: flag.id,
        name: flag.name,
        description: flag.description,
        enabled: flag.enabled ?? true,
        category: flag.category ?? 'ui',
        sortOrder: flag.sortOrder ?? 0,
        createdAt: flag.createdAt?.toISOString() ?? new Date().toISOString(),
        updatedAt: flag.updatedAt?.toISOString() ?? new Date().toISOString(),
        userOverride: null,
        effectiveValue: flag.enabled ?? true,
      }));

      res.json({ success: true, flags });
    } catch (error) {
      logger.error('Failed to remove feature flag override', { error: String(error) });
      res.status(500).json({ error: 'Failed to remove feature flag override' });
    }
  });

  return router;
}
