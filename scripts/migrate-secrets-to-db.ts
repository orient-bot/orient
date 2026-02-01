#!/usr/bin/env npx tsx
/**
 * Migrate .env secrets into the database.
 *
 * Usage: npx tsx scripts/migrate-secrets-to-db.ts
 */

import fs from 'fs';
import path from 'path';
import { createSecretsService } from '@orient-bot/database-services';

const SENSITIVE_KEYS = [
  // Infrastructure
  'POSTGRES_PASSWORD',
  'MINIO_ROOT_PASSWORD',
  'DASHBOARD_JWT_SECRET',
  'ORIENT_MASTER_KEY',
  // Slack
  'SLACK_BOT_TOKEN',
  'SLACK_SIGNING_SECRET',
  'SLACK_APP_TOKEN',
  'SLACK_USER_TOKEN',
  // AI Providers
  'GEMINI_API_KEY',
  'ANTHROPIC_API_KEY',
  'OPENAI_API_KEY',
  // External Services
  'GITHUB_TOKEN',
  'VERCEL_TOKEN',
  'GOOGLE_OAUTH_CLIENT_SECRET',
];

function findProjectRoot(): string {
  let currentDir = process.cwd();
  while (currentDir !== path.dirname(currentDir)) {
    if (fs.existsSync(path.join(currentDir, 'pnpm-workspace.yaml'))) {
      return currentDir;
    }
    currentDir = path.dirname(currentDir);
  }
  return process.cwd();
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

function loadEnvFile(): Record<string, string> {
  if (!fs.existsSync(ENV_PATH)) {
    throw new Error(`.env file not found at ${ENV_PATH}`);
  }
  return parseEnv(fs.readFileSync(ENV_PATH, 'utf-8'));
}

async function main(): Promise<void> {
  if (!process.env.ORIENT_MASTER_KEY) {
    throw new Error('ORIENT_MASTER_KEY is required to encrypt secrets.');
  }

  const env = loadEnvFile();
  const secretsService = createSecretsService();

  let migrated = 0;
  for (const key of SENSITIVE_KEYS) {
    const value = env[key];
    if (!value) continue;
    await secretsService.setSecret(key, value, { category: 'migration' });
    migrated += 1;
  }

  console.log(`Migrated ${migrated} secrets to database.`);
}

main().catch((error) => {
  console.error('Migration failed:', error);
  process.exit(1);
});
