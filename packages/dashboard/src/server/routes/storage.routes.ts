/**
 * Storage Routes
 *
 * API endpoints for storage statistics and management.
 */

import { Router, Request, Response } from 'express';
import { createServiceLogger } from '@orient/core';
import { getStorageService } from '../../services/storageService.js';

const logger = createServiceLogger('storage-routes');

/**
 * Create Storage routes
 */
export function createStorageRoutes(
  requireAuth: (req: Request, res: Response, next: () => void) => void
): Router {
  const router = Router();

  // Get complete storage summary
  router.get('/summary', requireAuth, async (_req: Request, res: Response) => {
    try {
      const storageService = getStorageService();
      const summary = await storageService.getSummary();
      res.json(summary);
    } catch (error) {
      logger.error('Failed to get storage summary', {
        error: error instanceof Error ? error.message : String(error),
      });
      res.status(500).json({ error: 'Failed to get storage summary' });
    }
  });

  // Get database statistics
  router.get('/database', requireAuth, async (_req: Request, res: Response) => {
    try {
      const storageService = getStorageService();
      const stats = await storageService.getDatabaseStats();
      res.json(stats);
    } catch (error) {
      logger.error('Failed to get database stats', {
        error: error instanceof Error ? error.message : String(error),
      });
      res.status(500).json({ error: 'Failed to get database stats' });
    }
  });

  // Get media file statistics
  router.get('/media', requireAuth, async (_req: Request, res: Response) => {
    try {
      const storageService = getStorageService();
      const stats = await storageService.getMediaStats();
      res.json(stats);
    } catch (error) {
      logger.error('Failed to get media stats', {
        error: error instanceof Error ? error.message : String(error),
      });
      res.status(500).json({ error: 'Failed to get media stats' });
    }
  });

  // Get session storage info
  router.get('/session', requireAuth, async (_req: Request, res: Response) => {
    try {
      const storageService = getStorageService();
      const stats = await storageService.getSessionStats();
      res.json(stats);
    } catch (error) {
      logger.error('Failed to get session stats', {
        error: error instanceof Error ? error.message : String(error),
      });
      res.status(500).json({ error: 'Failed to get session stats' });
    }
  });

  // Get cloud storage info
  router.get('/cloud', requireAuth, async (_req: Request, res: Response) => {
    try {
      const storageService = getStorageService();
      const stats = await storageService.getCloudStats();
      res.json(stats);
    } catch (error) {
      logger.error('Failed to get cloud stats', {
        error: error instanceof Error ? error.message : String(error),
      });
      res.status(500).json({ error: 'Failed to get cloud stats' });
    }
  });

  // Preview cleanup results
  router.post('/cleanup/preview', requireAuth, async (req: Request, res: Response) => {
    try {
      const { beforeDate } = req.body;

      if (!beforeDate) {
        return res.status(400).json({ error: 'beforeDate is required' });
      }

      const date = new Date(beforeDate);
      if (isNaN(date.getTime())) {
        return res.status(400).json({ error: 'Invalid date format' });
      }

      const storageService = getStorageService();
      const preview = await storageService.previewCleanup(date);
      res.json(preview);
    } catch (error) {
      logger.error('Failed to preview cleanup', {
        error: error instanceof Error ? error.message : String(error),
      });
      res.status(500).json({ error: 'Failed to preview cleanup' });
    }
  });

  // Delete old messages
  router.post('/cleanup/messages', requireAuth, async (req: Request, res: Response) => {
    try {
      const { beforeDate } = req.body;

      if (!beforeDate) {
        return res.status(400).json({ error: 'beforeDate is required' });
      }

      const date = new Date(beforeDate);
      if (isNaN(date.getTime())) {
        return res.status(400).json({ error: 'Invalid date format' });
      }

      // Sanity check - don't allow deleting messages from the future
      if (date > new Date()) {
        return res.status(400).json({ error: 'Cannot delete messages from the future' });
      }

      const storageService = getStorageService();
      const result = await storageService.cleanupOldMessages(date);

      if (result.success) {
        res.json({
          success: true,
          deletedCount: result.deletedCount,
          message: `Successfully deleted ${result.deletedCount} messages`,
        });
      } else {
        res.status(500).json({
          success: false,
          error: result.error || 'Failed to delete messages',
        });
      }
    } catch (error) {
      logger.error('Failed to cleanup messages', {
        error: error instanceof Error ? error.message : String(error),
      });
      res.status(500).json({ error: 'Failed to cleanup messages' });
    }
  });

  logger.info('Storage routes initialized');

  return router;
}
