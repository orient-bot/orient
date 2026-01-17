/**
 * Webhook Database Service
 *
 * PostgreSQL persistence layer for webhook configurations and event history.
 * Manages the webhooks and webhook_events tables.
 */

import pg from 'pg';
import crypto from 'crypto';
import { createServiceLogger } from '@orient/core';
import {
  Webhook,
  WebhookEvent,
  CreateWebhookInput,
  UpdateWebhookInput,
  WebhookStats,
  WebhookEventStatus,
} from './types/webhook.js';

const logger = createServiceLogger('webhook-db');

/**
 * Database configuration
 */
export interface WebhookDatabaseConfig {
  connectionString: string;
}

/**
 * WebhookDatabase - PostgreSQL persistence for webhooks
 */
export class WebhookDatabase {
  private pool: pg.Pool;

  constructor(pool: pg.Pool) {
    this.pool = pool;
    logger.info('Webhook database pool created', {
      connectionString: this.maskConnectionString(pool.options.connectionString || ''),
    });
  }

  private maskConnectionString(connectionString: string): string {
    return connectionString.replace(/:([^:@]+)@/, ':****@');
  }

  /**
   * Initialize database tables
   */
  async initializeTables(): Promise<void> {
    const client = await this.pool.connect();
    try {
      // Create webhooks table
      await client.query(`
        CREATE TABLE IF NOT EXISTS webhooks (
          id SERIAL PRIMARY KEY,
          name TEXT NOT NULL UNIQUE,
          description TEXT,
          
          -- Authentication
          token TEXT NOT NULL,
          signature_header TEXT,
          
          -- Source configuration
          source_type TEXT NOT NULL CHECK (source_type IN ('github', 'calendar', 'jira', 'custom')),
          event_filter TEXT[],
          
          -- Delivery configuration
          provider TEXT NOT NULL CHECK (provider IN ('whatsapp', 'slack')),
          target TEXT NOT NULL,
          message_template TEXT,
          
          -- Status
          enabled BOOLEAN DEFAULT TRUE,
          last_triggered_at TIMESTAMPTZ,
          trigger_count INTEGER DEFAULT 0,
          
          created_at TIMESTAMPTZ DEFAULT NOW(),
          updated_at TIMESTAMPTZ DEFAULT NOW()
        )
      `);

      // Create webhook_events table
      await client.query(`
        CREATE TABLE IF NOT EXISTS webhook_events (
          id SERIAL PRIMARY KEY,
          webhook_id INTEGER REFERENCES webhooks(id) ON DELETE CASCADE,
          received_at TIMESTAMPTZ DEFAULT NOW(),
          event_type TEXT,
          payload JSONB,
          status TEXT CHECK (status IN ('processed', 'filtered', 'failed', 'pending')),
          error TEXT,
          message_sent TEXT,
          processing_time_ms INTEGER
        )
      `);

      // Create indexes
      await client.query(`
        CREATE INDEX IF NOT EXISTS idx_webhook_events_webhook_id ON webhook_events(webhook_id);
        CREATE INDEX IF NOT EXISTS idx_webhook_events_received_at ON webhook_events(received_at);
        CREATE INDEX IF NOT EXISTS idx_webhook_events_status ON webhook_events(status);
        CREATE INDEX IF NOT EXISTS idx_webhooks_name ON webhooks(name);
        CREATE INDEX IF NOT EXISTS idx_webhooks_enabled ON webhooks(enabled);
      `);

      logger.info('Webhook database tables initialized');
    } finally {
      client.release();
    }
  }

  /**
   * Generate a secure random token
   */
  private generateToken(): string {
    return crypto.randomBytes(32).toString('hex');
  }

