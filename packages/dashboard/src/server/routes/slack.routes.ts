/**
 * Slack Routes
 *
 * API endpoints for Slack channel management and message access.
 */

import { Router, Request, Response } from 'express';
import { createServiceLogger } from '@orientbot/core';
import type { SlackDatabase } from '@orientbot/database-services';
import { AuthenticatedRequest } from '../../auth.js';
import { SlackChannelPermission } from '../../types/slack.js';

const logger = createServiceLogger('slack-routes');

/**
 * Create Slack routes
 */
export function createSlackRoutes(
  slackDb: SlackDatabase,
  requireAuth: (req: Request, res: Response, next: () => void) => void
): Router {
  const router = Router();

  // Get Slack statistics - returns data directly matching SlackDashboardStats interface
  router.get('/stats', requireAuth, async (_req: Request, res: Response) => {
    try {
      const stats = await slackDb.getDashboardStats();
      res.json(stats);
    } catch (error) {
      logger.error('Failed to get Slack stats', {
        error: error instanceof Error ? error.message : String(error),
      });
      res.status(500).json({ error: 'Failed to get Slack statistics' });
    }
  });

  // List all Slack channels with permissions
  router.get('/channels', requireAuth, async (_req: Request, res: Response) => {
    try {
      const channels = await slackDb.getAllChannelsWithPermissions();
      // Ensure stable response shape even if DB returns null/undefined
      res.json({ channels: Array.isArray(channels) ? channels : [] });
    } catch (error) {
      logger.error('Failed to get Slack channels', {
        error: error instanceof Error ? error.message : String(error),
      });
      res.status(500).json({ error: 'Failed to get channels' });
    }
  });

  // Get a specific channel's permission
  router.get('/channels/:channelId', requireAuth, async (req: Request, res: Response) => {
    try {
      const { channelId } = req.params;
      const permission = await slackDb.getChannelPermission(channelId);

      if (!permission) {
        res.status(404).json({ error: 'Channel not found in permissions' });
        return;
      }

      res.json(permission);
    } catch (error) {
      logger.error('Failed to get Slack channel', {
        error: error instanceof Error ? error.message : String(error),
      });
      res.status(500).json({ error: 'Failed to get channel' });
    }
  });

  // Set/update channel permission
  router.patch(
    '/channels/:channelId/permission',
    requireAuth,
    async (req: AuthenticatedRequest, res: Response) => {
      try {
        const { channelId } = req.params;
        const { permission, respondToMentions, respondToDMs, notes } = req.body;

        // Validate permission
        if (!permission || !['ignored', 'read_only', 'read_write'].includes(permission)) {
          res
            .status(400)
            .json({ error: 'Invalid permission. Must be: ignored, read_only, or read_write' });
          return;
        }

        // Update permission
        await slackDb.setChannelPermission(channelId, permission as SlackChannelPermission, {
          respondToMentions,
          respondToDMs,
          notes,
          changedBy: req.user?.username,
        });

        // Return updated record
        const updated = await slackDb.getChannelPermission(channelId);
        res.json(updated);
      } catch (error) {
        logger.error('Failed to update Slack channel permission', {
          error: error instanceof Error ? error.message : String(error),
        });
        res.status(500).json({ error: 'Failed to update permission' });
      }
    }
  );

  // Delete channel permission (revert to default)
  router.delete(
    '/channels/:channelId',
    requireAuth,
    async (req: AuthenticatedRequest, res: Response) => {
      try {
        const { channelId } = req.params;

        const success = await slackDb.deleteChannelPermission(channelId, req.user?.username);

        if (!success) {
          res.status(404).json({ error: 'Channel permission not found' });
          return;
        }

        res.json({ success: true, message: 'Permission deleted, will use default' });
      } catch (error) {
        logger.error('Failed to delete Slack channel permission', {
          error: error instanceof Error ? error.message : String(error),
        });
        res.status(500).json({ error: 'Failed to delete permission' });
      }
    }
  );

  // Search Slack messages
  router.get('/messages/search', requireAuth, async (req: Request, res: Response) => {
    try {
      const { q, limit } = req.query;

      if (!q) {
        res.status(400).json({ error: 'Search query required' });
        return;
      }

      const messages = await slackDb.fullTextSearch(q as string, parseInt(limit as string) || 50);

      res.json({ messages, query: q });
    } catch (error) {
      logger.error('Failed to search Slack messages', {
        error: error instanceof Error ? error.message : String(error),
      });
      res.status(500).json({ error: 'Failed to search messages' });
    }
  });

  // Get recent Slack messages
  router.get('/messages/recent', requireAuth, async (req: Request, res: Response) => {
    try {
      const limit = parseInt(req.query.limit as string) || 50;
      const messages = await slackDb.getRecentMessages(limit);
      res.json({ messages });
    } catch (error) {
      logger.error('Failed to get recent Slack messages', {
        error: error instanceof Error ? error.message : String(error),
      });
      res.status(500).json({ error: 'Failed to get messages' });
    }
  });

  // Get Slack message statistics
  router.get('/messages/stats', requireAuth, async (_req: Request, res: Response) => {
    try {
      const stats = await slackDb.getStats();
      res.json(stats);
    } catch (error) {
      logger.error('Failed to get Slack message stats', {
        error: error instanceof Error ? error.message : String(error),
      });
      res.status(500).json({ error: 'Failed to get message statistics' });
    }
  });

  logger.info('Slack routes initialized');

  return router;
}
