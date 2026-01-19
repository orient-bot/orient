/**
 * Apps Routes
 *
 * API endpoints for listing and viewing Mini-Apps.
 * These routes provide read-only access to apps stored in the apps/ directory.
 * Also handles the bridge API for tool invocations from mini-apps.
 */

import { Router, Request, Response } from 'express';
import { createServiceLogger } from '@orient/core';
import type { AppsService } from '../../services/appsService.js';
import type { StorageDatabase } from '../../services/storageDatabase.js';

const logger = createServiceLogger('apps-routes');

interface BridgeServices {
  storageDb?: StorageDatabase;
}

/**
 * Create Apps routes for listing and viewing mini-apps
 */
export function createAppsRoutes(
  appsService: AppsService,
  _requireAuth: (req: Request, res: Response, next: () => void) => void,
  bridgeServices?: BridgeServices
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

  // Bridge API endpoint for mini-app tool invocations
  router.post('/bridge', async (req: Request, res: Response) => {
    try {
      const { appName, method, params } = req.body;

      if (!appName || !method) {
        return res.status(400).json({ error: 'appName and method are required' });
      }

      // Get the app to check permissions/capabilities
      const app = appsService.getApp(appName);
      if (!app) {
        return res.status(404).json({ error: `App "${appName}" not found` });
      }

      logger.debug('Bridge call', { appName, method, params });

      // Handle different methods
      switch (method) {
        // Bridge ping
        case 'bridge.ping':
          return res.json({ data: { ready: true } });

        // App metadata
        case 'app.getManifest':
          return res.json({
            data: {
              name: app.manifest.name,
              title: app.manifest.title,
              description: app.manifest.description,
              version: app.manifest.version,
              permissions: app.manifest.permissions,
              capabilities: app.manifest.capabilities,
            },
          });

        case 'app.getShareUrl':
          const baseUrl = process.env.APPS_BASE_URL || 'http://localhost:3080';
          return res.json({ data: `${baseUrl}/apps/${app.manifest.name}` });

        // Storage methods
        case 'storage.set': {
          if (!bridgeServices?.storageDb) {
            return res.status(503).json({ error: 'Storage service not available' });
          }
          // Check storage capability
          const storageCapability = app.manifest.capabilities?.storage;
          if (!storageCapability?.enabled) {
            return res.status(403).json({ error: 'Storage capability not enabled for this app' });
          }
          const { key, value } = params || {};
          if (!key || typeof key !== 'string') {
            return res.status(400).json({ error: 'key is required' });
          }
          await bridgeServices.storageDb.set(appName, key, value);
          return res.json({ data: { success: true } });
        }

        case 'storage.get': {
          if (!bridgeServices?.storageDb) {
            return res.status(503).json({ error: 'Storage service not available' });
          }
          const storageCapability = app.manifest.capabilities?.storage;
          if (!storageCapability?.enabled) {
            return res.status(403).json({ error: 'Storage capability not enabled for this app' });
          }
          const { key } = params || {};
          if (!key || typeof key !== 'string') {
            return res.status(400).json({ error: 'key is required' });
          }
          const value = await bridgeServices.storageDb.get(appName, key);
          return res.json({ data: value });
        }

        case 'storage.delete': {
          if (!bridgeServices?.storageDb) {
            return res.status(503).json({ error: 'Storage service not available' });
          }
          const storageCapability = app.manifest.capabilities?.storage;
          if (!storageCapability?.enabled) {
            return res.status(403).json({ error: 'Storage capability not enabled for this app' });
          }
          const { key } = params || {};
          if (!key || typeof key !== 'string') {
            return res.status(400).json({ error: 'key is required' });
          }
          const deleted = await bridgeServices.storageDb.delete(appName, key);
          return res.json({ data: { deleted } });
        }

        case 'storage.list': {
          if (!bridgeServices?.storageDb) {
            return res.status(503).json({ error: 'Storage service not available' });
          }
          const storageCapability = app.manifest.capabilities?.storage;
          if (!storageCapability?.enabled) {
            return res.status(403).json({ error: 'Storage capability not enabled for this app' });
          }
          const keys = await bridgeServices.storageDb.list(appName);
          return res.json({ data: keys });
        }

        case 'storage.clear': {
          if (!bridgeServices?.storageDb) {
            return res.status(503).json({ error: 'Storage service not available' });
          }
          const storageCapability = app.manifest.capabilities?.storage;
          if (!storageCapability?.enabled) {
            return res.status(403).json({ error: 'Storage capability not enabled for this app' });
          }
          const count = await bridgeServices.storageDb.clear(appName);
          return res.json({ data: { cleared: count } });
        }

        // Calendar, scheduler, webhooks, slack would go here
        // For now, return not implemented
        default:
          logger.warn('Unknown bridge method', { appName, method });
          return res.status(501).json({ error: `Method "${method}" not implemented` });
      }
    } catch (error) {
      logger.error('Bridge call failed', {
        error: error instanceof Error ? error.message : String(error),
      });
      res.status(500).json({ error: 'Bridge call failed' });
    }
  });

  logger.info('Apps routes initialized');

  return router;
}
