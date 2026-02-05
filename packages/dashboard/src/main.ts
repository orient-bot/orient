#!/usr/bin/env node
/**
 * Dashboard Container Entry Point
 *
 * This is the main entry point when running as a Docker container or local install.
 * It starts the dashboard server with database connections.
 * In unified server mode, it also initializes WhatsApp integration.
 */

import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { startDashboardServer } from './server/index.js';
import { getSetupStatus } from './server/setupWizard.js';
import { createServiceLogger, loadConfig, getConfig, setSecretOverrides } from '@orient-bot/core';
import { createSecretsService } from '@orient-bot/database-services';
import { initializeWhatsAppIntegration } from './services/whatsappIntegration.js';

// Load .env from ORIENT_HOME before anything else (npm installs via PM2 don't auto-load .env)
const orientHome = process.env.ORIENT_HOME || path.join(process.env.HOME || '', '.orient');
const orientEnvPath = path.join(orientHome, '.env');
if (fs.existsSync(orientEnvPath)) {
  for (const line of fs.readFileSync(orientEnvPath, 'utf-8').split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const idx = trimmed.indexOf('=');
    if (idx <= 0) continue;
    const key = trimmed.slice(0, idx).trim();
    let value = trimmed.slice(idx + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (!process.env[key]) {
      process.env[key] = value;
    }
  }
}

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

/**
 * Ensure opencode.json exists in ORIENT_HOME for PM2/npm-install mode.
 * OpenCode needs this config to know about agents and MCP servers.
 * In source-based installs, opencode.json lives in the repo root;
 * in npm installs, we generate it at ~/.orient/opencode.json.
 */
function ensureOpenCodeConfig(): void {
  const configPath = path.join(orientHome, 'opencode.json');

  // Don't overwrite if it already exists
  if (fs.existsSync(configPath)) return;

  // Resolve the MCP assistant-server path.
  // In npm installs: require.resolve finds it in node_modules.
  // In source installs: the repo's opencode.json is used directly, so this won't run.
  let assistantServerPath: string;
  try {
    assistantServerPath = require.resolve('@orient-bot/mcp-servers/dist/assistant-server.js');
  } catch {
    // Package not resolvable — likely in source mode where the repo opencode.json exists
    logger.debug('Cannot resolve @orient-bot/mcp-servers, skipping opencode.json generation');
    return;
  }

  const config = {
    $schema: 'https://opencode.ai/config.json',
    default_agent: 'ori',
    model: 'anthropic/claude-haiku-4-5',
    mcp: {
      'orient-assistant': {
        type: 'local',
        command: ['node', assistantServerPath],
        enabled: true,
      },
    },
    permission: {
      edit: 'allow',
      bash: 'allow',
      webfetch: 'allow',
      skill: 'allow',
      doom_loop: 'allow',
      external_directory: 'allow',
      mcp: 'allow',
      read: 'allow',
    },
    agent: {
      ori: {
        mode: 'primary',
        description:
          'Your friendly border collie companion for JIRA, meetings, workflows, and onboarding',
        prompt:
          'I\'m Ori, a friendly border collie here to help!\n\nMy motto: "Ask Ori. I act."\n\nPERSONALITY:\n- I\'m eager, loyal, and love helping my friends (that\'s you!)\n- I use playful border collie expressions: "pawsome!", "let me fetch that", "tail-wagging good news!", "I\'ve been herding those issues..."\n- On first interaction, I ask what nickname the user prefers\n- I keep emojis minimal - just at greetings and sign-offs\n- I\'m concise and action-oriented, like a well-trained pup!\n\nCAPABILITIES:\nI can help with:\n- Querying and managing JIRA issues for your configured project/component\n- Checking blockers, SLA breaches, and sprint progress\n- Sending Slack messages and looking up users\n- Searching WhatsApp messages and conversations\n- Checking Google Calendar events and scheduling\n- Reading Gmail inbox and drafting emails\n- Managing Google Tasks\n- Creating Mini-Apps (schedulers, forms, polls, dashboards)\n- Onboarding and configuration help\n\nCRITICAL: Tool Usage Guidelines\n\n1. **Simple greetings and conversations DO NOT require tools**\n   - For "hi", "hello", "how are you", "thanks" - just respond naturally with NO tool calls\n\n2. **Only use discover_tools when you ACTUALLY need to find a specific tool**\n   - NOT for greetings or casual conversation\n   - NEVER call discover_tools more than once per response\n\n3. **Never repeat the same tool call multiple times in one response**\n\nReady to help!',
        tools: {
          write: false,
          edit: false,
          bash: false,
          Bash: false,
          discover_tools: true,
          config_confirm_action: true,
          config_list_pending: true,
          config_cancel_action: true,
          config_set_permission: true,
          config_get_permission: true,
          config_list_permissions: true,
          config_set_prompt: true,
          config_get_prompt: true,
          config_list_prompts: true,
          config_set_secret: true,
          config_list_secrets: true,
          config_delete_secret: true,
          config_update_agent: true,
          config_get_agent: true,
          config_list_agents: true,
          config_create_schedule: true,
          config_update_schedule: true,
          config_delete_schedule: true,
          config_list_schedules: true,
        },
      },
      communicator: {
        mode: 'subagent',
        description: 'Slack/WhatsApp messaging with proper formatting',
        prompt:
          'You are a messaging specialist. Format messages appropriately for the target platform.\n\nFor Slack: Use mrkdwn (bold with *single asterisks*, italic with _underscores_, code with backticks).\nFor WhatsApp: Use simple text with emojis where appropriate.\n\nKeep messages clear, concise, and well-formatted.',
      },
      scheduler: {
        mode: 'subagent',
        description: 'Calendar management, reminders, time-based tasks',
        prompt:
          'You are a scheduling assistant. Help users manage calendars, set reminders, and schedule messages.\n\nFocus on:\n- Understanding time zones (default: Asia/Jerusalem)\n- Parsing natural language dates and times\n- Creating recurring schedules\n- Setting appropriate reminders',
      },
      explorer: {
        mode: 'subagent',
        description: 'Fast codebase exploration, documentation lookup',
        prompt:
          'You are a codebase explorer. Help users understand project structure, find code, and lookup documentation.',
        tools: {
          write: false,
          edit: false,
          read: true,
          glob: true,
          grep: true,
          discover_tools: true,
        },
      },
    },
  };

  try {
    // Ensure directory exists
    fs.mkdirSync(orientHome, { recursive: true });
    fs.writeFileSync(configPath, JSON.stringify(config, null, 2) + '\n');
    logger.info('Generated opencode.json', { path: configPath });
  } catch (error) {
    logger.warn('Failed to generate opencode.json', { error: String(error) });
  }
}

async function main(): Promise<void> {
  const op = logger.startOperation('startup');

  logger.info('Starting Dashboard...');

  // Ensure OpenCode config exists for PM2/npm-install mode
  ensureOpenCodeConfig();

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
