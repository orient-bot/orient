/**
 * Apps Routes
 *
 * API endpoints for listing and viewing Mini-Apps.
 * These routes provide read-only access to apps stored in the apps/ directory.
 * Also handles the bridge API for tool invocations from mini-apps.
 */

import { Router, Request, Response } from 'express';
import { createServiceLogger } from '@orient/core';
import type { MiniappEditService } from '@orient/apps';
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
  requireAuth: (req: Request, res: Response, next: () => void) => void,
  bridgeServices?: BridgeServices,
  miniappEditService?: MiniappEditService
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

  // Generate a share link for an app
  router.post('/:name/share', (req: Request, res: Response) => {
    try {
      const app = appsService.getApp(req.params.name);
      if (!app) {
        return res.status(404).json({ error: `App "${req.params.name}" not found` });
      }

      // For local development, use the dashboard URL directly
      // In production, this would use APPS_BASE_URL env var
      const baseUrl = process.env.APPS_BASE_URL || `http://localhost:${process.env.PORT || 3080}`;
      const shareUrl = `${baseUrl}/apps/${app.manifest.name}/`;

      logger.info('Generated share link', {
        appName: app.manifest.name,
        shareUrl,
        isBuilt: app.isBuilt,
      });

      res.json({
        success: true,
        shareUrl,
        expiryDays: req.body.expiryDays || 30,
        maxUses: req.body.maxUses,
      });
    } catch (error) {
      logger.error('Failed to generate share link', {
        name: req.params.name,
        error: error instanceof Error ? error.message : String(error),
      });
      res.status(500).json({ error: 'Failed to generate share link' });
    }
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

        case 'app.getShareUrl': {
          const baseUrl = process.env.APPS_BASE_URL || 'http://localhost:3080';
          return res.json({ data: `${baseUrl}/apps/${app.manifest.name}` });
        }

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

  // ============================================
  // AI-POWERED MINIAPP EDITING ROUTES
  // ============================================

  // Only add edit routes if miniappEditService is available
  if (miniappEditService) {
    // Start or continue editing an app
    router.post('/:appName/edit', requireAuth, async (req: Request, res: Response) => {
      try {
        const { appName } = req.params;
        const { prompt, createNew, continueSession } = req.body;

        // Validation
        if (!prompt || typeof prompt !== 'string' || prompt.length < 10) {
          res.status(400).json({
            error: 'Prompt is required and must be at least 10 characters',
          });
          return;
        }

        if (!appName || !/^[a-z0-9-]+$/.test(appName)) {
          res.status(400).json({
            error: 'App name must be lowercase with hyphens only',
          });
          return;
        }

        let result;

        // Continue existing session or start new one
        if (continueSession) {
          logger.info('Continuing edit session', { appName, sessionId: continueSession });
          result = await miniappEditService.continueEdit(continueSession, prompt);
        } else {
          logger.info('Starting new edit session', { appName, createNew });
          result = await miniappEditService.startEditSession(appName, prompt, createNew || false);
        }

        res.json({
          success: true,
          sessionId: result.sessionId,
          portalUrl: result.portalUrl,
          response: result.response,
          commitHash: result.commitHash,
          buildStatus: result.buildStatus,
        });
      } catch (error) {
        logger.error('Failed to edit app', {
          appName: req.params.appName,
          error: error instanceof Error ? error.message : String(error),
        });
        res.status(500).json({
          error: 'Failed to edit app',
          message: error instanceof Error ? error.message : String(error),
        });
      }
    });

    // Trigger a build for an app
    router.post('/:appName/build', requireAuth, async (req: Request, res: Response) => {
      try {
        const { appName } = req.params;
        const { sessionId } = req.body;

        if (!sessionId) {
          res.status(400).json({ error: 'Session ID is required' });
          return;
        }

        logger.info('Building app', { appName, sessionId });
        const buildResult = await miniappEditService.buildApp(sessionId);

        res.json({
          success: buildResult.success,
          buildOutput: buildResult.output,
          duration: buildResult.duration,
          error: buildResult.error,
        });
      } catch (error) {
        logger.error('Failed to build app', {
          appName: req.params.appName,
          error: error instanceof Error ? error.message : String(error),
        });
        res.status(500).json({
          error: 'Failed to build app',
          message: error instanceof Error ? error.message : String(error),
        });
      }
    });

    // Rollback to a previous commit
    router.post('/:appName/rollback', requireAuth, async (req: Request, res: Response) => {
      try {
        const { appName } = req.params;
        const { sessionId, commitHash } = req.body;

        if (!sessionId || !commitHash) {
          res.status(400).json({ error: 'Session ID and commit hash are required' });
          return;
        }

        logger.info('Rolling back to commit', { appName, sessionId, commitHash });
        await miniappEditService.rollbackToCommit(sessionId, commitHash);

        res.json({
          success: true,
          message: `Rolled back to commit ${commitHash}`,
        });
      } catch (error) {
        logger.error('Failed to rollback app', {
          appName: req.params.appName,
          error: error instanceof Error ? error.message : String(error),
        });
        res.status(500).json({
          error: 'Failed to rollback app',
          message: error instanceof Error ? error.message : String(error),
        });
      }
    });

    // Get commit history for a session
    router.get('/:appName/history', requireAuth, async (req: Request, res: Response) => {
      try {
        const { appName } = req.params;
        const { sessionId } = req.query;

        if (!sessionId || typeof sessionId !== 'string') {
          res.status(400).json({ error: 'Session ID is required' });
          return;
        }

        logger.info('Getting commit history', { appName, sessionId });
        const history = await miniappEditService.getHistory(sessionId);

        res.json({
          success: true,
          commits: history.commits,
        });
      } catch (error) {
        logger.error('Failed to get app history', {
          appName: req.params.appName,
          error: error instanceof Error ? error.message : String(error),
        });
        res.status(500).json({
          error: 'Failed to get app history',
          message: error instanceof Error ? error.message : String(error),
        });
      }
    });

    // Close a session and optionally create PR
    router.post('/:appName/close-session', requireAuth, async (req: Request, res: Response) => {
      try {
        const { appName } = req.params;
        const { sessionId, merge } = req.body;

        if (!sessionId) {
          res.status(400).json({ error: 'Session ID is required' });
          return;
        }

        logger.info('Closing session', { appName, sessionId, merge: merge || false });
        const result = await miniappEditService.closeSession(sessionId, merge || false);

        res.json({
          success: true,
          message: 'Session closed',
          prUrl: result.prUrl,
        });
      } catch (error) {
        logger.error('Failed to close session', {
          appName: req.params.appName,
          error: error instanceof Error ? error.message : String(error),
        });
        res.status(500).json({
          error: 'Failed to close session',
          message: error instanceof Error ? error.message : String(error),
        });
      }
    });

    // Get active sessions
    router.get('/sessions/active', requireAuth, async (_req: Request, res: Response) => {
      try {
        logger.info('Getting active sessions');
        const sessions = await miniappEditService.getActiveSessions();

        res.json({
          success: true,
          sessions: sessions.map((s) => ({
            id: s.id,
            appName: s.appName,
            sessionId: s.sessionId,
            branchName: s.branchName,
            createdAt: s.createdAt,
            updatedAt: s.updatedAt,
          })),
        });
      } catch (error) {
        logger.error('Failed to get active sessions', {
          error: error instanceof Error ? error.message : String(error),
        });
        res.status(500).json({
          error: 'Failed to get active sessions',
          message: error instanceof Error ? error.message : String(error),
        });
      }
    });

    // Get sessions for a specific app
    router.get('/:appName/sessions', requireAuth, async (req: Request, res: Response) => {
      try {
        const { appName } = req.params;

        logger.info('Getting sessions for app', { appName });
        const sessions = await miniappEditService.getAppSessions(appName);

        res.json({
          success: true,
          sessions: sessions.map((s) => ({
            id: s.id,
            sessionId: s.sessionId,
            branchName: s.branchName,
            createdAt: s.createdAt,
            updatedAt: s.updatedAt,
            closedAt: s.closedAt,
          })),
        });
      } catch (error) {
        logger.error('Failed to get app sessions', {
          appName: req.params.appName,
          error: error instanceof Error ? error.message : String(error),
        });
        res.status(500).json({
          error: 'Failed to get app sessions',
          message: error instanceof Error ? error.message : String(error),
        });
      }
    });

    logger.info('Miniapp edit routes initialized');
  }

  logger.info('Apps routes initialized');

  return router;
}
