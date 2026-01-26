/**
 * Version Routes
 *
 * API endpoints for version checking and notification preferences.
 * Allows users to:
 * - Check for new versions
 * - Manage notification preferences
 * - Dismiss specific versions
 * - Set "remind me later" for notifications
 */

import { Router, Request, Response } from 'express';
import { createServiceLogger } from '@orientbot/core';
import { getVersionCheckService } from '../../services/versionCheckService.js';
import { createVersionPreferencesService } from '@orientbot/database-services';
import { AuthenticatedRequest } from '../../auth.js';

const logger = createServiceLogger('version-routes');

/**
 * Create Version routes
 */
export function createVersionRoutes(
  requireAuth: (req: Request, res: Response, next: () => void) => void
): Router {
  const router = Router();
  const preferencesService = createVersionPreferencesService();

  // ============================================
  // Version Status Endpoints
  // ============================================

  /**
   * GET /api/version/status
   * Get current version and check for updates
   */
  router.get('/status', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const forceRefresh = req.query.refresh === 'true';
      const versionService = getVersionCheckService();
      const status = await versionService.checkVersion(forceRefresh);

      // If user is authenticated, check if they should see the notification
      if (req.user && status.latestVersion) {
        const shouldShow = await preferencesService.shouldShowNotification(
          req.user.userId,
          status.latestVersion
        );
        res.json({ ...status, shouldShowNotification: shouldShow });
      } else {
        res.json({ ...status, shouldShowNotification: false });
      }
    } catch (error) {
      logger.error('Failed to get version status', {
        error: error instanceof Error ? error.message : String(error),
      });
      res.status(500).json({ error: 'Failed to get version status' });
    }
  });

  /**
   * GET /api/version/service-status
   * Get version check service configuration status
   */
  router.get('/service-status', requireAuth, async (_req: Request, res: Response) => {
    try {
      const versionService = getVersionCheckService();
      const status = versionService.getStatus();
      res.json(status);
    } catch (error) {
      logger.error('Failed to get version service status', {
        error: error instanceof Error ? error.message : String(error),
      });
      res.status(500).json({ error: 'Failed to get version service status' });
    }
  });

  // ============================================
  // User Preferences Endpoints
  // ============================================

  /**
   * GET /api/version/preferences
   * Get authenticated user's version notification preferences
   */
  router.get('/preferences', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
    try {
      if (!req.user) {
        return res.status(401).json({ error: 'Not authenticated' });
      }

      const preferences = await preferencesService.getPreferences(req.user.userId);
      res.json(preferences);
    } catch (error) {
      logger.error('Failed to get version preferences', {
        error: error instanceof Error ? error.message : String(error),
      });
      res.status(500).json({ error: 'Failed to get version preferences' });
    }
  });

  /**
   * PUT /api/version/preferences
   * Update authenticated user's version notification preferences
   */
  router.put('/preferences', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
    try {
      if (!req.user) {
        return res.status(401).json({ error: 'Not authenticated' });
      }

      const { notificationsEnabled } = req.body;

      // Validate input
      if (notificationsEnabled !== undefined && typeof notificationsEnabled !== 'boolean') {
        return res.status(400).json({ error: 'notificationsEnabled must be a boolean' });
      }

      const updates: { notificationsEnabled?: boolean } = {};
      if (notificationsEnabled !== undefined) {
        updates.notificationsEnabled = notificationsEnabled;
      }

      const preferences = await preferencesService.updatePreferences(req.user.userId, updates);
      res.json(preferences);
    } catch (error) {
      logger.error('Failed to update version preferences', {
        error: error instanceof Error ? error.message : String(error),
      });
      res.status(500).json({ error: 'Failed to update version preferences' });
    }
  });

  // ============================================
  // Notification Action Endpoints
  // ============================================

  /**
   * POST /api/version/dismiss
   * Dismiss a specific version notification
   */
  router.post('/dismiss', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
    try {
      if (!req.user) {
        return res.status(401).json({ error: 'Not authenticated' });
      }

      const { version } = req.body;

      if (!version || typeof version !== 'string') {
        return res.status(400).json({ error: 'version is required and must be a string' });
      }

      await preferencesService.dismissVersion(req.user.userId, version);
      res.json({ success: true, message: `Version ${version} dismissed` });
    } catch (error) {
      logger.error('Failed to dismiss version', {
        error: error instanceof Error ? error.message : String(error),
      });
      res.status(500).json({ error: 'Failed to dismiss version' });
    }
  });

  /**
   * POST /api/version/remind-later
   * Set "remind me later" for version notifications
   */
  router.post('/remind-later', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
    try {
      if (!req.user) {
        return res.status(401).json({ error: 'Not authenticated' });
      }

      const { hours } = req.body;

      // Validate hours (allow 1, 24, or 168 = 1 week)
      const validHours = [1, 24, 168];
      if (!hours || typeof hours !== 'number' || !validHours.includes(hours)) {
        return res.status(400).json({
          error: `hours is required and must be one of: ${validHours.join(', ')}`,
        });
      }

      await preferencesService.remindLater(req.user.userId, hours);

      const remindUntil = new Date(Date.now() + hours * 60 * 60 * 1000);
      res.json({
        success: true,
        message: `Will remind again after ${hours} hours`,
        remindLaterUntil: remindUntil,
      });
    } catch (error) {
      logger.error('Failed to set remind later', {
        error: error instanceof Error ? error.message : String(error),
      });
      res.status(500).json({ error: 'Failed to set remind later' });
    }
  });

  /**
   * POST /api/version/check-now
   * Force an immediate version check (bypasses cache)
   */
  router.post('/check-now', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const versionService = getVersionCheckService();
      const status = await versionService.checkVersion(true);

      // If user is authenticated, check if they should see the notification
      if (req.user && status.latestVersion) {
        const shouldShow = await preferencesService.shouldShowNotification(
          req.user.userId,
          status.latestVersion
        );
        res.json({ ...status, shouldShowNotification: shouldShow });
      } else {
        res.json({ ...status, shouldShowNotification: false });
      }
    } catch (error) {
      logger.error('Failed to force version check', {
        error: error instanceof Error ? error.message : String(error),
      });
      res.status(500).json({ error: 'Failed to check for updates' });
    }
  });

  logger.info('Version routes initialized');

  return router;
}
