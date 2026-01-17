/**
 * Apps Routes
 *
 * API endpoints for listing and viewing Mini-Apps.
 * These routes provide read-only access to apps stored in the apps/ directory.
 */

import { Router, Request, Response } from 'express';
import { createServiceLogger } from '@orient/core';
import type { AppsService } from '../../services/appsService.js';

const logger = createServiceLogger('apps-routes');

/**
 * Create Apps routes for listing and viewing mini-apps
 */
export function createAppsRoutes(
  appsService: AppsService,
  _requireAuth: (req: Request, res: Response, next: () => void) => void
): Router {
  const router = Router();

  // List all apps (public - no auth required for listing)
  router.get('/', (_req: Request, res: Response) => {
    try {
      const apps = appsService.listApps();
      res.json({ total: apps.length, apps });
    } catch (error) {
      logger.error('Failed to list apps', {
        error: error instanceof Error ? error.message : String(error),
      });
      res.status(500).json({ error: 'Failed to list apps' });
    }
  });

  // Get app details
  router.get('/:name', (req: Request, res: Response) => {
    try {
      const app = appsService.getApp(req.params.name);
      if (!app) {
        return res.status(404).json({ error: `App "${req.params.name}" not found` });
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
          capabilities: app.manifest.capabilities || {},
          sharing: app.manifest.sharing || { mode: 'secret_link' },
          path: app.path,
        },
      });
    } catch (error) {
      logger.error('Failed to get app', {
        name: req.params.name,
        error: error instanceof Error ? error.message : String(error),
      });
      res.status(500).json({ error: 'Failed to get app' });
    }
  });

  // Get app stats (stub - returns empty stats)
  router.get('/:name/stats', (_req: Request, res: Response) => {
    res.json({
      stats: { total: 0, success: 0, error: 0, denied: 0, avgDurationMs: 0 },
    });
  });

  // Get app share tokens (stub - returns empty tokens)
  router.get('/:name/share', (_req: Request, res: Response) => {
    res.json({ tokens: [] });
  });

  // Reload apps from filesystem
  router.post('/reload', async (_req: Request, res: Response) => {
    try {
      const result = await appsService.reload();
      res.json({
        success: true,
        message: 'Apps reloaded',
        previous: result.previous,
        current: result.current,
      });
    } catch (error) {
      logger.error('Failed to reload apps', {
        error: error instanceof Error ? error.message : String(error),
      });
      res.status(500).json({ error: 'Failed to reload apps' });
    }
  });

  logger.info('Apps routes initialized');

  return router;
}