  /**
   * Map database row to Webhook object
   */
  private rowToWebhook(row: Record<string, unknown>): Webhook {
    return {
      id: row.id as number,
      name: row.name as string,
      description: row.description as string | undefined,
      token: row.token as string,
      signatureHeader: row.signature_header as string | undefined,
      sourceType: row.source_type as Webhook['sourceType'],
      eventFilter: row.event_filter as string[] | undefined,
      provider: row.provider as Webhook['provider'],
      target: row.target as string,
      messageTemplate: row.message_template as string | undefined,
      enabled: row.enabled as boolean,
      lastTriggeredAt: row.last_triggered_at
        ? new Date(row.last_triggered_at as string)
        : undefined,
      triggerCount: row.trigger_count as number,
      createdAt: new Date(row.created_at as string),
      updatedAt: new Date(row.updated_at as string),
    };
  }

  /**
   * Map database row to WebhookEvent object
   */
  private rowToWebhookEvent(row: Record<string, unknown>): WebhookEvent {
    return {
      id: row.id as number,
      webhookId: row.webhook_id as number,
      receivedAt: new Date(row.received_at as string),
      eventType: row.event_type as string | undefined,
      payload: row.payload as Record<string, unknown>,
      status: row.status as WebhookEventStatus,
      error: row.error as string | undefined,
      messageSent: row.message_sent as string | undefined,
      processingTimeMs: row.processing_time_ms as number | undefined,
      webhookName: row.webhook_name as string | undefined,
    };
  }

  // ============================================
  // WEBHOOK CRUD OPERATIONS
  // ============================================

  /**
   * Create a new webhook
   */
  async createWebhook(input: CreateWebhookInput): Promise<Webhook> {
    const token = input.token || this.generateToken();

    const result = await this.pool.query(
      `INSERT INTO webhooks (
        name, description, token, signature_header,
        source_type, event_filter, provider, target,
        message_template, enabled
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      RETURNING *`,
      [
        input.name,
        input.description || null,
        token,
        input.signatureHeader || null,
        input.sourceType,
        input.eventFilter || null,
        input.provider,
        input.target,
        input.messageTemplate || null,
        input.enabled !== false,
      ]
    );

    const webhook = this.rowToWebhook(result.rows[0]);
    logger.info('Created webhook', {
      id: webhook.id,
      name: webhook.name,
      sourceType: webhook.sourceType,
    });
    return webhook;
  }

  /**
   * Get a webhook by ID
   */
  async getWebhook(id: number): Promise<Webhook | null> {
    const result = await this.pool.query('SELECT * FROM webhooks WHERE id = $1', [id]);

    if (result.rows.length === 0) {
      return null;
    }

    return this.rowToWebhook(result.rows[0]);
  }

  /**
   * Get a webhook by name
   */
  async getWebhookByName(name: string): Promise<Webhook | null> {
    const result = await this.pool.query('SELECT * FROM webhooks WHERE name = $1', [name]);

    if (result.rows.length === 0) {
      return null;
    }

    return this.rowToWebhook(result.rows[0]);
  }

  /**
   * Get all webhooks
   */
  async getAllWebhooks(): Promise<Webhook[]> {
    const result = await this.pool.query('SELECT * FROM webhooks ORDER BY created_at DESC');

    return result.rows.map((row) => this.rowToWebhook(row));
  }

  /**
   * Get enabled webhooks by source type
   */
  async getEnabledWebhooksBySource(sourceType: string): Promise<Webhook[]> {
    const result = await this.pool.query(
      'SELECT * FROM webhooks WHERE source_type = $1 AND enabled = TRUE',
      [sourceType]
    );

    return result.rows.map((row) => this.rowToWebhook(row));
  }

