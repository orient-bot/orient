/**
 * Webhook Database Service
 *
 * SQLite persistence layer for webhook configurations and event history using Drizzle ORM.
 * Manages the webhooks and webhook_events tables.
 */

import crypto from 'crypto';
import { createServiceLogger } from '@orient/core';
import { getDatabase, eq, desc, and, lt, sql, count, schema } from '@orient/database';
import type { Database } from '@orient/database';
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
 * WebhookDatabase - SQLite persistence for webhooks
 */
export class WebhookDatabase {
  private _db: Database | null = null;

  private get db(): Database {
    if (!this._db) {
      this._db = getDatabase();
    }
    return this._db;
  }

  /**
   * Initialize database (no-op for SQLite - schema managed via migrations)
   */
  async initialize(): Promise<void> {
    logger.info('Webhook database initialized (SQLite)');
  }

  /**
   * Generate a secure random token
   */
  private generateToken(): string {
    return crypto.randomBytes(32).toString('hex');
  }

  private parseEventFilter(json: string | null): string[] | undefined {
    if (!json) return undefined;
    try {
      return JSON.parse(json);
    } catch {
      return undefined;
    }
  }

  private parsePayload(json: string | null): Record<string, unknown> {
    if (!json) return {};
    try {
      return JSON.parse(json);
    } catch {
      return {};
    }
  }

  /**
   * Map database row to Webhook object
   */
  private rowToWebhook(row: typeof schema.webhooks.$inferSelect): Webhook {
    return {
      id: row.id,
      name: row.name,
      description: row.description || undefined,
      token: row.token,
      signatureHeader: row.signatureHeader || undefined,
      sourceType: row.sourceType as Webhook['sourceType'],
      eventFilter: this.parseEventFilter(row.eventFilter),
      provider: row.provider as Webhook['provider'],
      target: row.target,
      messageTemplate: row.messageTemplate || undefined,
      enabled: row.enabled ?? true,
      lastTriggeredAt: row.lastTriggeredAt || undefined,
      triggerCount: row.triggerCount || 0,
      createdAt: row.createdAt || new Date(),
      updatedAt: row.updatedAt || new Date(),
    };
  }

