/**
 * Dashboard Server
 *
 * Express server for the dashboard API with database integration.
 * Serves the React frontend in production.
 */

import express, { Application } from 'express';
import cors from 'cors';
import path from 'path';
import fs from 'fs';
import { createServiceLogger } from '@orient/core';
import { ensureAgentsSeeded } from '@orient/database-services';
import { MessageDatabase } from '../services/messageDatabase.js';
import { SlackDatabase } from '../services/slackDatabase.js';
import { SchedulerDatabase } from '../services/schedulerDatabase.js';
import { SchedulerService } from '../services/schedulerService.js';
import { WebhookDatabase } from '../services/webhookDatabase.js';
import { WebhookService } from '../services/webhookService.js';
import { MonitoringService, createMonitoringService } from '../services/monitoringService.js';
import { PromptService, createPromptService } from '../services/promptService.js';
import { StorageDatabase } from '../services/storageDatabase.js';
import { createDashboardAuth, DashboardAuth, createRateLimitMiddleware } from '../auth.js';
import { createDashboardRouter } from './routes.js';
import { createSetupRouter } from './setupRoutes.js';
import { createSetupAuthRouter } from './setupAuthRoutes.js';
// Apps service for mini-apps listing
import { AppsService, createAppsService } from '../services/appsService.js';
// TODO: Re-enable miniapp editor imports from @orient/apps and @orient/agents
// import { createMiniappEditService, MiniappEditService } from '@orient/apps';
// import { createMiniappEditDatabase } from '@orient/apps';
// import { createAppGitService } from '@orient/apps';
// import { createOpenCodeClient } from '@orient/agents';

const logger = createServiceLogger('dashboard-server');

export interface DashboardServerConfig {
  port: number;
  jwtSecret: string;
  databaseUrl?: string;
  corsOrigins?: string[];
  staticPath?: string;
  setupOnly?: boolean;
}

export interface DashboardServices {
  db: MessageDatabase;
  slackDb?: SlackDatabase;
  schedulerDb?: SchedulerDatabase;
  schedulerService?: SchedulerService;
  webhookDb?: WebhookDatabase;
  webhookService?: WebhookService;
  promptService?: PromptService;
  monitoring?: MonitoringService;
  appsService?: AppsService;
  storageDb?: StorageDatabase;
  // miniappEditService?: MiniappEditService;  // TODO: Re-enable with miniapp editor
  auth: DashboardAuth;
}

/**
 * Initialize all dashboard services
 */
