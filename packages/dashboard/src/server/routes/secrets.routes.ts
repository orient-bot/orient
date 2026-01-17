/**
 * Secrets Routes
 *
 * API endpoints for managing encrypted secrets.
 */

import { Router, Request, Response } from 'express';
import {
  createServiceLogger,
  invalidateConfigCache,
  setSecretOverrides,
  removeSecretOverride,
} from '@orient/core';
import { createSecretsService } from '@orient/database-services';

const logger = createServiceLogger('secrets-routes');

export function createSecretsRoutes(
  requireAuth: (req: Request, res: Response, next: () => void) => void
): Router {
  const router = Router();
  const secretsService = createSecretsService();

  router.get('/', requireAuth, async (_req: Request, res: Response) => {
    try {
      const secrets = await secretsService.listSecrets();
      res.json({ secrets });
    } catch (error) {
      logger.error('Failed to list secrets', { error: String(error) });
      res.status(500).json({ error: 'Failed to list secrets' });
    }
  });

  router.get('/:key', requireAuth, async (req: Request, res: Response) => {
    try {
      const { key } = req.params;
      const reveal = req.query.reveal === 'true';
      const value = await secretsService.getSecret(key);
      if (value === null) {
        return res.status(404).json({ error: 'Secret not found' });
      }

      res.json({
        key,
        value: reveal ? value : '********',
        revealed: reveal,
      });
    } catch (error) {
      logger.error('Failed to get secret', { error: String(error) });
      res.status(500).json({ error: 'Failed to get secret' });
    }
  });

  router.put('/:key', requireAuth, async (req: Request, res: Response) => {
    try {
      const { key } = req.params;
      const { value, category, description, changedBy } = req.body || {};

      if (!value || typeof value !== 'string') {
        return res.status(400).json({ error: 'Secret value is required' });
      }

      await secretsService.setSecret(key, value, {
        category: typeof category === 'string' ? category : undefined,
        description: typeof description === 'string' ? description : undefined,
        changedBy: typeof changedBy === 'string' ? changedBy : undefined,
      });

      setSecretOverrides({ [key]: value });
      invalidateConfigCache();

      res.json({ success: true });
    } catch (error) {
      logger.error('Failed to set secret', { error: String(error) });
      res.status(500).json({ error: 'Failed to set secret' });
    }
  });

  router.delete('/:key', requireAuth, async (req: Request, res: Response) => {
    try {
      const { key } = req.params;
      const { changedBy } = req.body || {};

      await secretsService.deleteSecret(key, typeof changedBy === 'string' ? changedBy : undefined);
      removeSecretOverride(key);
      invalidateConfigCache();

      res.json({ success: true });
    } catch (error) {
      logger.error('Failed to delete secret', { error: String(error) });
      res.status(500).json({ error: 'Failed to delete secret' });
    }
  });

  router.post('/invalidate-cache', requireAuth, (_req: Request, res: Response) => {
    invalidateConfigCache();
    res.json({ success: true });
  });

  return router;
}
