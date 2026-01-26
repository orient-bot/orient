import fs from 'fs';
import path from 'path';
import { createServiceLogger, invalidateConfigCache, setSecretOverrides } from '@orient/core';
import { createSecretsService, createMessageDatabase } from '@orient/database-services';

const logger = createServiceLogger('setup-wizard');
const secretsService = createSecretsService();
const MIN_JWT_SECRET_LENGTH = 32;

export type SetupField = {
  key: string;
  label: string;
  description?: string;
  placeholder?: string;
  defaultValue?: string;
  type?: 'text' | 'password';
  required: boolean;
};

const REQUIRED_FIELDS: SetupField[] = [
  {
    key: 'POSTGRES_USER',
    label: 'Postgres user',
    description: 'Database user for the workspace metadata store.',
    placeholder: 'orient',
    defaultValue: 'orient',
    required: true,
  },
  {
    key: 'POSTGRES_PASSWORD',
    label: 'Postgres password',
    description: 'Password for the Postgres user.',
    placeholder: 'your-secure-password',
    type: 'password',
    defaultValue: 'your-secure-password',
    required: true,
  },
  {
    key: 'MINIO_ROOT_USER',
    label: 'MinIO access key',
    description: 'Root user for S3-compatible storage (MinIO/S3).',
    placeholder: 'orientadmin',
    defaultValue: 'orientadmin',
    required: true,
  },
  {
    key: 'MINIO_ROOT_PASSWORD',
    label: 'MinIO secret key',
    description: 'Root password for MinIO/S3.',
    placeholder: 'your-secure-password',
    type: 'password',
    defaultValue: 'your-secure-password',
    required: true,
  },
  {
    key: 'DASHBOARD_JWT_SECRET',
    label: 'Workspace JWT secret',
    description: 'Used to sign workspace sessions. Minimum 32 characters.',
    placeholder: '32+ character secret',
    type: 'password',
    required: true,
  },
];

const OPTIONAL_FIELDS: SetupField[] = [
  {
    key: 'WHATSAPP_ADMIN_PHONE',
    label: 'WhatsApp admin phone',
    description:
      'Your WhatsApp phone number with country code (e.g., 972501234567). Set automatically after pairing.',
    placeholder: '972501234567',
    required: false,
  },
  {
    key: 'SLACK_BOT_TOKEN',
    label: 'Slack bot token',
    description: 'Bot User OAuth Token (starts with xoxb-).',
    placeholder: 'xoxb-...',
    type: 'password',
    required: false,
  },
  {
    key: 'SLACK_SIGNING_SECRET',
    label: 'Slack signing secret',
    description: 'Used to verify requests from Slack.',
    placeholder: 'your-signing-secret',
    type: 'password',
    required: false,
  },
  {
    key: 'SLACK_APP_TOKEN',
    label: 'Slack app token',
    description: 'App-level token for Socket Mode (starts with xapp-).',
    placeholder: 'xapp-...',
    type: 'password',
    required: false,
  },
  {
    key: 'SLACK_USER_TOKEN',
    label: 'Slack user token',
    description:
      'User OAuth Token for acting as a user (starts with xoxp-). Enables bot to post on behalf of a user.',
    placeholder: 'xoxp-...',
    type: 'password',
    required: false,
  },
  {
    key: 'GEMINI_API_KEY',
    label: 'Gemini API key',
    description: 'Google Gemini API key for mascot image generation (Nano Banana).',
    placeholder: 'your-gemini-api-key',
    type: 'password',
    required: false,
  },
  {
    key: 'S3_BUCKET',
    label: 'S3 bucket name',
    description: 'Bucket for media and file sync.',
    placeholder: 'orient-data',
    defaultValue: 'orient-data',
    required: false,
  },
  {
    key: 'ORIENT_APP_DOMAIN',
    label: 'Workspace domain',
    description: 'Public domain for the workspace UI.',
    placeholder: 'app.example.com',
    defaultValue: 'app.example.com',
    required: false,
  },
  {
    key: 'ORIENT_CODE_DOMAIN',
    label: 'OpenCode domain',
    description: 'Public domain for OpenCode.',
    placeholder: 'code.example.com',
    defaultValue: 'code.example.com',
    required: false,
  },
];

