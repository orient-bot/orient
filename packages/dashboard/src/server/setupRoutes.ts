import { Router } from 'express';
import { createServiceLogger } from '@orient-bot/core';
import { applySetup, getSetupStatus } from './setupWizard.js';

const logger = createServiceLogger('setup-routes');

export function createSetupRouter(): Router {
  const router = Router();

  router.get('/status', async (_req, res) => {
    try {
      const status = await getSetupStatus();
      if (!status.needsSetup) {
        status.setupOnly = false;
      }
      res.json(status);
    } catch (error) {
      logger.error('Failed to get setup status', { error: String(error) });
      res.status(500).json({ error: 'Failed to load setup status' });
    }
  });

  router.post('/apply', async (req, res) => {
    try {
      const values = req.body?.values;
      if (!values || typeof values !== 'object') {
        return res.status(400).json({ error: 'Missing setup values' });
      }

      const result = await applySetup(values as Record<string, string>);
      return res.json(result);
    } catch (error) {
      logger.error('Failed to apply setup', { error: String(error) });
      return res
        .status(400)
        .json({ error: error instanceof Error ? error.message : 'Setup failed' });
    }
  });

  return router;
}