  /**
   * Map database row to WebhookEvent object
   */
  private rowToWebhookEvent(
    row: Partial<typeof schema.webhookEvents.$inferSelect> & { webhookName?: string }
  ): WebhookEvent {
    return {
      id: row.id!,
      webhookId: row.webhookId!,
      receivedAt: row.receivedAt || new Date(),
      eventType: row.eventType || undefined,
      payload: this.parsePayload(row.payload ?? null),
      status: row.status as WebhookEventStatus,
      error: row.error || undefined,
      messageSent: row.messageSent || undefined,
      processingTimeMs: row.processingTimeMs || undefined,
      webhookName: row.webhookName,
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

    const result = await this.db
      .insert(schema.webhooks)
      .values({
        name: input.name,
        description: input.description || null,
        token,
        signatureHeader: input.signatureHeader || null,
        sourceType: input.sourceType,
        eventFilter: input.eventFilter ? JSON.stringify(input.eventFilter) : null,
        provider: input.provider,
        target: input.target,
        messageTemplate: input.messageTemplate || null,
        enabled: input.enabled !== false,
      })
      .returning();

    const webhook = this.rowToWebhook(result[0]);
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
    const result = await this.db
      .select()
      .from(schema.webhooks)
      .where(eq(schema.webhooks.id, id))
      .limit(1);

    if (result.length === 0) {
      return null;
    }

    return this.rowToWebhook(result[0]);
  }

  /**
   * Get a webhook by name
   */
  async getWebhookByName(name: string): Promise<Webhook | null> {
    const result = await this.db
      .select()
      .from(schema.webhooks)
      .where(eq(schema.webhooks.name, name))
      .limit(1);

    if (result.length === 0) {
      return null;
    }

    return this.rowToWebhook(result[0]);
  }

  /**
   * Get all webhooks
   */
  async getAllWebhooks(): Promise<Webhook[]> {
    const result = await this.db
      .select()
      .from(schema.webhooks)
      .orderBy(desc(schema.webhooks.createdAt));

    return result.map((row) => this.rowToWebhook(row));
  }

  /**
   * Get enabled webhooks by source type
   */
  async getEnabledWebhooksBySource(sourceType: string): Promise<Webhook[]> {
    const result = await this.db
      .select()
      .from(schema.webhooks)
      .where(and(eq(schema.webhooks.sourceType, sourceType), eq(schema.webhooks.enabled, true)));

    return result.map((row) => this.rowToWebhook(row));
  }

  /**
   * Update a webhook
   */
  async updateWebhook(id: number, input: UpdateWebhookInput): Promise<Webhook | null> {
    const updateData: Record<string, unknown> = {
      updatedAt: new Date(),
    };

    if (input.name !== undefined) updateData.name = input.name;
    if (input.description !== undefined) updateData.description = input.description;
    if (input.token !== undefined) updateData.token = input.token;
    if (input.signatureHeader !== undefined) updateData.signatureHeader = input.signatureHeader;
    if (input.sourceType !== undefined) updateData.sourceType = input.sourceType;
    if (input.eventFilter !== undefined)
      updateData.eventFilter = input.eventFilter ? JSON.stringify(input.eventFilter) : null;
    if (input.provider !== undefined) updateData.provider = input.provider;
    if (input.target !== undefined) updateData.target = input.target;
    if (input.messageTemplate !== undefined) updateData.messageTemplate = input.messageTemplate;
    if (input.enabled !== undefined) updateData.enabled = input.enabled;

    const result = await this.db
      .update(schema.webhooks)
      .set(updateData)
      .where(eq(schema.webhooks.id, id))
      .returning();

    if (result.length === 0) {
      return null;
    }

    const webhook = this.rowToWebhook(result[0]);
    logger.info('Updated webhook', { id: webhook.id, name: webhook.name });
    return webhook;
  }

  /**
   * Delete a webhook
   */
  async deleteWebhook(id: number): Promise<boolean> {
    const result = await this.db
      .delete(schema.webhooks)
      .where(eq(schema.webhooks.id, id))
      .returning({ id: schema.webhooks.id });

    const deleted = result.length > 0;
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
    const result = await this.db
      .insert(schema.webhookEvents)
      .values({
        webhookId,
        eventType: eventType || null,
        payload: JSON.stringify(payload),
        status,
      })
      .returning();

    return this.rowToWebhookEvent(result[0]);
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
    await this.db
      .update(schema.webhookEvents)
      .set({
        status,
        error: options.error || null,
        messageSent: options.messageSent || null,
        processingTimeMs: options.processingTimeMs || null,
      })
      .where(eq(schema.webhookEvents.id, eventId));
  }

  /**
   * Update webhook trigger stats
   */
  async recordTrigger(webhookId: number): Promise<void> {
    const webhook = await this.getWebhook(webhookId);
    await this.db
      .update(schema.webhooks)
      .set({
        lastTriggeredAt: new Date(),
        triggerCount: (webhook?.triggerCount || 0) + 1,
        updatedAt: new Date(),
      })
      .where(eq(schema.webhooks.id, webhookId));
  }

  /**
   * Get events for a specific webhook
   */
  async getWebhookEvents(webhookId: number, limit: number = 50): Promise<WebhookEvent[]> {
    const result = await this.db
      .select({
        id: schema.webhookEvents.id,
        webhookId: schema.webhookEvents.webhookId,
        receivedAt: schema.webhookEvents.receivedAt,
        eventType: schema.webhookEvents.eventType,
        payload: schema.webhookEvents.payload,
        status: schema.webhookEvents.status,
        error: schema.webhookEvents.error,
        messageSent: schema.webhookEvents.messageSent,
        processingTimeMs: schema.webhookEvents.processingTimeMs,
        webhookName: schema.webhooks.name,
      })
      .from(schema.webhookEvents)
      .innerJoin(schema.webhooks, eq(schema.webhookEvents.webhookId, schema.webhooks.id))
      .where(eq(schema.webhookEvents.webhookId, webhookId))
      .orderBy(desc(schema.webhookEvents.receivedAt))
      .limit(limit);

    return result.map((row) => this.rowToWebhookEvent(row));
  }

  /**
   * Get recent events across all webhooks
   */
  async getRecentEvents(limit: number = 50): Promise<WebhookEvent[]> {
    const result = await this.db
      .select({
        id: schema.webhookEvents.id,
        webhookId: schema.webhookEvents.webhookId,
        receivedAt: schema.webhookEvents.receivedAt,
        eventType: schema.webhookEvents.eventType,
        payload: schema.webhookEvents.payload,
        status: schema.webhookEvents.status,
        error: schema.webhookEvents.error,
        messageSent: schema.webhookEvents.messageSent,
        processingTimeMs: schema.webhookEvents.processingTimeMs,
        webhookName: schema.webhooks.name,
      })
      .from(schema.webhookEvents)
      .innerJoin(schema.webhooks, eq(schema.webhookEvents.webhookId, schema.webhooks.id))
      .orderBy(desc(schema.webhookEvents.receivedAt))
      .limit(limit);

    return result.map((row) => this.rowToWebhookEvent(row));
  }

  /**
   * Clean up old events (keep last N days)
   */
  async cleanupOldEvents(retentionDays: number = 30): Promise<number> {
    const cutoffDate = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000);

    const result = await this.db
      .delete(schema.webhookEvents)
      .where(lt(schema.webhookEvents.receivedAt, cutoffDate))
      .returning({ id: schema.webhookEvents.id });

    const deleted = result.length;
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
    const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);

