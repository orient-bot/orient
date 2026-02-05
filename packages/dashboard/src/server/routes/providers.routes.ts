/**
 * Providers Routes
 *
 * API endpoints for configuring AI provider credentials and defaults.
 */

import { Router, Request, Response } from 'express';
import { spawn, execSync } from 'child_process';
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { getParam } from './paramUtils.js';
import { createServiceLogger, invalidateConfigCache, setSecretOverrides } from '@orient-bot/core';
import { createSecretsService } from '@orient-bot/database-services';

const logger = createServiceLogger('providers-routes');

type ProviderId = 'openai' | 'anthropic' | 'google' | 'opencode_zen';
type ProviderDefaults = {
  transcription: ProviderId;
  vision: ProviderId;
  imageGeneration: ProviderId;
  agentChat: ProviderId;
};

const PROVIDER_SECRETS: Record<ProviderId, string> = {
  openai: 'OPENAI_API_KEY',
  anthropic: 'ANTHROPIC_API_KEY',
  google: 'GOOGLE_GEMINI_API_KEY',
  opencode_zen: 'OPENCODE_ZEN_API_KEY',
};

const PROVIDER_DESCRIPTIONS: Record<ProviderId, string> = {
  openai: 'OpenAI API key for transcription, vision, and image generation',
  anthropic: 'Anthropic API key for vision models',
  google: 'Google Gemini API key for image generation',
  opencode_zen: 'OpenCode Zen API key for agent chat',
};

const DEFAULTS_SECRET_KEY = 'AI_PROVIDER_DEFAULTS';
const DEFAULTS_FALLBACK: ProviderDefaults = {
  transcription: 'openai',
  vision: 'anthropic',
  imageGeneration: 'openai',
  agentChat: 'opencode_zen',
};

const VALID_DEFAULTS: Record<keyof ProviderDefaults, ProviderId[]> = {
  transcription: ['openai'],
  vision: ['anthropic', 'openai'],
  imageGeneration: ['openai', 'google'],
  agentChat: ['opencode_zen'],
};

/**
 * Write a key-value pair to ~/.orient/.env so PM2-managed processes can read it.
 * Creates the file if it doesn't exist. Updates existing keys in-place.
 */
