import { Router, Request, Response } from 'express';
import { createServiceLogger } from '@orient/core';
import type { MessageDatabase } from '@orient/database-services';
import type { DashboardAuth } from '../auth.js';

const logger = createServiceLogger('setup-auth-routes');

export function createSetupAuthRouter(deps: { db: MessageDatabase; auth: DashboardAuth }): Router {
  const router = Router();

  router.get('/auth/setup-required', async (_req: Request, res: Response) => {
    try {
      const hasUsers = await deps.db.hasDashboardUsers();
      res.json({ setupRequired: !hasUsers });
    } catch (error) {
      logger.error('Setup check error', { error: String(error) });
      res.status(500).json({ error: 'Failed to check setup status' });
    }
  });

  router.post('/auth/setup', async (req: Request, res: Response) => {
    try {
      const hasUsers = await deps.db.hasDashboardUsers();
      if (hasUsers) {
        res.status(403).json({ error: 'Setup already completed. Users exist.' });
        return;
      }

      const { username, password } = req.body || {};
      if (!username || !password) {
        res.status(400).json({ error: 'Username and password are required' });
        return;
      }

      if (password.length < 8) {
        res.status(400).json({ error: 'Password must be at least 8 characters' });
        return;
      }

      const userId = await deps.auth.createUser(username, password);
      const loginResult = await deps.auth.login(username, password);

      res.json({
        success: true,
        userId,
        token: loginResult?.token,
        message: 'Admin user created successfully',
      });
    } catch (error) {
      logger.error('Setup failed', { error: String(error) });
      res.status(500).json({ error: 'Setup failed' });
    }
  });

  return router;
}
