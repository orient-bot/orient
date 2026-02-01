/**
 * Secrets Service
 *
 * Stores encrypted secrets in SQLite with audit logging using Drizzle ORM.
 */

import { createServiceLogger, decryptSecret, encryptSecret } from '@orient-bot/core';
import { getDatabase, eq, schema } from '@orient-bot/database';
import type { Database } from '@orient-bot/database';

const logger = createServiceLogger('secrets-service');

export type SecretMetadata = {
  key: string;
  category: string | null;
  description: string | null;
  createdAt: Date | null;
  updatedAt: Date | null;
};

export class SecretsService {
  private _db: Database | null = null;

  private get db(): Database {
    if (!this._db) {
      this._db = getDatabase();
    }
    return this._db;
  }

  async getSecret(key: string): Promise<string | null> {
    const result = await this.db
      .select({
        encryptedValue: schema.secrets.encryptedValue,
        iv: schema.secrets.iv,
        authTag: schema.secrets.authTag,
      })
      .from(schema.secrets)
      .where(eq(schema.secrets.key, key))
      .limit(1);

    if (result.length === 0) return null;
    const { encryptedValue, iv, authTag } = result[0];
    return decryptSecret(encryptedValue, iv, authTag);
  }

  async setSecret(
    key: string,
    value: string,
    options: { category?: string; description?: string; changedBy?: string } = {}
  ): Promise<void> {
    const { encrypted, iv, authTag } = encryptSecret(value);

    // Upsert the secret
    await this.db
      .insert(schema.secrets)
      .values({
        key,
        encryptedValue: encrypted,
        iv,
        authTag,
        category: options.category || null,
        description: options.description || null,
        updatedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: schema.secrets.key,
        set: {
          encryptedValue: encrypted,
          iv,
          authTag,
          category: options.category || undefined,
          description: options.description || undefined,
          updatedAt: new Date(),
        },
      });

    // Audit log
    await this.db.insert(schema.secretsAuditLog).values({
      key,
      action: 'updated',
      changedBy: options.changedBy || null,
      changedAt: new Date(),
    });
  }

  async deleteSecret(key: string, changedBy?: string): Promise<void> {
    await this.db.delete(schema.secrets).where(eq(schema.secrets.key, key));

    await this.db.insert(schema.secretsAuditLog).values({
      key,
      action: 'deleted',
      changedBy: changedBy || null,
      changedAt: new Date(),
    });
  }

  async listSecrets(): Promise<SecretMetadata[]> {
    const result = await this.db
      .select({
        key: schema.secrets.key,
        category: schema.secrets.category,
        description: schema.secrets.description,
        createdAt: schema.secrets.createdAt,
        updatedAt: schema.secrets.updatedAt,
      })
      .from(schema.secrets)
      .orderBy(schema.secrets.key);

    return result.map((row) => ({
      key: row.key,
      category: row.category,
      description: row.description,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    }));
  }

  async getSecretsByCategory(category: string): Promise<Record<string, string>> {
    const result = await this.db
      .select({
        key: schema.secrets.key,
        encryptedValue: schema.secrets.encryptedValue,
        iv: schema.secrets.iv,
        authTag: schema.secrets.authTag,
      })
      .from(schema.secrets)
      .where(eq(schema.secrets.category, category));

    const secrets: Record<string, string> = {};
    for (const row of result) {
      secrets[row.key] = decryptSecret(row.encryptedValue, row.iv, row.authTag);
    }
    return secrets;
  }

  async getAllSecrets(): Promise<Record<string, string>> {
    const result = await this.db
      .select({
        key: schema.secrets.key,
        encryptedValue: schema.secrets.encryptedValue,
        iv: schema.secrets.iv,
        authTag: schema.secrets.authTag,
      })
      .from(schema.secrets);

    const secrets: Record<string, string> = {};
    for (const row of result) {
      secrets[row.key] = decryptSecret(row.encryptedValue, row.iv, row.authTag);
    }
    return secrets;
  }
}

export function createSecretsService(): SecretsService {
  return new SecretsService();
}
