#!/usr/bin/env npx tsx
/**
 * Setup OpenCode Server Password
 *
 * Generates a secure random password for the OpenCode server and stores it
 * in the secrets database. This password is required to secure the OpenCode
 * HTTP API.
 *
 * Usage: npx tsx scripts/setup-opencode-password.ts [--regenerate] [--show]
 *
 * Set DATABASE_URL environment variable to specify the database location.
 * Defaults to the installed database at ~/.orient/data/sqlite/orient.db
 */

import crypto from 'crypto';
import { homedir } from 'os';
import { join } from 'path';
import { existsSync } from 'fs';
import { createSecretsService } from '@orientbot/database-services';

// Set default SQLITE_DATABASE if not specified
if (!process.env.SQLITE_DATABASE) {
  const orientHome = process.env.ORIENT_HOME || join(homedir(), '.orient');
  const sqlitePath = join(orientHome, 'data', 'sqlite', 'orient.db');

  // Also check local dev database
  const localDbPath = './data/orient.db';

  if (existsSync(sqlitePath)) {
    process.env.SQLITE_DATABASE = sqlitePath;
  } else if (existsSync(localDbPath)) {
    process.env.SQLITE_DATABASE = localDbPath;
  } else {
    console.error('No database found. Run installation first or set SQLITE_DATABASE.');
    process.exit(1);
  }
}

const OPENCODE_PASSWORD_KEY = 'OPENCODE_SERVER_PASSWORD';

async function main() {
  const args = process.argv.slice(2);
  const regenerate = args.includes('--regenerate');
  const show = args.includes('--show');

  const secretsService = createSecretsService();

  // Check if password already exists
  const existingPassword = await secretsService.getSecret(OPENCODE_PASSWORD_KEY);

  if (show) {
    if (existingPassword) {
      console.log(existingPassword);
    } else {
      console.error('No OpenCode password found. Run without --show to generate one.');
      process.exit(1);
    }
    return;
  }

  if (existingPassword && !regenerate) {
    console.log('OpenCode password already configured.');
    console.log('Use --regenerate to create a new password.');
    console.log('Use --show to display the current password.');
    return;
  }

  // Generate a secure random password (32 bytes = 256 bits, hex encoded = 64 chars)
  const password = crypto.randomBytes(32).toString('hex');

  await secretsService.setSecret(OPENCODE_PASSWORD_KEY, password, {
    category: 'system',
    description: 'Password for securing the OpenCode HTTP server',
    changedBy: 'setup-opencode-password',
  });

  console.log('OpenCode server password generated and stored securely.');
  console.log(`Key: ${OPENCODE_PASSWORD_KEY}`);

  if (regenerate) {
    console.log('Note: You must restart Orient services for the new password to take effect.');
  }
}

main().catch((error) => {
  console.error('Failed to setup OpenCode password:', error);
  process.exit(1);
});
