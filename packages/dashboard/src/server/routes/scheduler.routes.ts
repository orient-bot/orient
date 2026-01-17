/**
 * Scheduler Routes
 *
 * API endpoints for scheduled job management.
 */

import { Router, Request, Response } from 'express';
import { createServiceLogger } from '@orient/core';
import { SchedulerService } from '../../services/schedulerService.js';
import { CreateScheduledJobInput, UpdateScheduledJobInput } from '../../types/scheduler.js';

const logger = createServiceLogger('scheduler-routes');

/**
 * Create Scheduler routes
 */
export function createSchedulerRoutes(
  schedulerService: SchedulerService,
  requireAuth: (req: Request, res: Response, next: () => void) => void
): Router {
  const router = Router();

  // Get scheduler statistics
  router.get('/stats', requireAuth, async (_req: Request, res: Response) => {
    try {
      const stats = await schedulerService.getStats();
      res.json(stats);
    } catch (error) {
      logger.error('Failed to get scheduler stats', {
        error: error instanceof Error ? error.message : String(error),
      });
      res.status(500).json({ error: 'Failed to get scheduler statistics' });
    }
  });

  // List all scheduled jobs
  router.get('/', requireAuth, async (_req: Request, res: Response) => {
    try {
      const jobs = await schedulerService.getAllJobs();
      res.json({ jobs });
    } catch (error) {
      logger.error('Failed to get scheduled jobs', {
        error: error instanceof Error ? error.message : String(error),
      });
      res.status(500).json({ error: 'Failed to get scheduled jobs' });
    }
  });

  // Get recent runs across all jobs (must be before /:id to avoid conflict)
  router.get('/runs/recent', requireAuth, async (req: Request, res: Response) => {
    try {
      const limit = parseInt(req.query.limit as string) || 50;
      const runs = await schedulerService.getRecentRuns(limit);
      res.json({ runs });
    } catch (error) {
      logger.error('Failed to get recent runs', {
        error: error instanceof Error ? error.message : String(error),
      });
      res.status(500).json({ error: 'Failed to get recent runs' });
    }
  });

  // Validate cron expression
  router.post('/validate-cron', requireAuth, async (req: Request, res: Response) => {
    try {
      const { expression } = req.body;
      if (!expression) {
        res.status(400).json({ error: 'Expression required' });
        return;
      }

      const valid = SchedulerService.validateCronExpression(expression);
      const description = valid ? SchedulerService.describeCronExpression(expression) : null;

      res.json({ valid, description });
    } catch (error) {
      logger.error('Failed to validate cron expression', {
        error: error instanceof Error ? error.message : String(error),
      });
      res.status(500).json({ error: 'Failed to validate cron expression' });
    }
  });

  // Get a specific job
  router.get('/:id', requireAuth, async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) {
        res.status(400).json({ error: 'Invalid job ID' });
        return;
      }

      const job = await schedulerService.getJob(id);
      if (!job) {
        res.status(404).json({ error: 'Job not found' });
        return;
      }

      res.json(job);
    } catch (error) {
      logger.error('Failed to get scheduled job', {
        error: error instanceof Error ? error.message : String(error),
      });
      res.status(500).json({ error: 'Failed to get scheduled job' });
    }
  });

  // Create a new scheduled job
  router.post('/', requireAuth, async (req: Request, res: Response) => {
    try {
      const input = req.body as CreateScheduledJobInput;

      // Validate required fields
      if (
        !input.name ||
        !input.scheduleType ||
        !input.provider ||
        !input.target ||
        !input.messageTemplate
      ) {
        res.status(400).json({
          error: 'Missing required fields: name, scheduleType, provider, target, messageTemplate',
        });
        return;
      }

      // Validate schedule type specific fields
      if (input.scheduleType === 'cron' && !input.cronExpression) {
        res.status(400).json({ error: 'Cron expression required for cron schedule type' });
        return;
      }
      if (input.scheduleType === 'once' && !input.runAt) {
        res.status(400).json({ error: 'Run at time required for one-time schedule' });
        return;
      }
      if (input.scheduleType === 'recurring' && !input.intervalMinutes) {
        res.status(400).json({ error: 'Interval minutes required for recurring schedule' });
        return;
      }

      // Validate cron expression if provided
      if (input.cronExpression && !SchedulerService.validateCronExpression(input.cronExpression)) {
        res.status(400).json({ error: 'Invalid cron expression' });
        return;
      }

      const job = await schedulerService.createJob(input);
      res.status(201).json(job);
    } catch (error) {
      logger.error('Failed to create scheduled job', {
        error: error instanceof Error ? error.message : String(error),
      });
      res.status(500).json({ error: 'Failed to create scheduled job' });
    }
  });

  // Update a scheduled job
  router.patch('/:id', requireAuth, async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) {
        res.status(400).json({ error: 'Invalid job ID' });
        return;
      }

      const input = req.body as UpdateScheduledJobInput;

      // Validate cron expression if provided
      if (input.cronExpression && !SchedulerService.validateCronExpression(input.cronExpression)) {
        res.status(400).json({ error: 'Invalid cron expression' });
        return;
      }

      const job = await schedulerService.updateJob(id, input);
      if (!job) {
        res.status(404).json({ error: 'Job not found' });
        return;
      }

      res.json(job);
    } catch (error) {
      logger.error('Failed to update scheduled job', {
        error: error instanceof Error ? error.message : String(error),
      });
      res.status(500).json({ error: 'Failed to update scheduled job' });
    }
  });

  // Delete a scheduled job
  router.delete('/:id', requireAuth, async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) {
        res.status(400).json({ error: 'Invalid job ID' });
        return;
      }

      const deleted = await schedulerService.deleteJob(id);
      if (!deleted) {
        res.status(404).json({ error: 'Job not found' });
        return;
      }

      res.json({ success: true, message: 'Job deleted' });
    } catch (error) {
      logger.error('Failed to delete scheduled job', {
        error: error instanceof Error ? error.message : String(error),
      });
      res.status(500).json({ error: 'Failed to delete scheduled job' });
    }
  });

  // Toggle job enabled state
  router.post('/:id/toggle', requireAuth, async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) {
        res.status(400).json({ error: 'Invalid job ID' });
        return;
      }

      const { enabled } = req.body;
      if (typeof enabled !== 'boolean') {
        res.status(400).json({ error: 'enabled must be a boolean' });
        return;
      }

      const job = await schedulerService.toggleJob(id, enabled);
      if (!job) {
        res.status(404).json({ error: 'Job not found' });
        return;
      }

      res.json(job);
    } catch (error) {
      logger.error('Failed to toggle scheduled job', {
        error: error instanceof Error ? error.message : String(error),
      });
      res.status(500).json({ error: 'Failed to toggle scheduled job' });
    }
  });

  // Run job now (manual trigger)
  router.post('/:id/run', requireAuth, async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) {
        res.status(400).json({ error: 'Invalid job ID' });
        return;
      }

      const result = await schedulerService.runJobNow(id);
      res.json(result);
    } catch (error) {
      logger.error('Failed to run scheduled job', {
        error: error instanceof Error ? error.message : String(error),
      });
      res.status(500).json({ error: 'Failed to run scheduled job' });
    }
  });

  // Get job run history
  router.get('/:id/runs', requireAuth, async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) {
        res.status(400).json({ error: 'Invalid job ID' });
        return;
      }

      const limit = parseInt(req.query.limit as string) || 50;
      const runs = await schedulerService.getJobRuns(id, limit);
      res.json({ runs });
    } catch (error) {
      logger.error('Failed to get job runs', {
        error: error instanceof Error ? error.message : String(error),
      });
      res.status(500).json({ error: 'Failed to get job runs' });
    }
  });

  logger.info('Scheduler routes initialized');

  return router;
}
