/**
 * Feature Flags Routes
 *
 * API endpoints for managing feature flags and UI visibility.
 *
 * Feature flags are resolved with the following priority:
 * 1. Environment variables (FEATURE_FLAG_<FLAG_ID>=true/false)
 * 2. Config file values
 * 3. Pre-launch defaults (all disabled)
 */

import { Router, Request, Response } from 'express';
import {
  getConfig,
  createServiceLogger,
  resolveFeatureFlags,
  getFeatureFlagsForApi,
  getAllFlagIds,
  getEnvVarName,
  PRE_LAUNCH_DEFAULTS,
} from '@orient/core';

const logger = createServiceLogger('feature-flags-routes');

export function createFeatureFlagsRoutes(
  requireAuth: (req: Request, res: Response, next: () => void) => void
): Router {
  const router = Router();

  /**
   * GET /api/feature-flags
   * Retrieve all feature flags with proper resolution
   *
   * Returns resolved flags (env vars > config file > defaults)
   */
  router.get('/', requireAuth, async (_req: Request, res: Response) => {
    try {
      const config = getConfig();

      // Use centralized resolution (env vars > config > defaults)
      const resolvedFlags = resolveFeatureFlags(config.features);
      const flags = getFeatureFlagsForApi(resolvedFlags);

      res.json({ flags });
    } catch (error) {
      logger.error('Failed to retrieve feature flags', { error: String(error) });

      // Fallback to pre-launch defaults if resolution fails
      // This ensures the UI never breaks, just shows a safe state
      const fallbackFlags = getFeatureFlagsForApi(PRE_LAUNCH_DEFAULTS);
      res.json({ flags: fallbackFlags });
    }
  });

  /**
   * GET /api/feature-flags/documentation
   * Get documentation about feature flags and their env vars
   */
  router.get('/documentation', requireAuth, async (_req: Request, res: Response) => {
    try {
      const flagIds = getAllFlagIds();
      const documentation = flagIds.map((flagId) => ({
        flagId,
        envVar: getEnvVarName(flagId),
        defaultEnabled:
          PRE_LAUNCH_DEFAULTS[flagId as keyof typeof PRE_LAUNCH_DEFAULTS]?.enabled ?? false,
      }));

      res.json({
        documentation,
        notes: [
          'All features are DISABLED by default (pre-launch safe)',
          'To enable features, use environment variables: FEATURE_FLAG_<FLAG_ID>=true',
          'Or configure in config.yml under the features section',
          'Environment variables take highest priority',
        ],
      });
    } catch (error) {
      logger.error('Failed to get feature flags documentation', { error: String(error) });
      res.status(500).json({ error: 'Failed to get documentation' });
    }
  });

  /**
   * PUT /api/feature-flags/:flagId
   * Update a specific feature flag
   *
   * Note: Changes are NOT persisted to config file.
   * Use environment variables or config.yml for permanent changes.
   */
  router.put('/:flagId', requireAuth, async (req: Request, res: Response) => {
    try {
      const { flagId } = req.params;
      const { enabled, uiStrategy } = req.body;

      // Validate flag ID exists
      const allFlags = getAllFlagIds();
      if (!allFlags.includes(flagId)) {
        return res.status(404).json({
          error: `Feature flag '${flagId}' not found`,
          availableFlags: allFlags,
        });
      }

      // Validate inputs
      if (enabled !== undefined && typeof enabled !== 'boolean') {
        return res.status(400).json({ error: 'enabled must be a boolean' });
      }

      if (uiStrategy !== undefined && !['hide', 'notify'].includes(uiStrategy)) {
        return res.status(400).json({ error: 'uiStrategy must be "hide" or "notify"' });
      }

      const envVarName = getEnvVarName(flagId);

      logger.info('Feature flag update requested (not persisted)', {
        flagId,
        enabled,
        uiStrategy,
      });

      res.json({
        success: true,
        message:
          'Changes are not persisted. To make permanent changes, use environment variables or config.yml.',
        flagId,
        hint: `Set environment variable: ${envVarName}=${enabled ? 'true' : 'false'}`,
      });
    } catch (error) {
      logger.error('Failed to update feature flag', { error: String(error) });
      res.status(500).json({ error: 'Failed to update feature flag' });
    }
  });

  return router;
}
