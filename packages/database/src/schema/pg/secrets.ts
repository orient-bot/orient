/**
 * PostgreSQL Secrets Schema
 *
 * Encrypted secrets storage with audit logging.
 */

import { pgTable, serial, text, timestamp, index } from 'drizzle-orm/pg-core';

export const secrets = pgTable(
  'secrets',
  {
    key: text('key').primaryKey(),
    encryptedValue: text('encrypted_value').notNull(),
    iv: text('iv').notNull(),
    authTag: text('auth_tag').notNull(),
    category: text('category'),
    description: text('description'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
  },
  (table) => [index('idx_secrets_category').on(table.category)]
);

export const secretsAuditLog = pgTable(
  'secrets_audit_log',
  {
    id: serial('id').primaryKey(),
    key: text('key').notNull(),
    action: text('action').notNull(),
    changedBy: text('changed_by'),
    changedAt: timestamp('changed_at', { withTimezone: true }).defaultNow(),
  },
  (table) => [
    index('idx_secrets_audit_key').on(table.key),
    index('idx_secrets_audit_time').on(table.changedAt),
  ]
);
