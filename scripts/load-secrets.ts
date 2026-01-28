#!/usr/bin/env tsx
/**
 * Load Secrets from Database
 *
 * This script loads encrypted secrets from the SQLite database and outputs them
 * in a format that can be sourced by shell scripts to set environment variables.
 *
 * Usage:
 *   eval "$(npx tsx scripts/load-secrets.ts)"
 *
 * Or for specific categories:
 *   eval "$(npx tsx scripts/load-secrets.ts --category slack)"
 *
 * Set SQLITE_DATABASE environment variable to specify the database location.
 * Defaults to the installed database at ~/.orient/data/sqlite/orient.db
 */

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
  }
  // If no database found, let the service handle the error
}

async function loadSecrets() {
  const category = process.argv.includes('--category')
    ? process.argv[process.argv.indexOf('--category') + 1]
    : null;

  const secretsService = createSecretsService();

  const secrets = category
    ? await secretsService.getSecretsByCategory(category)
    : await secretsService.getAllSecrets();

  // Output as shell export statements (only export lines - no comments or logs)
  for (const [key, value] of Object.entries(secrets)) {
    // Escape single quotes in the value for shell safety
    const escapedValue = value.replace(/'/g, "'\\''");
    console.log(`export ${key}='${escapedValue}'`);
  }
}

loadSecrets().catch((err) => {
  console.error('# Error loading secrets:', err.message);
  process.exit(1);
});
