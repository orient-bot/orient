#!/usr/bin/env node
/**
 * API Gateway Container Entry Point
 *
 * This is the main entry point when running as a Docker container.
 * It initializes the scheduler service and health monitor.
 */

import { SchedulerService } from './scheduler/index.js';
import { HealthMonitor } from './health/index.js';
import {
  createServiceLogger,
  loadConfig,
  getConfig,
  setSecretOverrides,
  startConfigPoller,
} from '@orient-bot/core';
import express from 'express';
import { createSecretsService } from '@orient-bot/database-services';

const logger = createServiceLogger('api-gateway');
const secretsService = createSecretsService();

// Default port for the API gateway
const DEFAULT_PORT = 4100;

/**
 * Graceful shutdown handler
 */
function setupGracefulShutdown(
  scheduler: SchedulerService,
  server: ReturnType<typeof express>
): void {
  const shutdown = async (signal: string) => {
    logger.info('Received shutdown signal', { signal });
    try {
      await scheduler.stop();
      logger.info('API Gateway shutdown complete');
      process.exit(0);
    } catch (error) {
      logger.error('Error during shutdown', { error: String(error) });
      process.exit(1);
    }
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

async function loadSecretOverrides(): Promise<void> {
  try {
    const secrets = await secretsService.getAllSecrets();
    if (Object.keys(secrets).length > 0) {
      setSecretOverrides(secrets);
    }
  } catch (error) {
    logger.warn('Failed to load secrets from database', { error: String(error) });
  }
}

async function main(): Promise<void> {
  const op = logger.startOperation('startup');

  logger.info('Starting API Gateway...');

  try {
    await loadSecretOverrides();
    const pollUrl = process.env.ORIENT_CONFIG_POLL_URL;
    if (pollUrl) {
      startConfigPoller({
        url: pollUrl,
        intervalMs: parseInt(process.env.ORIENT_CONFIG_POLL_INTERVAL_MS || '30000', 10),
      });
    }

    // Load configuration
    await loadConfig();
    const config = getConfig();

    const port = parseInt(process.env.API_GATEWAY_PORT || String(DEFAULT_PORT), 10);

    // Initialize services
    const scheduler = new SchedulerService();
    const healthMonitor = new HealthMonitor();

    // Register health checks
    healthMonitor.registerCheck('scheduler', async () => ({
      service: 'scheduler',
      status: scheduler.getIsRunning() ? 'healthy' : 'unhealthy',
      lastCheck: new Date(),
      details: { jobCount: scheduler.getJobs().length },
    }));

    // Create Express app for health endpoints
    const app = express();

    // Health endpoint
    app.get('/health', async (_req, res) => {
      try {
        const health = await healthMonitor.runChecks();
        const statusCode = health.status === 'healthy' ? 200 : 503;
        res.status(statusCode).json(health);
      } catch (error) {
        res.status(500).json({ status: 'error', error: String(error) });
      }
    });

    // Ready endpoint
    app.get('/ready', (_req, res) => {
      if (scheduler.getIsRunning()) {
        res.json({ ready: true });
      } else {
        res.status(503).json({ ready: false });
      }
    });

    // Scheduler info endpoint
    app.get('/scheduler/jobs', (_req, res) => {
      res.json({ jobs: scheduler.getJobs() });
    });

    // Setup graceful shutdown
    setupGracefulShutdown(scheduler, app);

    // Start scheduler
    await scheduler.start();

    // Start HTTP server
    app.listen(port, () => {
      logger.info('API Gateway HTTP server started', { port });
    });

    op.success('API Gateway started successfully');

    logger.info('API Gateway running', { port });
  } catch (error) {
    op.failure(error as Error);
    logger.error('Failed to start API Gateway', { error: String(error) });
    process.exit(1);
  }
}

main().catch((error) => {
  logger.error('Unhandled error in main', { error: String(error) });
  process.exit(1);
});