async function initializeServices(config: DashboardServerConfig): Promise<DashboardServices> {
  const databaseUrl = config.databaseUrl || process.env.DATABASE_URL;

  // Initialize databases
  const db = new MessageDatabase(databaseUrl);
  await db.initialize();

  const slackDb = new SlackDatabase(databaseUrl);
  await slackDb.initialize();

  const schedulerDb = new SchedulerDatabase(databaseUrl);
  await schedulerDb.initialize();

  // Ensure default agents are seeded
  const seedResult = await ensureAgentsSeeded();
  if (seedResult.seeded) {
    logger.info('Default agents seeded', {
      agentCount: seedResult.agentCount,
      contextRuleCount: seedResult.contextRuleCount,
    });
  } else if (seedResult.reason) {
    logger.debug('Agent seeding skipped', { reason: seedResult.reason });
  }

  // Initialize services
  const schedulerService = new SchedulerService(schedulerDb);
  await schedulerService.start();

  // Initialize webhook database and service
  const webhookDb = new WebhookDatabase(databaseUrl);
  await webhookDb.initialize();
  const webhookService = new WebhookService(webhookDb);

  // Initialize prompt service
  const promptService = createPromptService(db);

  // Initialize monitoring (optional - only if enabled)
  let monitoring: MonitoringService | undefined;
  if (process.env.MONITORING_ENABLED !== 'false') {
    monitoring = createMonitoringService();
    logger.info('Monitoring service initialized');
  }

  // Initialize apps service for mini-apps listing
  let appsService: AppsService | undefined;
  try {
    appsService = await createAppsService();
    logger.info('Apps service initialized', { appCount: appsService.appCount });
  } catch (error) {
    logger.warn('Failed to initialize apps service', {
      error: error instanceof Error ? error.message : String(error),
    });
  }

  // Initialize storage database for mini-app persistence
  const storageDb = new StorageDatabase(databaseUrl);
  await storageDb.initialize();
  logger.info('Storage database initialized');

  // TODO: Re-enable miniapp edit service when src/ directory is included in Docker build
  // Initialize miniapp edit service
  // let miniappEditService: MiniappEditService | undefined;
  // try {
  //   const miniappEditDb = createMiniappEditDatabase(databaseUrl);
  //   await miniappEditDb.initialize();
  //
  //   // Get repo path from environment or use default
  //   const repoPath = process.env.REPO_PATH || process.cwd();
  //
  //   const appGitService = createAppGitService({
  //     repoPath,
  //     worktreeBase: process.env.APP_WORKTREES_PATH,
  //   });
  //
  //   const openCodeClient = createOpenCodeClient(
  //     process.env.OPENCODE_SERVER_URL || 'http://localhost:4099',
  //     process.env.OPENCODE_DEFAULT_MODEL
  //   );
  //
  //   miniappEditService = createMiniappEditService({
  //     appGitService,
  //     openCodeClient,
  //     database: miniappEditDb,
  //     portalBaseUrl: process.env.OPENCODE_PORTAL_URL || 'http://localhost:4099',
  //   });
  //
  //   logger.info('Miniapp edit service initialized');
  // } catch (error) {
  //   logger.warn('Failed to initialize miniapp edit service', {
  //     error: error instanceof Error ? error.message : String(error),
  //     });
  // }

  // Initialize auth
  const auth = createDashboardAuth(config.jwtSecret, db);

  logger.info('Dashboard services initialized');

  return {
    db,
    slackDb,
    schedulerDb,
    schedulerService,
    webhookDb,
    webhookService,
    promptService,
    monitoring,
    appsService,
    storageDb,
    // miniappEditService,  // TODO: Re-enable with miniapp editor
    auth,
  };
}

async function initializeSetupAuthServices(config: DashboardServerConfig): Promise<{
  db: MessageDatabase;
  auth: DashboardAuth;
}> {
  const databaseUrl = config.databaseUrl || process.env.DATABASE_URL;
  const db = new MessageDatabase(databaseUrl);
  await db.initialize();
  const auth = createDashboardAuth(config.jwtSecret, db);
  return { db, auth };
}

/**
 * Create and configure the dashboard server
 */
function createBaseServer(config: DashboardServerConfig): Application {
  const app = express();

  // Middleware
  app.use(express.json({ limit: '10mb' }));
  app.use(
    cors({
      origin: config.corsOrigins || ['http://localhost:3000', 'http://localhost:5173'],
      credentials: true,
    })
  );

  // Rate limiting
  app.use(createRateLimitMiddleware());

  // Health check (no auth required) - place before static files
  app.get('/health', (_req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
  });

  // Setup wizard routes (no auth required)
  app.use('/api/setup', createSetupRouter());

  return app;
}

