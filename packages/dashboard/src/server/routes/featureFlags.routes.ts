/**
 * Feature Flags Routes
 *
 * API endpoints for managing feature flags with per-user overrides.
 * Supports hierarchical flag IDs with cascade logic.
 */

import { Router, Request, Response } from 'express';
import { createServiceLogger } from '@orient/core';
import { createFeatureFlagsService } from '@orient/database-services';
import { AuthenticatedRequest } from '../../auth.js';

const logger = createServiceLogger('feature-flags-routes');

/**
 * Create Feature Flags routes
 */
export function createFeatureFlagsRoutes(
  requireAuth: (req: Request, res: Response, next: () => void) => void
): Router {
  const router = Router();
  const featureFlagsService = createFeatureFlagsService();

  // ============================================
  // Feature Flags Endpoints
  // ============================================

  /**
   * GET /api/feature-flags
   * Get all feature flags with user overrides
   */
  router.get('/', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
    try {
      if (!req.user) {
        return res.status(401).json({ error: 'Not authenticated' });
      }

      const flags = await featureFlagsService.getAllFlagsWithOverrides(req.user.userId);
      res.json({ flags });
    } catch (error) {
      logger.error('Failed to get feature flags', {
        error: error instanceof Error ? error.message : String(error),
      });
      res.status(500).json({ error: 'Failed to get feature flags' });
    }
  });

  /**
   * GET /api/feature-flags/effective
   * Get effective flag values as a flat object
   * Returns: { 'mini_apps': true, 'mini_apps.create': true, ... }
   */
  router.get('/effective', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
    try {
      if (!req.user) {
        return res.status(401).json({ error: 'Not authenticated' });
      }

      const effectiveFlags = await featureFlagsService.getEffectiveFlags(req.user.userId);
      res.json({ flags: effectiveFlags });
    } catch (error) {
      logger.error('Failed to get effective feature flags', {
        error: error instanceof Error ? error.message : String(error),
      });
      res.status(500).json({ error: 'Failed to get effective feature flags' });
    }
  });

  /**
   * PUT /api/feature-flags/:flagId/override
   * Set a user override for a specific flag
   */
  router.put('/:flagId/override', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
    try {
      if (!req.user) {
        return res.status(401).json({ error: 'Not authenticated' });
      }

      const { flagId } = req.params;
      const { enabled } = req.body;

      if (typeof enabled !== 'boolean') {
        return res.status(400).json({ error: 'enabled must be a boolean' });
      }

      await featureFlagsService.setUserOverride(req.user.userId, flagId, enabled);

      // Return updated flags
      const flags = await featureFlagsService.getAllFlagsWithOverrides(req.user.userId);
      res.json({ success: true, flags });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.error('Failed to set feature flag override', {
        error: message,
        flagId: req.params.flagId,
      });

      // Check if it's a "not found" error
      if (message.includes('does not exist')) {
        return res.status(404).json({ error: message });
      }

      res.status(500).json({ error: 'Failed to set feature flag override' });
    }
  });

  /**
   * DELETE /api/feature-flags/:flagId/override
   * Remove a user override (revert to global default)
   */
  router.delete(
    '/:flagId/override',
    requireAuth,
    async (req: AuthenticatedRequest, res: Response) => {
      try {
        if (!req.user) {
          return res.status(401).json({ error: 'Not authenticated' });
        }

        const { flagId } = req.params;

        await featureFlagsService.removeUserOverride(req.user.userId, flagId);

        // Return updated flags
        const flags = await featureFlagsService.getAllFlagsWithOverrides(req.user.userId);
        res.json({ success: true, flags });
      } catch (error) {
        logger.error('Failed to remove feature flag override', {
          error: error instanceof Error ? error.message : String(error),
          flagId: req.params.flagId,
        });
        res.status(500).json({ error: 'Failed to remove feature flag override' });
      }
    }
  );

  logger.info('Feature flags routes initialized');

  return router;
}