const SENSITIVE_KEYS = new Set(
  [...REQUIRED_FIELDS, ...OPTIONAL_FIELDS]
    .filter((field) => field.type === 'password')
    .map((field) => field.key)
);

export type SetupStatus = {
  needsSetup: boolean;
  missingRequired: string[];
  missingOptional: string[];
  requiredFields: SetupField[];
  optionalFields: SetupField[];
  setupOnly: boolean;
};

export type SetupApplyResult = SetupStatus & {
  success: boolean;
  needsRestart: boolean;
};

function findProjectRoot(): string {
  let currentDir = process.cwd();
  let nearestPackageRoot: string | null = null;

  while (currentDir !== path.dirname(currentDir)) {
    if (fs.existsSync(path.join(currentDir, 'pnpm-workspace.yaml'))) {
      return currentDir;
    }
    if (!nearestPackageRoot && fs.existsSync(path.join(currentDir, 'package.json'))) {
      nearestPackageRoot = currentDir;
    }
    currentDir = path.dirname(currentDir);
  }

  return nearestPackageRoot || process.cwd();
}

const ENV_PATH = process.env.ORIENT_ENV_PATH || path.resolve(findProjectRoot(), '.env');

function parseEnv(content: string): Record<string, string> {
  const result: Record<string, string> = {};
  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const idx = line.indexOf('=');
    if (idx <= 0) continue;
    const key = line.slice(0, idx).trim();
    let value = line.slice(idx + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    result[key] = value;
  }
  return result;
}

function readEnvFile(): Record<string, string> {
  try {
    if (!fs.existsSync(ENV_PATH)) return {};
    return parseEnv(fs.readFileSync(ENV_PATH, 'utf-8'));
  } catch (error) {
    logger.warn('Failed to read .env file', { error: String(error) });
    return {};
  }
}

async function getEffectiveEnv(): Promise<Record<string, string>> {
  const fileEnv = readEnvFile();
  let secretEnv: Record<string, string> = {};
  try {
    const secrets = await secretsService.listSecrets();
    secretEnv = secrets.reduce<Record<string, string>>((acc, secret) => {
      acc[secret.key] = '********';
      return acc;
    }, {});
  } catch (error) {
    logger.warn('Failed to load secrets from database', { error: String(error) });
  }

  return { ...fileEnv, ...process.env, ...secretEnv } as Record<string, string>;
}

