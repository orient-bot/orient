/**
 * Secrets Service
 *
 * Stores encrypted secrets in PostgreSQL with audit logging.
 */

import pg from 'pg';
import { createServiceLogger, decryptSecret, encryptSecret } from '@orient/core';

const { Pool } = pg;
const logger = createServiceLogger('secrets-service');

export type SecretMetadata = {
  key: string;
  category: string | null;
  description: string | null;
  createdAt: string;
  updatedAt: string;
};

export class SecretsService {
  private pool: pg.Pool;

  constructor(connectionString?: string) {
    const dbUrl =
      connectionString ||
      process.env.DATABASE_URL ||
      'postgresql://aibot:aibot123@localhost:5432/whatsapp_bot_0';

    this.pool = new Pool({
      connectionString: dbUrl,
      max: 10,
      idleTimeoutMillis: 30000,
    });
  }

  async getSecret(key: string): Promise<string | null> {
    const result = await this.pool.query(
      'SELECT encrypted_value, iv, auth_tag FROM secrets WHERE key = $1',
      [key]
    );

    if (result.rows.length === 0) return null;
    const { encrypted_value, iv, auth_tag } = result.rows[0];
    return decryptSecret(encrypted_value, iv, auth_tag);
  }

  async setSecret(
    key: string,
    value: string,
    options: { category?: string; description?: string; changedBy?: string } = {}
  ): Promise<void> {
    const { encrypted, iv, authTag } = encryptSecret(value);
    await this.pool.query(
      `INSERT INTO secrets (key, encrypted_value, iv, auth_tag, category, description, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, NOW())
       ON CONFLICT (key)
       DO UPDATE SET
         encrypted_value = EXCLUDED.encrypted_value,
         iv = EXCLUDED.iv,
         auth_tag = EXCLUDED.auth_tag,
         category = COALESCE(EXCLUDED.category, secrets.category),
         description = COALESCE(EXCLUDED.description, secrets.description),
         updated_at = NOW()`,
      [key, encrypted, iv, authTag, options.category || null, options.description || null]
    );

    await this.pool.query(
      `INSERT INTO secrets_audit_log (key, action, changed_by)
       VALUES ($1, $2, $3)`,
      [key, 'updated', options.changedBy || null]
    );
  }

  async deleteSecret(key: string, changedBy?: string): Promise<void> {
    await this.pool.query('DELETE FROM secrets WHERE key = $1', [key]);
    await this.pool.query(
      `INSERT INTO secrets_audit_log (key, action, changed_by)
       VALUES ($1, $2, $3)`,
      [key, 'deleted', changedBy || null]
    );
  }

  async listSecrets(): Promise<SecretMetadata[]> {
    const result = await this.pool.query(
      `SELECT key, category, description, created_at, updated_at
       FROM secrets
       ORDER BY key`
    );

    return result.rows.map((row) => ({
      key: row.key,
      category: row.category,
      description: row.description,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    }));
  }

  async getSecretsByCategory(category: string): Promise<Record<string, string>> {
    const result = await this.pool.query(
      `SELECT key, encrypted_value, iv, auth_tag
       FROM secrets
       WHERE category = $1`,
      [category]
    );

    const secrets: Record<string, string> = {};
    for (const row of result.rows) {
      secrets[row.key] = decryptSecret(row.encrypted_value, row.iv, row.auth_tag);
    }
    return secrets;
  }

  async getAllSecrets(): Promise<Record<string, string>> {
    const result = await this.pool.query(
      `SELECT key, encrypted_value, iv, auth_tag
       FROM secrets`
    );

    const secrets: Record<string, string> = {};
    for (const row of result.rows) {
      secrets[row.key] = decryptSecret(row.encrypted_value, row.iv, row.auth_tag);
    }
    return secrets;
  }
}

export function createSecretsService(connectionString?: string): SecretsService {
  return new SecretsService(connectionString);
}
