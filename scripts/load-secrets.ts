#!/usr/bin/env tsx
/**
 * Load Secrets from Database
 *
 * This script loads encrypted secrets from the database and outputs them
 * in a format that can be sourced by shell scripts to set environment variables.
 *
 * Usage:
 *   eval "$(npx tsx scripts/load-secrets.ts)"
 *
 * Or for specific categories:
 *   eval "$(npx tsx scripts/load-secrets.ts --category slack)"
 */

import pg from 'pg';
import { decryptSecret } from '@orient/core';

const { Pool } = pg;

async function loadSecrets() {
  const dbUrl =
    process.env.DATABASE_URL || 'postgresql://aibot:aibot123@localhost:5432/whatsapp_bot_0';

  const category = process.argv.includes('--category')
    ? process.argv[process.argv.indexOf('--category') + 1]
    : null;

  const pool = new Pool({
    connectionString: dbUrl,
    max: 1,
  });

  try {
    const query = category
      ? {
          text: 'SELECT key, encrypted_value, iv, auth_tag FROM secrets WHERE category = $1',
          values: [category],
        }
      : {
          text: 'SELECT key, encrypted_value, iv, auth_tag FROM secrets',
          values: [],
        };

    const result = await pool.query(query.text, query.values);

    // Output as shell export statements (only export lines - no comments or logs)
    for (const row of result.rows) {
      try {
        const value = decryptSecret(row.encrypted_value, row.iv, row.auth_tag);
        // Escape single quotes in the value for shell safety
        const escapedValue = value.replace(/'/g, "'\\''");
        console.log(`export ${row.key}='${escapedValue}'`);
      } catch (err) {
        // Output errors to stderr so they don't pollute the export output
        console.error(`Failed to decrypt ${row.key}: ${err}`);
      }
    }
  } finally {
    await pool.end();
  }
}

loadSecrets().catch((err) => {
  console.error('# Error loading secrets:', err.message);
  process.exit(1);
});