function formatEnvValue(value: string): string {
  const sanitized = value.replace(/\r?\n/g, '');
  if (sanitized === '') return '""';
  if (/[\s#=]/.test(sanitized)) {
    return `"${sanitized.replace(/"/g, '\\"')}"`;
  }
  return sanitized;
}

function upsertEnvFile(values: Record<string, string>): void {
  const existing = fs.existsSync(ENV_PATH) ? fs.readFileSync(ENV_PATH, 'utf-8') : '';
  const lines = existing.split(/\r?\n/);
  const updatedKeys = new Set<string>();

  const updatedLines = lines.map((line) => {
    const match = line.match(/^\s*([A-Z0-9_]+)\s*=/);
    if (!match) return line;
    const key = match[1];
    if (!(key in values)) return line;
    updatedKeys.add(key);
    return `${key}=${formatEnvValue(values[key])}`;
  });

  const newKeys = Object.keys(values).filter((key) => !updatedKeys.has(key));
  if (newKeys.length > 0) {
    if (updatedLines.length > 0 && updatedLines[updatedLines.length - 1].trim() !== '') {
      updatedLines.push('');
    }
    updatedLines.push('# Added by setup wizard');
    for (const key of newKeys) {
      updatedLines.push(`${key}=${formatEnvValue(values[key])}`);
    }
  }

  fs.writeFileSync(ENV_PATH, updatedLines.join('\n'));
}

function getMissing(fields: SetupField[], env: Record<string, string>): string[] {
  return fields.filter((field) => !env[field.key]).map((field) => field.key);
}

export async function getSetupStatus(): Promise<SetupStatus> {
  const env = await getEffectiveEnv();
  const missingRequired = getMissing(REQUIRED_FIELDS, env);
  const missingOptional = getMissing(OPTIONAL_FIELDS, env);
  return {
    needsSetup: missingRequired.length > 0,
    missingRequired,
    missingOptional,
    requiredFields: REQUIRED_FIELDS,
    optionalFields: OPTIONAL_FIELDS,
    setupOnly: process.env.ORIENT_SETUP_ONLY === 'true' && missingRequired.length > 0,
  };
}

export async function applySetup(values: Record<string, string>): Promise<SetupApplyResult> {
  const allowedKeys = new Set([...REQUIRED_FIELDS, ...OPTIONAL_FIELDS].map((field) => field.key));
  const sanitizedValues: Record<string, string> = {};

  for (const [key, value] of Object.entries(values)) {
    if (!allowedKeys.has(key)) {
      throw new Error(`Unknown environment key: ${key}`);
    }
    const trimmed = value.trim();
    if (trimmed) {
      sanitizedValues[key] = trimmed;
    }
  }

  const env = { ...(await getEffectiveEnv()), ...sanitizedValues };
  const missingRequired = getMissing(REQUIRED_FIELDS, env);
  if (missingRequired.length > 0) {
    throw new Error(`Missing required values: ${missingRequired.join(', ')}`);
  }

  const jwtSecret = env.DASHBOARD_JWT_SECRET;
  if (jwtSecret && jwtSecret.length < MIN_JWT_SECRET_LENGTH) {
    throw new Error(
      `DASHBOARD_JWT_SECRET must be at least ${MIN_JWT_SECRET_LENGTH} characters long`
    );
  }

  if (Object.keys(sanitizedValues).length > 0) {
    const envValues: Record<string, string> = {};
    const secretValues: Record<string, string> = {};

    for (const [key, value] of Object.entries(sanitizedValues)) {
      if (SENSITIVE_KEYS.has(key)) {
        secretValues[key] = value;
      } else {
        envValues[key] = value;
      }
    }

    if (Object.keys(envValues).length > 0) {
      upsertEnvFile(envValues);
      for (const [key, value] of Object.entries(envValues)) {
        process.env[key] = value;
      }
    }

    if (Object.keys(secretValues).length > 0) {
      // Before saving secrets, capture existing secret keys
      const existingSecrets = new Set((await secretsService.listSecrets()).map((s) => s.key));

      for (const [key, value] of Object.entries(secretValues)) {
        await secretsService.setSecret(key, value, { category: 'setup' });
        process.env[key] = value;
      }
      setSecretOverrides(secretValues);

      // After secrets saved, check for first-time Slack setup
      await checkAndTriggerSlackOnboarding(existingSecrets, secretValues);
    }
  }

  invalidateConfigCache();
  const status = await getSetupStatus();
  return {
    success: true,
    needsRestart: false,
    ...status,
  };
}

async function checkAndTriggerSlackOnboarding(
  previousSecrets: Set<string>,
  newSecrets: Record<string, string>
): Promise<void> {
  const slackKeys = ['SLACK_BOT_TOKEN', 'SLACK_SIGNING_SECRET', 'SLACK_APP_TOKEN'];

  // Check if ALL three Slack secrets are new (first-time setup)
  const isFirstTimeSetup = slackKeys.every((key) => newSecrets[key] && !previousSecrets.has(key));

  if (!isFirstTimeSetup) return;

  // Check if already onboarded
  const db = createMessageDatabase();
  try {
    await db.initialize();
    const alreadyOnboarded = await db.checkOnboardingCompleted('slack');
    if (alreadyOnboarded) return;

    // Trigger onboarding (non-blocking)
    try {
      const { SlackOnboardingService } = await import('./services/slackOnboardingService.js');
      const service = new SlackOnboardingService({
        botToken: newSecrets.SLACK_BOT_TOKEN,
        signingSecret: newSecrets.SLACK_SIGNING_SECRET,
        appToken: newSecrets.SLACK_APP_TOKEN,
      });

      await service.sendOnboardingDM();
      await db.markOnboardingCompleted('slack');
      logger.info('Slack onboarding DM sent successfully');
    } catch (error) {
      logger.warn('Slack onboarding DM failed, dashboard notification will be shown', {
        error: String(error),
      });
      // Still mark as completed so we don't retry
      await db.markOnboardingCompleted('slack');
    }
  } catch (error) {
    logger.error('Failed to check/trigger Slack onboarding', { error: String(error) });
  }
}
