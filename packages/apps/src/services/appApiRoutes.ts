/**
 * App API Routes
 *
 * Express routes for the Mini-Apps feature.
 * Handles app listing, details, tool execution, and sharing.
 *
 * Exported via @orientbot/apps package.
 */

import { Router, Request, Response } from 'express';
import { createServiceLogger } from '@orientbot/core';
import { AppsService } from './appsService.js';
import { AppRuntimeService } from './appRuntimeService.js';

const logger = createServiceLogger('app-api');

export interface AppApiConfig {
  appsService: AppsService;
  runtimeService: AppRuntimeService;
}

/**
 * Create Express router for app API endpoints
 */
export function createAppApiRoutes(config: AppApiConfig): Router {
  const router = Router();
  const { appsService, runtimeService } = config;

  // ============================================
  // APP LISTING & DETAILS
  // ============================================

  /**
   * GET /api/apps
   * List all apps (optionally filtered by status)
   */
  router.get('/apps', async (req: Request, res: Response) => {
    try {
      const status = req.query.status as string | undefined;
      let apps = appsService.listApps();

      if (status && status !== 'all') {
        apps = apps.filter((app) => app.status === status);
      }

      const limit = parseInt(req.query.limit as string) || 50;
      apps = apps.slice(0, limit);

      res.json({
        total: apps.length,
        apps,
      });
    } catch (error) {
      logger.error('Failed to list apps', { error });
      res.status(500).json({ error: 'Failed to list apps' });
    }
  });

  /**
   * GET /api/apps/:name
   * Get app details
   */
  router.get('/apps/:name', async (req: Request, res: Response) => {
    try {
      const { name } = req.params;
      const app = appsService.getApp(name);

      if (!app) {
        return res.status(404).json({ error: `App "${name}" not found` });
      }

      // Build permissions object
      const permissions: Record<string, { read: boolean; write: boolean }> = {};
      for (const [key, value] of Object.entries(app.manifest.permissions)) {
        if (key !== 'tools' && value && typeof value === 'object' && !Array.isArray(value)) {
          const perm = value as { read: boolean; write: boolean };
          permissions[key] = { read: perm.read, write: perm.write };
        }
      }

      res.json({
        found: true,
        app: {
          name: app.manifest.name,
          title: app.manifest.title,
          description: app.manifest.description,
          version: app.manifest.version,
          status: app.status,
          isBuilt: app.isBuilt,
          author: app.manifest.author,
          permissions,
          capabilities: {
            scheduler: app.manifest.capabilities.scheduler,
            webhooks: app.manifest.capabilities.webhooks
              ? {
                  enabled: app.manifest.capabilities.webhooks.enabled,
                  max_endpoints: app.manifest.capabilities.webhooks.max_endpoints,
                }
              : undefined,
          },
          sharing: app.manifest.sharing,
        },
      });
    } catch (error) {
      logger.error('Failed to get app', { error, name: req.params.name });
      res.status(500).json({ error: 'Failed to get app' });
    }
  });

  // ============================================
  // TOOL EXECUTION
  // ============================================

  /**
   * POST /api/apps/:name/tools
   * Execute a tool for an app
   */
  router.post('/apps/:name/tools', async (req: Request, res: Response) => {
    try {
      const { name } = req.params;
      const shareToken = (req.headers['x-share-token'] as string) || req.body.shareToken || '';
      const { method, params } = req.body;

      if (!method) {
        return res.status(400).json({ error: 'Method is required' });
      }

      const result = await runtimeService.executeToolForApp({
        appName: name,
        shareToken,
        method,
        params: params || {},
      });

      if (result.success) {
        res.json({ success: true, data: result.data });
      } else {
        res.status(400).json({ success: false, error: result.error });
      }
    } catch (error) {
      logger.error('Tool execution failed', { error, name: req.params.name });
      res.status(500).json({ error: 'Tool execution failed' });
    }
  });

  // ============================================
  // SHARE TOKEN MANAGEMENT
  // ============================================

  /**
   * POST /api/apps/:name/share
   * Generate a share token for an app
   */
  router.post('/apps/:name/share', async (req: Request, res: Response) => {
    try {
      const { name } = req.params;
      const { expiryDays, maxUses } = req.body;

      const app = appsService.getApp(name);
      if (!app) {
        return res.status(404).json({ error: `App "${name}" not found` });
      }

      const token = runtimeService.generateShareToken(name, {
        expiryDays,
        maxUses,
      });

      const baseUrl = process.env.APPS_BASE_URL || 'https://apps.example.com';
      const shareUrl = `${baseUrl}/a/${name}/${token}`;

      res.json({
        success: true,
        token,
        shareUrl,
        expiryDays: expiryDays || 30,
        maxUses,
      });
    } catch (error) {
      logger.error('Failed to generate share token', { error, name: req.params.name });
      res.status(500).json({ error: 'Failed to generate share token' });
    }
  });

  /**
   * GET /api/apps/:name/share
   * List share tokens for an app
   */
  router.get('/apps/:name/share', async (req: Request, res: Response) => {
    try {
      const { name } = req.params;

      const app = appsService.getApp(name);
      if (!app) {
        return res.status(404).json({ error: `App "${name}" not found` });
      }

      const tokens = runtimeService.getShareTokensForApp(name);

      res.json({
        appName: name,
        tokens,
      });
    } catch (error) {
      logger.error('Failed to list share tokens', { error, name: req.params.name });
      res.status(500).json({ error: 'Failed to list share tokens' });
    }
  });

  /**
   * DELETE /api/apps/:name/share/:token
   * Revoke a share token
   */
  router.delete('/apps/:name/share/:token', async (req: Request, res: Response) => {
    try {
      const { token } = req.params;

      const revoked = runtimeService.revokeShareToken(token);

      if (revoked) {
        res.json({ success: true, message: 'Token revoked' });
      } else {
        res.status(404).json({ error: 'Token not found' });
      }
    } catch (error) {
      logger.error('Failed to revoke share token', { error });
      res.status(500).json({ error: 'Failed to revoke share token' });
    }
  });

  // ============================================
  // STATISTICS
  // ============================================

  /**
   * GET /api/apps/:name/stats
   * Get execution statistics for an app
   */
  router.get('/apps/:name/stats', async (req: Request, res: Response) => {
    try {
      const { name } = req.params;

      const app = appsService.getApp(name);
      if (!app) {
        return res.status(404).json({ error: `App "${name}" not found` });
      }

      const stats = runtimeService.getStats(name);
      const executions = runtimeService.getExecutions(name, 20);

      res.json({
        appName: name,
        stats,
        recentExecutions: executions,
      });
    } catch (error) {
      logger.error('Failed to get app stats', { error, name: req.params.name });
      res.status(500).json({ error: 'Failed to get app stats' });
    }
  });

  // ============================================
  // APP RELOAD
  // ============================================

  /**
   * POST /api/apps/reload
   * Reload all apps from disk
   */
  router.post('/apps/reload', async (req: Request, res: Response) => {
    try {
      const result = await appsService.reload();

      res.json({
        success: true,
        message: 'Apps reloaded',
        previous: result.previous,
        current: result.current,
      });
    } catch (error) {
      logger.error('Failed to reload apps', { error });
      res.status(500).json({ error: 'Failed to reload apps' });
    }
  });

  return router;
}