function writeToOrientEnv(key: string, value: string): void {
  const orientHome = process.env.ORIENT_HOME || join(process.env.HOME || '', '.orient');
  const envPath = join(orientHome, '.env');

  try {
    mkdirSync(orientHome, { recursive: true });
    const existing = existsSync(envPath) ? readFileSync(envPath, 'utf-8') : '';
    const lines = existing.split(/\r?\n/);

    // Escape value if it contains spaces or special chars
    const formatted = /[\s#=]/.test(value) ? `"${value.replace(/"/g, '\\"')}"` : value;

    let found = false;
    const updated = lines.map((line) => {
      const match = line.match(/^\s*([A-Z0-9_]+)\s*=/);
      if (match && match[1] === key) {
        found = true;
        return `${key}=${formatted}`;
      }
      return line;
    });

    if (!found) {
      if (updated.length > 0 && updated[updated.length - 1].trim() !== '') {
        updated.push('');
      }
      updated.push(`${key}=${formatted}`);
    }

    writeFileSync(envPath, updated.join('\n'));
    logger.info('Wrote API key to .env', { key, envPath });
  } catch (error) {
    logger.warn('Failed to write API key to .env', { key, error: String(error) });
  }
}

function isProviderId(value: string): value is ProviderId {
  return (
    value === 'openai' || value === 'anthropic' || value === 'google' || value === 'opencode_zen'
  );
}

function normalizeDefaults(input?: Partial<ProviderDefaults>): ProviderDefaults {
  return {
    transcription: VALID_DEFAULTS.transcription.includes(input?.transcription as ProviderId)
      ? (input?.transcription as ProviderId)
      : DEFAULTS_FALLBACK.transcription,
    vision: VALID_DEFAULTS.vision.includes(input?.vision as ProviderId)
      ? (input?.vision as ProviderId)
      : DEFAULTS_FALLBACK.vision,
    imageGeneration: VALID_DEFAULTS.imageGeneration.includes(input?.imageGeneration as ProviderId)
      ? (input?.imageGeneration as ProviderId)
      : DEFAULTS_FALLBACK.imageGeneration,
    agentChat: VALID_DEFAULTS.agentChat.includes(input?.agentChat as ProviderId)
      ? (input?.agentChat as ProviderId)
      : DEFAULTS_FALLBACK.agentChat,
  };
}

export function createProvidersRoutes(
  requireAuth: (req: Request, res: Response, next: () => void) => void
): Router {
  const router = Router();
  const secretsService = createSecretsService();

  router.get('/', requireAuth, async (_req: Request, res: Response) => {
    try {
      const secrets = await secretsService.listSecrets();
      const providers = (Object.keys(PROVIDER_SECRETS) as ProviderId[]).map((providerId) => {
        const secretKey = PROVIDER_SECRETS[providerId];
        const secret = secrets.find((item) => item.key === secretKey);
        return {
          id: providerId,
          name:
            providerId === 'openai'
              ? 'OpenAI'
              : providerId === 'anthropic'
                ? 'Anthropic'
                : providerId === 'google'
                  ? 'Google Gemini'
                  : 'OpenCode Zen',
          configured: Boolean(secret),
          updatedAt: secret?.updatedAt ?? null,
        };
      });
      res.json({ providers });
    } catch (error) {
      logger.error('Failed to list providers', { error: String(error) });
      res.status(500).json({ error: 'Failed to list providers' });
    }
  });

  router.put('/:provider/key', requireAuth, async (req: Request, res: Response) => {
    try {
      const provider = getParam(req.params.provider);
      const { value, changedBy } = req.body || {};

      if (!isProviderId(provider)) {
        return res.status(400).json({ error: 'Unknown provider' });
      }
      if (!value || typeof value !== 'string') {
        return res.status(400).json({ error: 'API key value is required' });
      }

      const secretKey = PROVIDER_SECRETS[provider];
      await secretsService.setSecret(secretKey, value, {
        category: 'ai-providers',
        description: PROVIDER_DESCRIPTIONS[provider],
        changedBy: typeof changedBy === 'string' ? changedBy : undefined,
      });

      setSecretOverrides({ [secretKey]: value });
      invalidateConfigCache();

      // Also write to ~/.orient/.env so PM2-managed processes (OpenCode) can read it
      writeToOrientEnv(secretKey, value);

      res.json({ success: true });
    } catch (error) {
      logger.error('Failed to set provider key', { error: String(error) });
      res.status(500).json({ error: 'Failed to set provider key' });
    }
  });

  router.get('/defaults', requireAuth, async (_req: Request, res: Response) => {
    try {
      const defaultsRaw = await secretsService.getSecret(DEFAULTS_SECRET_KEY);
      let parsed: Partial<ProviderDefaults> | undefined;
      if (defaultsRaw) {
        try {
          parsed = JSON.parse(defaultsRaw) as Partial<ProviderDefaults>;
        } catch (parseError) {
          logger.warn('Failed to parse provider defaults', { error: String(parseError) });
        }
      }
      res.json({ defaults: normalizeDefaults(parsed) });
    } catch (error) {
      logger.error('Failed to get provider defaults', { error: String(error) });
      res.status(500).json({ error: 'Failed to get provider defaults' });
    }
  });

  router.put('/defaults', requireAuth, async (req: Request, res: Response) => {
    try {
      const defaults = normalizeDefaults(req.body);
      const payload = JSON.stringify(defaults);

      await secretsService.setSecret(DEFAULTS_SECRET_KEY, payload, {
        category: 'ai-providers',
        description: 'Default providers for AI capabilities',
      });

      setSecretOverrides({ [DEFAULTS_SECRET_KEY]: payload });
      invalidateConfigCache();

      res.json({ success: true });
    } catch (error) {
      logger.error('Failed to set provider defaults', { error: String(error) });
      res.status(500).json({ error: 'Failed to set provider defaults' });
    }
  });

  /**
   * POST /providers/restart-opencode
   * Reload secrets from database and restart OpenCode to pick up new API keys.
   * This allows API keys configured in the Dashboard to take effect without
   * restarting the entire dev environment.
   */
  router.post('/restart-opencode', requireAuth, async (_req: Request, res: Response) => {
    try {
      // Determine project root and PID directory
      // In dev mode, PROJECT_ROOT is set. In production, use ORIENT_HOME.
      const projectRoot = process.env.PROJECT_ROOT || process.cwd();
      const instanceId = process.env.AI_INSTANCE_ID || '0';
      const pidDir =
        process.env.PID_DIR || join(projectRoot, '.dev-pids', `instance-${instanceId}`);
      const pidFile = join(pidDir, 'opencode.pid');
      const opencodePort = process.env.OPENCODE_PORT || '4099';

      // Check if we're in development mode (PID file exists) or PM2 mode
      if (!existsSync(pidFile)) {
        // No PID file — try PM2 restart instead
        try {
          // First, sync all secrets to .env so PM2 picks them up
          const allSecrets = await secretsService.getAllSecrets();
          for (const [key, value] of Object.entries(allSecrets)) {
            writeToOrientEnv(key, value);
            setSecretOverrides({ [key]: value });
          }
          invalidateConfigCache();

          execSync('pm2 restart orient-opencode --update-env', {
            timeout: 15000,
            stdio: 'pipe',
          });
          logger.info('Restarted OpenCode via PM2');
          return res.json({
            success: true,
            message: 'OpenCode restarted via PM2 with updated secrets',
            mode: 'pm2',
            secretsLoaded: Object.keys(allSecrets).length,
          });
        } catch (pm2Error) {
          logger.warn('PM2 restart failed, OpenCode may not be running via PM2', {
            error: String(pm2Error),
          });
          return res.status(400).json({
            error: 'Could not restart OpenCode',
            message: 'No dev PID file found and PM2 restart failed. Is orient-opencode running?',
          });
        }
      }

      // Read current PID
      const oldPid = readFileSync(pidFile, 'utf8').trim();
      logger.info('Restarting OpenCode', { oldPid, pidFile });

      // Load secrets from database to get the latest API keys
      const allSecrets = await secretsService.getAllSecrets();

      // Build environment with secrets
      const secretEnv: Record<string, string> = {};
      for (const [key, value] of Object.entries(allSecrets)) {
        secretEnv[key] = value;
        // Also update the in-memory overrides so the dashboard sees them
        setSecretOverrides({ [key]: value });
      }
      invalidateConfigCache();

      // Send SIGTERM to the old OpenCode process
      try {
        process.kill(parseInt(oldPid, 10), 'SIGTERM');
        logger.info('Sent SIGTERM to old OpenCode process', { pid: oldPid });
      } catch (killErr) {
        logger.warn('Failed to kill old OpenCode process (may already be dead)', {
          error: String(killErr),
        });
      }

      // Wait a moment for the old process to terminate
      await new Promise((resolve) => setTimeout(resolve, 1000));

      // Find OpenCode binary (same logic as dev.sh)
      let opencodeBin = process.env.OPENCODE_BIN;
      if (!opencodeBin) {
        const os = process.platform === 'darwin' ? 'darwin' : 'linux';
        const arch = process.arch === 'arm64' ? 'arm64' : 'x64';
        const bundledBinary = join(projectRoot, 'vendor', 'opencode', `${os}-${arch}`, 'opencode');
        if (existsSync(bundledBinary)) {
          opencodeBin = bundledBinary;
        } else {
          // Fall back to system opencode
          opencodeBin = 'opencode';
        }
      }

      // Start new OpenCode process with fresh secrets in environment
      const logDir = process.env.LOG_DIR || join(projectRoot, 'logs', `instance-${instanceId}`);
      const logFile = join(logDir, 'opencode-dev.log');

      // Merge current env with secrets (secrets override)
      const opencodeEnv = { ...process.env, ...secretEnv };

      // Check for local config
      const localConfig = join(projectRoot, 'opencode.local.json');
      if (existsSync(localConfig)) {
        opencodeEnv.OPENCODE_CONFIG = localConfig;
      }

      const opencodeProc = spawn(
        opencodeBin,
        ['serve', '--port', opencodePort, '--hostname', '127.0.0.1'],
        {
          cwd: projectRoot,
          env: opencodeEnv,
          detached: true,
          stdio: ['ignore', 'pipe', 'pipe'],
        }
      );

      // Write new PID
      const fs = await import('fs/promises');
      await fs.writeFile(pidFile, String(opencodeProc.pid));

      // Redirect output to log file
      const logStream = (await import('fs')).createWriteStream(logFile, { flags: 'a' });
      opencodeProc.stdout?.pipe(logStream);
      opencodeProc.stderr?.pipe(logStream);

      // Unref so the dashboard doesn't wait for OpenCode
      opencodeProc.unref();

      logger.info('Started new OpenCode process', { pid: opencodeProc.pid, port: opencodePort });

      // Wait for OpenCode to be ready
      const maxAttempts = 30;
      let ready = false;
      for (let i = 0; i < maxAttempts; i++) {
        try {
          const healthCheck = await fetch(`http://localhost:${opencodePort}/global/health`);
          if (healthCheck.ok) {
            ready = true;
            break;
          }
        } catch {
          // Not ready yet
        }
        await new Promise((resolve) => setTimeout(resolve, 1000));
      }

      if (!ready) {
        logger.error('OpenCode failed to become healthy after restart');
        return res.status(500).json({
          error: 'OpenCode restarted but health check failed',
          message: 'Check the logs for details.',
        });
      }

      res.json({
        success: true,
        message: 'OpenCode restarted successfully with updated secrets',
        pid: opencodeProc.pid,
        secretsLoaded: Object.keys(allSecrets).length,
      });
    } catch (error) {
      logger.error('Failed to restart OpenCode', { error: String(error) });
      res.status(500).json({ error: 'Failed to restart OpenCode' });
    }
  });

  return router;
}
