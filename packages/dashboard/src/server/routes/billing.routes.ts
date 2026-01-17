/**
 * Billing Routes
 *
 * API endpoints for billing and cost tracking across providers.
 */

import { Router, Request, Response } from 'express';
import { createServiceLogger } from '@orient/core';
import { getBillingService } from '../../services/billingService.js';
import { AuthenticatedRequest } from '../../auth.js';

const logger = createServiceLogger('billing-routes');

/**
 * Create Billing routes
 */
export function createBillingRoutes(
  requireAuth: (req: Request, res: Response, next: () => void) => void
): Router {
  const router = Router();

  // Get billing summary (all providers)
  router.get('/summary', requireAuth, async (req: Request, res: Response) => {
    try {
      const startDate = req.query.start ? new Date(req.query.start as string) : undefined;
      const endDate = req.query.end ? new Date(req.query.end as string) : undefined;
      const noCache = req.query.noCache === 'true';

      const billingService = getBillingService();
      const summary = await billingService.getSummary(startDate, endDate, !noCache);
      res.json(summary);
    } catch (error) {
      logger.error('Failed to get billing summary', {
        error: error instanceof Error ? error.message : String(error),
      });
      res.status(500).json({ error: 'Failed to get billing summary' });
    }
  });

  // Get billing config status
  router.get('/config', requireAuth, async (_req: Request, res: Response) => {
    try {
      const billingService = getBillingService();
      const configStatus = billingService.getConfigStatus();
      const projectScope = billingService.getProjectScope();
      res.json({
        providers: configStatus,
        projectScope,
      });
    } catch (error) {
      logger.error('Failed to get billing config', {
        error: error instanceof Error ? error.message : String(error),
      });
      res.status(500).json({ error: 'Failed to get billing config' });
    }
  });

  // Get Anthropic billing
  router.get('/anthropic', requireAuth, async (req: Request, res: Response) => {
    try {
      const startDate = req.query.start ? new Date(req.query.start as string) : undefined;
      const endDate = req.query.end ? new Date(req.query.end as string) : undefined;

      const billingService = getBillingService();
      const billing = await billingService.getAnthropicBilling(startDate, endDate);
      res.json(billing);
    } catch (error) {
      logger.error('Failed to get Anthropic billing', {
        error: error instanceof Error ? error.message : String(error),
      });
      res.status(500).json({ error: 'Failed to get Anthropic billing' });
    }
  });

  // Get OpenAI billing
  router.get('/openai', requireAuth, async (req: Request, res: Response) => {
    try {
      const startDate = req.query.start ? new Date(req.query.start as string) : undefined;
      const endDate = req.query.end ? new Date(req.query.end as string) : undefined;

      const billingService = getBillingService();
      const billing = await billingService.getOpenAIBilling(startDate, endDate);
      res.json(billing);
    } catch (error) {
      logger.error('Failed to get OpenAI billing', {
        error: error instanceof Error ? error.message : String(error),
      });
      res.status(500).json({ error: 'Failed to get OpenAI billing' });
    }
  });

  // Get Google billing
  router.get('/google', requireAuth, async (req: Request, res: Response) => {
    try {
      const startDate = req.query.start ? new Date(req.query.start as string) : undefined;
      const endDate = req.query.end ? new Date(req.query.end as string) : undefined;

      const billingService = getBillingService();
      const billing = await billingService.getGoogleBilling(startDate, endDate);
      res.json(billing);
    } catch (error) {
      logger.error('Failed to get Google billing', {
        error: error instanceof Error ? error.message : String(error),
      });
      res.status(500).json({ error: 'Failed to get Google billing' });
    }
  });

  // Get Cloudflare billing
  router.get('/cloudflare', requireAuth, async (req: Request, res: Response) => {
    try {
      const startDate = req.query.start ? new Date(req.query.start as string) : undefined;
      const endDate = req.query.end ? new Date(req.query.end as string) : undefined;

      const billingService = getBillingService();
      const billing = await billingService.getCloudflareBilling(startDate, endDate);
      res.json(billing);
    } catch (error) {
      logger.error('Failed to get Cloudflare billing', {
        error: error instanceof Error ? error.message : String(error),
      });
      res.status(500).json({ error: 'Failed to get Cloudflare billing' });
    }
  });

  // Get Oracle billing
  router.get('/oracle', requireAuth, async (req: Request, res: Response) => {
    try {
      const startDate = req.query.start ? new Date(req.query.start as string) : undefined;
      const endDate = req.query.end ? new Date(req.query.end as string) : undefined;

      const billingService = getBillingService();
      const billing = await billingService.getOracleBilling(startDate, endDate);
      res.json(billing);
    } catch (error) {
      logger.error('Failed to get Oracle billing', {
        error: error instanceof Error ? error.message : String(error),
      });
      res.status(500).json({ error: 'Failed to get Oracle billing' });
    }
  });

  // Clear billing cache
  router.post('/clear-cache', requireAuth, async (_req: AuthenticatedRequest, res: Response) => {
    try {
      const billingService = getBillingService();
      billingService.clearCache();
      res.json({ success: true, message: 'Billing cache cleared' });
    } catch (error) {
      logger.error('Failed to clear billing cache', {
        error: error instanceof Error ? error.message : String(error),
      });
      res.status(500).json({ error: 'Failed to clear billing cache' });
    }
  });

  logger.info('Billing routes initialized');

  return router;
}
