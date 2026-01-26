/**
 * SQLite Secrets Schema
 *
 * Encrypted secrets storage with audit logging.
 */

import { sqliteTable, text, integer, index } from 'drizzle-orm/sqlite-core';

export const secrets = sqliteTable(
  'secrets',
  {
    key: text('key').primaryKey(),
    encryptedValue: text('encrypted_value').notNull(),
    iv: text('iv').notNull(),
    authTag: text('auth_tag').notNull(),
    category: text('category'),
    description: text('description'),
    createdAt: integer('created_at', { mode: 'timestamp' }).$defaultFn(() => new Date()),
    updatedAt: integer('updated_at', { mode: 'timestamp' }).$defaultFn(() => new Date()),
  },
  (table) => [index('idx_secrets_category').on(table.category)]
);

export const secretsAuditLog = sqliteTable(
  'secrets_audit_log',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    key: text('key').notNull(),
    action: text('action').notNull(),
    changedBy: text('changed_by'),
    changedAt: integer('changed_at', { mode: 'timestamp' }).$defaultFn(() => new Date()),
  },
  (table) => [
    index('idx_secrets_audit_key').on(table.key),
    index('idx_secrets_audit_time').on(table.changedAt),
  ]
);