function attachFrontend(app: Application, config: DashboardServerConfig): void {
  // Get static path from config or environment
  const staticPath = config.staticPath || process.env.DASHBOARD_STATIC_PATH;

  // Serve React frontend if static path is configured
  if (staticPath && fs.existsSync(staticPath)) {
    logger.info('Serving React frontend', { staticPath });

    // Serve static files
    app.use(express.static(staticPath));

    // SPA fallback - serve index.html for any non-API routes
    // This allows React Router to handle client-side routing
    // Note: Express 5 / path-to-regexp v8 requires named wildcards
    app.get('/{*splat}', (req, res, next) => {
      // Skip API routes and health checks
      if (req.path.startsWith('/api') || req.path === '/health') {
        return next();
      }

      const indexPath = path.join(staticPath, 'index.html');
      if (fs.existsSync(indexPath)) {
        res.sendFile(indexPath);
      } else {
        next();
      }
    });
  } else {
    // Fallback landing page when no frontend is available
    logger.info('No frontend build found, serving fallback landing page', {
      staticPath: staticPath || 'not set',
    });

    app.get('/', (_req, res) => {
      res.send(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Orient</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%);
      min-height: 100vh;
      color: #fff;
      display: flex;
      flex-direction: column;
      align-items: center;
      padding: 40px 20px;
    }
    .container { max-width: 600px; width: 100%; }
    h1 { font-size: 2.5rem; margin-bottom: 8px; }
    .subtitle { color: #94a3b8; margin-bottom: 40px; }
    .status {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      background: rgba(34, 197, 94, 0.1);
      border: 1px solid rgba(34, 197, 94, 0.3);
      padding: 8px 16px;
      border-radius: 20px;
      margin-bottom: 40px;
    }
    .status-dot {
      width: 8px;
      height: 8px;
      background: #22c55e;
      border-radius: 50%;
      animation: pulse 2s infinite;
    }
    @keyframes pulse {
      0%, 100% { opacity: 1; }
      50% { opacity: 0.5; }
    }
    .cards { display: flex; flex-direction: column; gap: 16px; }
    .card {
      background: rgba(255, 255, 255, 0.05);
      border: 1px solid rgba(255, 255, 255, 0.1);
      border-radius: 12px;
      padding: 20px;
      text-decoration: none;
      color: #fff;
      transition: all 0.2s;
    }
    .card:hover {
      background: rgba(255, 255, 255, 0.1);
      border-color: rgba(255, 255, 255, 0.2);
      transform: translateY(-2px);
    }
    .card h3 { margin-bottom: 4px; }
    .card p { color: #94a3b8; font-size: 0.9rem; }
    .footer {
      margin-top: 60px;
      color: #64748b;
      font-size: 0.85rem;
    }
  </style>
</head>
<body>
  <div class="container">
    <h1>Orient</h1>
    <p class="subtitle">WhatsApp & Slack automation for project management</p>

    <div class="status">
      <span class="status-dot"></span>
      <span>System Online</span>
    </div>

    <div class="cards">
      <a href="/qr" class="card">
        <h3>WhatsApp Connection</h3>
        <p>View QR code or connection status</p>
      </a>
      <a href="/api/health" class="card">
        <h3>API Health</h3>
        <p>Check API status and health metrics</p>
      </a>
    </div>

    <p class="footer">v1.0.0 | Powered by Claude</p>
  </div>
</body>
</html>`);
    });
  }
}

export function createDashboardServer(
  config: DashboardServerConfig,
  services: DashboardServices
): Application {
  const app = createBaseServer(config);

  // API routes - place before static files
  app.use('/api', createDashboardRouter(services));

  // Mini-apps static file serving - serve built apps from /apps/:appName/
  if (services.appsService) {
    const appsService = services.appsService;

    // Serve mini-app static files
    app.use('/apps/:appName', (req, res, next) => {
      const appName = req.params.appName;
      const app = appsService.getApp(appName);

      if (!app || !app.isBuilt) {
        return res.status(404).json({ error: `App "${appName}" not found or not built` });
      }

      // Serve static files from the app's dist directory
      express.static(app.distPath)(req, res, () => {
        // If no file found, serve index.html for SPA routing
        const indexPath = path.join(app.distPath, 'index.html');
        if (fs.existsSync(indexPath)) {
          res.sendFile(indexPath);
        } else {
          next();
        }
      });
    });

    logger.info('Mini-apps static file serving enabled');
  }

  attachFrontend(app, config);

  return app;
}

export function createSetupOnlyServer(
  config: DashboardServerConfig,
  setupAuth?: { db: MessageDatabase; auth: DashboardAuth }
): Application {
  const app = createBaseServer(config);

  if (setupAuth) {
    app.use('/api', createSetupAuthRouter(setupAuth));
  }

  attachFrontend(app, config);

  return app;
}

/**
 * Start the dashboard server
 */
export async function startDashboardServer(config: DashboardServerConfig): Promise<void> {
  try {
    let app: Application;
    if (config.setupOnly) {
      const setupAuth = await initializeSetupAuthServices(config);
      app = createSetupOnlyServer(config, setupAuth);
    } else {
      // Initialize services
      const services = await initializeServices(config);
      app = createDashboardServer(config, services);
    }

    // Start listening
    return new Promise((resolve) => {
      app.listen(config.port, '0.0.0.0', () => {
        logger.info('Dashboard server started', { port: config.port });
        resolve();
      });
    });
  } catch (error) {
    logger.error('Failed to start dashboard server', { error: String(error) });
    throw error;
  }
}

export { createDashboardRouter };
export type { DashboardAuth };