    // Get webhook counts
    const [totalResult, enabledResult, bySourceResult, byProviderResult, totalEventsResult] =
      await Promise.all([
        this.db.select({ count: count() }).from(schema.webhooks),
        this.db
          .select({ count: count() })
          .from(schema.webhooks)
          .where(eq(schema.webhooks.enabled, true)),
        this.db
          .select({
            sourceType: schema.webhooks.sourceType,
            count: count(),
          })
          .from(schema.webhooks)
          .groupBy(schema.webhooks.sourceType),
        this.db
          .select({
            provider: schema.webhooks.provider,
            count: count(),
          })
          .from(schema.webhooks)
          .groupBy(schema.webhooks.provider),
        this.db.select({ count: count() }).from(schema.webhookEvents),
      ]);

    // Get recent event counts
    const [processedResult, filteredResult, failedResult] = await Promise.all([
      this.db
        .select({ count: count() })
        .from(schema.webhookEvents)
        .where(
          and(
            eq(schema.webhookEvents.status, 'processed'),
            sql`${schema.webhookEvents.receivedAt} > ${twentyFourHoursAgo.getTime() / 1000}`
          )
        ),
      this.db
        .select({ count: count() })
        .from(schema.webhookEvents)
        .where(
          and(
            eq(schema.webhookEvents.status, 'filtered'),
            sql`${schema.webhookEvents.receivedAt} > ${twentyFourHoursAgo.getTime() / 1000}`
          )
        ),
      this.db
        .select({ count: count() })
        .from(schema.webhookEvents)
        .where(
          and(
            eq(schema.webhookEvents.status, 'failed'),
            sql`${schema.webhookEvents.receivedAt} > ${twentyFourHoursAgo.getTime() / 1000}`
          )
        ),
    ]);

    return {
      totalWebhooks: totalResult[0]?.count || 0,
      enabledWebhooks: enabledResult[0]?.count || 0,
      bySourceType: {
        github: bySourceResult.find((r) => r.sourceType === 'github')?.count || 0,
        calendar: bySourceResult.find((r) => r.sourceType === 'calendar')?.count || 0,
        jira: bySourceResult.find((r) => r.sourceType === 'jira')?.count || 0,
        custom: bySourceResult.find((r) => r.sourceType === 'custom')?.count || 0,
      },
      byProvider: {
        whatsapp: byProviderResult.find((r) => r.provider === 'whatsapp')?.count || 0,
        slack: byProviderResult.find((r) => r.provider === 'slack')?.count || 0,
      },
      totalEvents: totalEventsResult[0]?.count || 0,
      last24Hours: {
        processed: processedResult[0]?.count || 0,
        filtered: filteredResult[0]?.count || 0,
        failed: failedResult[0]?.count || 0,
      },
    };
  }

  /**
   * Close database connection (no-op for SQLite singleton)
   */
  async close(): Promise<void> {
    logger.info('Webhook database connection closed');
  }
}

/**
 * Create a WebhookDatabase instance
 */
export function createWebhookDatabase(): WebhookDatabase {
  return new WebhookDatabase();
}
