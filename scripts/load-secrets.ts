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
 */

import { createSecretsService } from '@orient/database-services';

async function loadSecrets() {
  const category = process.argv.includes('--category')
    ? process.argv[process.argv.indexOf('--category') + 1]
    : null;

  const secretsService = createSecretsService();

  try {
    const secrets = category
      ? await secretsService.getSecretsByCategory(category)
      : await secretsService.getAllSecrets();

    // Output as shell export statements (only export lines - no comments or logs)
    for (const [key, value] of Object.entries(secrets)) {
      // Escape single quotes in the value for shell safety
      const escapedValue = value.replace(/'/g, "'\\''");
      console.log(`export ${key}='${escapedValue}'`);
    }
  } finally {
    await secretsService.close();
  }
}

loadSecrets().catch((err) => {
  console.error('# Error loading secrets:', err.message);
  process.exit(1);
});