  /**
   * Update a webhook
   */
  async updateWebhook(id: number, input: UpdateWebhookInput): Promise<Webhook | null> {
    const updates: string[] = [];
    const values: unknown[] = [];
    let paramIndex = 1;

    if (input.name !== undefined) {
      updates.push(`name = $${paramIndex++}`);
      values.push(input.name);
    }
    if (input.description !== undefined) {
      updates.push(`description = $${paramIndex++}`);
      values.push(input.description);
    }
    if (input.token !== undefined) {
      updates.push(`token = $${paramIndex++}`);
      values.push(input.token);
    }
    if (input.signatureHeader !== undefined) {
      updates.push(`signature_header = $${paramIndex++}`);
      values.push(input.signatureHeader);
    }
    if (input.sourceType !== undefined) {
      updates.push(`source_type = $${paramIndex++}`);
      values.push(input.sourceType);
    }
    if (input.eventFilter !== undefined) {
      updates.push(`event_filter = $${paramIndex++}`);
      values.push(input.eventFilter);
    }
    if (input.provider !== undefined) {
      updates.push(`provider = $${paramIndex++}`);
      values.push(input.provider);
    }
    if (input.target !== undefined) {
      updates.push(`target = $${paramIndex++}`);
      values.push(input.target);
    }
    if (input.messageTemplate !== undefined) {
      updates.push(`message_template = $${paramIndex++}`);
      values.push(input.messageTemplate);
    }
    if (input.enabled !== undefined) {
      updates.push(`enabled = $${paramIndex++}`);
      values.push(input.enabled);
    }

    if (updates.length === 0) {
      return this.getWebhook(id);
    }

    updates.push(`updated_at = NOW()`);
    values.push(id);

    const result = await this.pool.query(
      `UPDATE webhooks SET ${updates.join(', ')} WHERE id = $${paramIndex} RETURNING *`,
      values
    );

    if (result.rows.length === 0) {
      return null;
    }

    const webhook = this.rowToWebhook(result.rows[0]);
    logger.info('Updated webhook', { id: webhook.id, name: webhook.name });
    return webhook;
  }

  /**
   * Delete a webhook
   */
  async deleteWebhook(id: number): Promise<boolean> {
    const result = await this.pool.query('DELETE FROM webhooks WHERE id = $1', [id]);

    const deleted = (result.rowCount ?? 0) > 0;
    if (deleted) {
      logger.info('Deleted webhook', { id });
    }
    return deleted;
  }

  /**
   * Toggle webhook enabled status
   */
  async toggleWebhook(id: number, enabled: boolean): Promise<Webhook | null> {
    return this.updateWebhook(id, { enabled });
  }

  /**
   * Regenerate webhook token
   */
  async regenerateToken(id: number): Promise<Webhook | null> {
    const newToken = this.generateToken();
    return this.updateWebhook(id, { token: newToken });
  }

  // ============================================
  // WEBHOOK EVENT OPERATIONS
  // ============================================

  /**
   * Record a new webhook event
   */
  async recordEvent(
    webhookId: number,
    eventType: string | undefined,
    payload: Record<string, unknown>,
    status: WebhookEventStatus = 'pending'
  ): Promise<WebhookEvent> {
    const result = await this.pool.query(
      `INSERT INTO webhook_events (webhook_id, event_type, payload, status)
       VALUES ($1, $2, $3, $4)
       RETURNING *`,
      [webhookId, eventType, JSON.stringify(payload), status]
    );

    return this.rowToWebhookEvent(result.rows[0]);
  }

  /**
   * Update event after processing
   */
  async updateEvent(
    eventId: number,
    status: WebhookEventStatus,
    options: {
      error?: string;
      messageSent?: string;
      processingTimeMs?: number;
    } = {}
  ): Promise<void> {
    await this.pool.query(
      `UPDATE webhook_events 
       SET status = $1, error = $2, message_sent = $3, processing_time_ms = $4
       WHERE id = $5`,
      [
        status,
        options.error || null,
        options.messageSent || null,
        options.processingTimeMs || null,
        eventId,
      ]
    );
  }

  /**
   * Update webhook trigger stats
   */
  async recordTrigger(webhookId: number): Promise<void> {
    await this.pool.query(
      `UPDATE webhooks 
       SET last_triggered_at = NOW(), trigger_count = trigger_count + 1, updated_at = NOW()
       WHERE id = $1`,
      [webhookId]
    );
  }

  /**
   * Get events for a specific webhook
   */
  async getWebhookEvents(webhookId: number, limit: number = 50): Promise<WebhookEvent[]> {
    const result = await this.pool.query(
      `SELECT we.*, w.name as webhook_name
       FROM webhook_events we
       JOIN webhooks w ON we.webhook_id = w.id
       WHERE we.webhook_id = $1
       ORDER BY we.received_at DESC
       LIMIT $2`,
      [webhookId, limit]
    );

    return result.rows.map((row) => this.rowToWebhookEvent(row));
  }

