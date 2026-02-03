#!/usr/bin/env node
/**
 * Dashboard Container Entry Point
 *
 * This is the main entry point when running as a Docker container or local install.
 * It starts the dashboard server with database connections.
 * In unified server mode, it also initializes WhatsApp integration.
 */

import crypto from 'crypto';
import { startDashboardServer } from './server/index.js';
import { getSetupStatus } from './server/setupWizard.js';
import { createServiceLogger, loadConfig, getConfig, setSecretOverrides } from '@orient-bot/core';
import { createSecretsService } from '@orient-bot/database-services';
import { initializeWhatsAppIntegration } from './services/whatsappIntegration.js';

const logger = createServiceLogger('dashboard');
const secretsService = createSecretsService();

// Default port for the dashboard
const DEFAULT_PORT = 4098;
const MIN_JWT_SECRET_LENGTH = 32;

// Store shutdown handlers for cleanup
let whatsappShutdown: (() => Promise<void>) | null = null;

/**
 * Graceful shutdown handler
 */
function setupGracefulShutdown(): void {
  const shutdown = async (signal: string) => {
    logger.info('Received shutdown signal', { signal });
    try {
      // Shutdown WhatsApp if initialized
      if (whatsappShutdown) {
        await whatsappShutdown();
      }
      logger.info('Dashboard shutdown complete');
      process.exit(0);
    } catch (error) {
      logger.error('Error during shutdown', { error: String(error) });
      process.exit(1);
    }
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

async function main(): Promise<void> {
  const op = logger.startOperation('startup');

  logger.info('Starting Dashboard...');

  try {
    try {
      const secrets = await secretsService.getAllSecrets();
      if (Object.keys(secrets).length > 0) {
        setSecretOverrides(secrets);
      }
    } catch (error) {
      logger.warn('Failed to load secrets from database', { error: String(error) });
    }

    let config: ReturnType<typeof getConfig> | null = null;
    let configLoadFailed = false;
    try {
      await loadConfig();
      config = getConfig();
    } catch (error) {
      configLoadFailed = true;
      logger.warn('Config validation failed. Starting in setup-only mode.', {
        error: error instanceof Error ? error.message : String(error),
      });
    }

    // Get port from env or config
    const port = parseInt(
      process.env.DASHBOARD_PORT || String(config?.dashboard?.port || DEFAULT_PORT),
      10
    );

    const setupStatus = await getSetupStatus();
    const setupOnly = setupStatus.needsSetup || configLoadFailed;
    if (setupOnly) {
      process.env.ORIENT_SETUP_ONLY = 'true';
      logger.warn('Workspace setup required. Starting in setup-only mode.', {
        missingRequired: setupStatus.missingRequired,
      });
    }

    // Get JWT secret (required outside setup-only mode)
    let jwtSecret =
      process.env.DASHBOARD_JWT_SECRET || process.env.JWT_SECRET || config?.dashboard?.jwtSecret;

    if (!jwtSecret || jwtSecret.length < MIN_JWT_SECRET_LENGTH) {
      if (setupOnly) {
        jwtSecret = crypto.randomBytes(48).toString('hex');
        logger.warn('Using temporary JWT secret for setup-only mode.');
      } else if (!jwtSecret) {
        throw new Error(
          'DASHBOARD_JWT_SECRET environment variable is required. Set it to a secure string of at least 32 characters.'
        );
      } else {
        throw new Error(`JWT secret must be at least ${MIN_JWT_SECRET_LENGTH} characters long`);
      }
    }

    // Get database URL
    const databaseUrl = process.env.DATABASE_URL;
    if (!databaseUrl) {
      logger.warn('DATABASE_URL not set, using default local connection');
    }

    // Get static path for frontend (auto-detect in development)
    let staticPath = process.env.DASHBOARD_STATIC_PATH;
    if (!staticPath) {
      // Try to auto-detect frontend dist in development
      const { existsSync } = await import('fs');
      const { resolve, dirname } = await import('path');
      const { fileURLToPath } = await import('url');
      const __dirname = dirname(fileURLToPath(import.meta.url));
      const devFrontendPath = resolve(__dirname, '../../dashboard-frontend/dist');
      if (existsSync(devFrontendPath)) {
        staticPath = devFrontendPath;
        logger.info('Auto-detected frontend path', { staticPath });
      } else {
        const bundledFrontendPath = resolve(__dirname, '../public');
        if (existsSync(bundledFrontendPath)) {
          staticPath = bundledFrontendPath;
          logger.info('Using bundled frontend path', { staticPath });
        }
      }
    }

    // Setup graceful shutdown
    setupGracefulShutdown();

    // Initialize WhatsApp integration if not in setup-only mode
    let whatsappRouter;
    if (!setupOnly) {
      try {
        const whatsappIntegration = await initializeWhatsAppIntegration();
        if (whatsappIntegration) {
          whatsappRouter = whatsappIntegration.router;
          whatsappShutdown = whatsappIntegration.shutdown;
          logger.info('WhatsApp integration initialized (unified server mode)');
        }
      } catch (error) {
        logger.warn('WhatsApp integration failed to initialize', {
          error: error instanceof Error ? error.message : String(error),
        });
        // Continue without WhatsApp - dashboard still works
      }
    }

    // Start the dashboard server
    await startDashboardServer({
      port,
      jwtSecret,
      databaseUrl,
      staticPath,
      corsOrigins: process.env.CORS_ORIGINS?.split(','),
      setupOnly,
      whatsappRouter,
    });

    op.success('Dashboard started successfully');

    const whatsappStatus = whatsappRouter ? 'enabled' : 'disabled';
    logger.info('Dashboard running', { port, whatsappStatus });
  } catch (error) {
    op.failure(error as Error);
    logger.error('Failed to start Dashboard', { error: String(error) });
    process.exit(1);
  }
}

main().catch((error) => {
  logger.error('Unhandled error in main', { error: String(error) });
  process.exit(1);
});
