/**
 * Webhook Routes
 *
 * API endpoints for webhook management and event history.
 */

import { Router, Request, Response } from 'express';
import { createServiceLogger } from '@orient/core';
import { WebhookService } from '../../services/webhookService.js';
import { AuthenticatedRequest } from '../../auth.js';
import { CreateWebhookInput, UpdateWebhookInput } from '../../types/webhook.js';

const logger = createServiceLogger('webhook-routes');

/**
 * Create Webhook routes
 */
export function createWebhookRoutes(
  webhookService: WebhookService,
  requireAuth: (req: Request, res: Response, next: () => void) => void
): Router {
  const router = Router();

  // Get webhook statistics
  router.get('/stats', requireAuth, async (_req: Request, res: Response) => {
    try {
      const stats = await webhookService.getStats();
      res.json(stats);
    } catch (error) {
      logger.error('Failed to get webhook stats', {
        error: error instanceof Error ? error.message : String(error),
      });
      res.status(500).json({ error: 'Failed to get webhook stats' });
    }
  });

  // Get recent events across all webhooks (must be before /:id to avoid conflict)
  router.get('/events/recent', requireAuth, async (req: Request, res: Response) => {
    try {
      const limit = parseInt(req.query.limit as string) || 50;
      const events = await webhookService.getRecentEvents(limit);
      res.json({ events });
    } catch (error) {
      logger.error('Failed to get recent events', {
        error: error instanceof Error ? error.message : String(error),
      });
      res.status(500).json({ error: 'Failed to get recent events' });
    }
  });

  // List all webhooks
  router.get('/', requireAuth, async (_req: Request, res: Response) => {
    try {
      const webhooks = await webhookService.getAllWebhooks();
      // Don't expose tokens in list view
      const safeWebhooks = webhooks.map((w) => ({ ...w, token: '***' }));
      res.json({ webhooks: safeWebhooks });
    } catch (error) {
      logger.error('Failed to get webhooks', {
        error: error instanceof Error ? error.message : String(error),
      });
      res.status(500).json({ error: 'Failed to get webhooks' });
    }
  });

  // Get single webhook (with token for admin)
  router.get('/:id', requireAuth, async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id, 10);
      if (isNaN(id)) {
        res.status(400).json({ error: 'Invalid webhook ID' });
        return;
      }

      const webhook = await webhookService.getWebhook(id);
      if (!webhook) {
        res.status(404).json({ error: 'Webhook not found' });
        return;
      }

      res.json(webhook);
    } catch (error) {
      logger.error('Failed to get webhook', {
        error: error instanceof Error ? error.message : String(error),
      });
      res.status(500).json({ error: 'Failed to get webhook' });
    }
  });

  // Create webhook
  router.post('/', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const input = req.body as CreateWebhookInput;

      // Validate required fields
      if (!input.name || !input.sourceType || !input.provider || !input.target) {
        res
          .status(400)
          .json({ error: 'Missing required fields: name, sourceType, provider, target' });
        return;
      }

      // Validate webhook name format
      if (!WebhookService.isValidWebhookName(input.name)) {
        res.status(400).json({
          error: 'Invalid webhook name. Use 3-50 alphanumeric characters, hyphens, or underscores.',
        });
        return;
      }

      // Check for duplicate name
      const existing = await webhookService.getWebhookByName(input.name);
      if (existing) {
        res.status(409).json({ error: `Webhook with name '${input.name}' already exists` });
        return;
      }

      const webhook = await webhookService.createWebhook(input);
      res.status(201).json(webhook);
    } catch (error) {
      logger.error('Failed to create webhook', {
        error: error instanceof Error ? error.message : String(error),
      });
      res.status(500).json({ error: 'Failed to create webhook' });
    }
  });

  // Update webhook
  router.patch('/:id', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const id = parseInt(req.params.id, 10);
      if (isNaN(id)) {
        res.status(400).json({ error: 'Invalid webhook ID' });
        return;
      }

      const input = req.body as UpdateWebhookInput;

      // Validate name format if provided
      if (input.name && !WebhookService.isValidWebhookName(input.name)) {
        res.status(400).json({
          error: 'Invalid webhook name. Use 3-50 alphanumeric characters, hyphens, or underscores.',
        });
        return;
      }

      const webhook = await webhookService.updateWebhook(id, input);
      if (!webhook) {
        res.status(404).json({ error: 'Webhook not found' });
        return;
      }

      res.json(webhook);
    } catch (error) {
      logger.error('Failed to update webhook', {
        error: error instanceof Error ? error.message : String(error),
      });
      res.status(500).json({ error: 'Failed to update webhook' });
    }
  });

  // Delete webhook
  router.delete('/:id', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const id = parseInt(req.params.id, 10);
      if (isNaN(id)) {
        res.status(400).json({ error: 'Invalid webhook ID' });
        return;
      }

      const deleted = await webhookService.deleteWebhook(id);
      if (!deleted) {
        res.status(404).json({ error: 'Webhook not found' });
        return;
      }

      res.json({ success: true, message: 'Webhook deleted' });
    } catch (error) {
      logger.error('Failed to delete webhook', {
        error: error instanceof Error ? error.message : String(error),
      });
      res.status(500).json({ error: 'Failed to delete webhook' });
    }
  });

  // Toggle webhook enabled/disabled
  router.post('/:id/toggle', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const id = parseInt(req.params.id, 10);
      if (isNaN(id)) {
        res.status(400).json({ error: 'Invalid webhook ID' });
        return;
      }

      const { enabled } = req.body as { enabled: boolean };
      if (typeof enabled !== 'boolean') {
        res.status(400).json({ error: 'enabled must be a boolean' });
        return;
      }

      const webhook = await webhookService.toggleWebhook(id, enabled);
      if (!webhook) {
        res.status(404).json({ error: 'Webhook not found' });
        return;
      }

      res.json(webhook);
    } catch (error) {
      logger.error('Failed to toggle webhook', {
        error: error instanceof Error ? error.message : String(error),
      });
      res.status(500).json({ error: 'Failed to toggle webhook' });
    }
  });

  // Regenerate webhook token
  router.post(
    '/:id/regenerate-token',
    requireAuth,
    async (req: AuthenticatedRequest, res: Response) => {
      try {
        const id = parseInt(req.params.id, 10);
        if (isNaN(id)) {
          res.status(400).json({ error: 'Invalid webhook ID' });
          return;
        }

        const webhook = await webhookService.regenerateToken(id);
        if (!webhook) {
          res.status(404).json({ error: 'Webhook not found' });
          return;
        }

        res.json(webhook);
      } catch (error) {
        logger.error('Failed to regenerate token', {
          error: error instanceof Error ? error.message : String(error),
        });
        res.status(500).json({ error: 'Failed to regenerate token' });
      }
    }
  );

  // Test webhook (send test message)
  router.post('/:id/test', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const id = parseInt(req.params.id, 10);
      if (isNaN(id)) {
        res.status(400).json({ error: 'Invalid webhook ID' });
        return;
      }

      const result = await webhookService.testWebhook(id);
      res.json(result);
    } catch (error) {
      logger.error('Failed to test webhook', {
        error: error instanceof Error ? error.message : String(error),
      });
      res.status(500).json({ error: 'Failed to test webhook' });
    }
  });

  // Get webhook events (history)
  router.get('/:id/events', requireAuth, async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id, 10);
      if (isNaN(id)) {
        res.status(400).json({ error: 'Invalid webhook ID' });
        return;
      }

      const limit = parseInt(req.query.limit as string) || 50;
      const events = await webhookService.getWebhookEvents(id, limit);
      res.json({ events });
    } catch (error) {
      logger.error('Failed to get webhook events', {
        error: error instanceof Error ? error.message : String(error),
      });
      res.status(500).json({ error: 'Failed to get webhook events' });
    }
  });

  logger.info('Webhook routes initialized');

  return router;
}