  /**
   * Get recent events across all webhooks
   */
  async getRecentEvents(limit: number = 50): Promise<WebhookEvent[]> {
    const result = await this.pool.query(
      `SELECT we.*, w.name as webhook_name
       FROM webhook_events we
       JOIN webhooks w ON we.webhook_id = w.id
       ORDER BY we.received_at DESC
       LIMIT $1`,
      [limit]
    );

    return result.rows.map((row) => this.rowToWebhookEvent(row));
  }

  /**
   * Clean up old events (keep last N days)
   */
  async cleanupOldEvents(retentionDays: number = 30): Promise<number> {
    const result = await this.pool.query(
      `DELETE FROM webhook_events 
       WHERE received_at < NOW() - INTERVAL '${retentionDays} days'`
    );

    const deleted = result.rowCount ?? 0;
    if (deleted > 0) {
      logger.info('Cleaned up old webhook events', { deleted, retentionDays });
    }
    return deleted;
  }

  // ============================================
  // STATISTICS
  // ============================================

  /**
   * Get webhook statistics
   */
  async getStats(): Promise<WebhookStats> {
    const client = await this.pool.connect();
    try {
      // Get webhook counts
      const webhookStats = await client.query(`
        SELECT 
          COUNT(*) as total,
          COUNT(*) FILTER (WHERE enabled = TRUE) as enabled,
          COUNT(*) FILTER (WHERE source_type = 'github') as github,
          COUNT(*) FILTER (WHERE source_type = 'calendar') as calendar,
          COUNT(*) FILTER (WHERE source_type = 'jira') as jira,
          COUNT(*) FILTER (WHERE source_type = 'custom') as custom,
          COUNT(*) FILTER (WHERE provider = 'whatsapp') as whatsapp,
          COUNT(*) FILTER (WHERE provider = 'slack') as slack
        FROM webhooks
      `);

      // Get event counts
      const eventStats = await client.query(`
        SELECT 
          COUNT(*) as total,
          COUNT(*) FILTER (WHERE received_at > NOW() - INTERVAL '24 hours' AND status = 'processed') as processed_24h,
          COUNT(*) FILTER (WHERE received_at > NOW() - INTERVAL '24 hours' AND status = 'filtered') as filtered_24h,
          COUNT(*) FILTER (WHERE received_at > NOW() - INTERVAL '24 hours' AND status = 'failed') as failed_24h
        FROM webhook_events
      `);

      const ws = webhookStats.rows[0];
      const es = eventStats.rows[0];

      return {
        totalWebhooks: parseInt(ws.total, 10),
        enabledWebhooks: parseInt(ws.enabled, 10),
        bySourceType: {
          github: parseInt(ws.github, 10),
          calendar: parseInt(ws.calendar, 10),
          jira: parseInt(ws.jira, 10),
          custom: parseInt(ws.custom, 10),
        },
        byProvider: {
          whatsapp: parseInt(ws.whatsapp, 10),
          slack: parseInt(ws.slack, 10),
        },
        totalEvents: parseInt(es.total, 10),
        last24Hours: {
          processed: parseInt(es.processed_24h, 10),
          filtered: parseInt(es.filtered_24h, 10),
          failed: parseInt(es.failed_24h, 10),
        },
      };
    } finally {
      client.release();
    }
  }

  /**
   * Close database connection
   */
  async close(): Promise<void> {
    await this.pool.end();
    logger.info('Webhook database connection pool closed');
  }
}

/**
 * Create a WebhookDatabase instance
 */
export function createWebhookDatabase(config: WebhookDatabaseConfig): WebhookDatabase {
  const pool = new pg.Pool({
    connectionString: config.connectionString,
    max: 10,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 5000,
  });

  return new WebhookDatabase(pool);
}

/**
 * Create WebhookDatabase from existing pool
 */
export function createWebhookDatabaseFromPool(pool: pg.Pool): WebhookDatabase {
  return new WebhookDatabase(pool);
}
