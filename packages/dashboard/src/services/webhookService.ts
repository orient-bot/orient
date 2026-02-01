/**
 * Webhook Service
 *
 * Core service for processing incoming webhooks, verifying signatures,
 * formatting messages, and delivering to WhatsApp/Slack.
 */

import crypto from 'crypto';
import { createServiceLogger } from '@orient-bot/core';
import { WebhookDatabase } from '@orient-bot/database-services';
import {
  Webhook,
  WebhookEvent,
  CreateWebhookInput,
  UpdateWebhookInput,
  WebhookStats,
  WebhookTemplateContext,
  GITHUB_SIGNATURE_HEADER,
  GITHUB_EVENT_HEADER,
  DEFAULT_TEMPLATES,
} from '../types/webhook.js';

const logger = createServiceLogger('webhook');

/**
 * Message sender interface (injected from bot)
 */
export interface WebhookMessageSender {
  sendWhatsApp(target: string, message: string): Promise<void>;
  sendSlack(target: string, message: string): Promise<void>;
}

/**
 * Incoming webhook request data
 */
export interface IncomingWebhook {
  webhookName: string;
  headers: Record<string, string>;
  body: unknown;
  rawBody?: string;
}

/**
 * Result of processing a webhook
 */
export interface WebhookProcessResult {
  success: boolean;
  eventId?: number;
  status: 'processed' | 'filtered' | 'failed' | 'not_found' | 'disabled' | 'invalid_signature';
  message?: string;
  error?: string;
}

/**
 * WebhookService - Manages webhook processing and delivery
 */
export class WebhookService {
  private db: WebhookDatabase;
  private messageSender: WebhookMessageSender | null = null;

  constructor(db: WebhookDatabase) {
    this.db = db;
  }

  /**
   * Set the message sender for delivering webhook notifications
   */
  setMessageSender(sender: WebhookMessageSender): void {
    this.messageSender = sender;
    logger.info('Webhook message sender configured');
  }

  // ============================================
  // WEBHOOK CRUD (delegate to database)
  // ============================================

  async createWebhook(input: CreateWebhookInput): Promise<Webhook> {
    const webhook = await this.db.createWebhook(input);
    logger.info('Created webhook', { id: webhook.id, name: webhook.name });
    return webhook;
  }

  async getWebhook(id: number): Promise<Webhook | null> {
    return this.db.getWebhook(id);
  }

  async getWebhookByName(name: string): Promise<Webhook | null> {
    return this.db.getWebhookByName(name);
  }

  async getAllWebhooks(): Promise<Webhook[]> {
    return this.db.getAllWebhooks();
  }

  async updateWebhook(id: number, input: UpdateWebhookInput): Promise<Webhook | null> {
    const webhook = await this.db.updateWebhook(id, input);
    if (webhook) {
      logger.info('Updated webhook', { id: webhook.id, name: webhook.name });
    }
    return webhook;
  }

  async deleteWebhook(id: number): Promise<boolean> {
    const deleted = await this.db.deleteWebhook(id);
    if (deleted) {
      logger.info('Deleted webhook', { id });
    }
    return deleted;
  }

  async toggleWebhook(id: number, enabled: boolean): Promise<Webhook | null> {
    const webhook = await this.db.toggleWebhook(id, enabled);
    if (webhook) {
      logger.info('Toggled webhook', { id: webhook.id, name: webhook.name, enabled });
    }
    return webhook;
  }

  async regenerateToken(id: number): Promise<Webhook | null> {
    const webhook = await this.db.regenerateToken(id);
    if (webhook) {
      logger.info('Regenerated token for webhook', { id: webhook.id, name: webhook.name });
    }
    return webhook;
  }

  async getWebhookEvents(webhookId: number, limit?: number): Promise<WebhookEvent[]> {
    return this.db.getWebhookEvents(webhookId, limit);
  }

  async getRecentEvents(limit?: number): Promise<WebhookEvent[]> {
    return this.db.getRecentEvents(limit);
  }

  async getStats(): Promise<WebhookStats> {
    return this.db.getStats();
  }

  // ============================================
  // WEBHOOK PROCESSING
  // ============================================

  /**
   * Process an incoming webhook request
   */
  async processWebhook(request: IncomingWebhook): Promise<WebhookProcessResult> {
    const startTime = Date.now();

    // Find the webhook configuration
    const webhook = await this.db.getWebhookByName(request.webhookName);
    if (!webhook) {
      logger.warn('Webhook not found', { name: request.webhookName });
      return {
        success: false,
        status: 'not_found',
        error: `Webhook '${request.webhookName}' not found`,
      };
    }

    // Check if enabled
    if (!webhook.enabled) {
      logger.debug('Webhook is disabled', { name: request.webhookName });
      return {
        success: false,
        status: 'disabled',
        error: 'Webhook is disabled',
      };
    }

    // Extract event type (for GitHub, etc.)
    const eventType = this.extractEventType(webhook, request.headers);
    const payload = request.body as Record<string, unknown>;

    // Record the event
    const event = await this.db.recordEvent(webhook.id, eventType, payload, 'pending');

    try {
      // Verify signature if required
      if (webhook.signatureHeader && request.rawBody) {
        const signature = request.headers[webhook.signatureHeader.toLowerCase()];
        if (!this.verifySignature(webhook, signature, request.rawBody)) {
          await this.db.updateEvent(event.id, 'failed', {
            error: 'Invalid signature',
            processingTimeMs: Date.now() - startTime,
          });
          logger.warn('Invalid webhook signature', { webhookId: webhook.id, name: webhook.name });
          return {
            success: false,
            eventId: event.id,
            status: 'invalid_signature',
            error: 'Invalid signature',
          };
        }
      }

      // Check event filter
      if (webhook.eventFilter && webhook.eventFilter.length > 0 && eventType) {
        if (!webhook.eventFilter.includes(eventType)) {
          await this.db.updateEvent(event.id, 'filtered', {
            processingTimeMs: Date.now() - startTime,
          });
          logger.debug('Event filtered', {
            webhookId: webhook.id,
            eventType,
            filter: webhook.eventFilter,
          });
          return {
            success: true,
            eventId: event.id,
            status: 'filtered',
            message: `Event '${eventType}' filtered out`,
          };
        }
      }

      // Format the message
      const message = this.formatMessage(webhook, eventType, payload);

      // Send the message
      await this.sendMessage(webhook.provider, webhook.target, message);

      // Update event and webhook stats
      await this.db.updateEvent(event.id, 'processed', {
        messageSent: message,
        processingTimeMs: Date.now() - startTime,
      });
      await this.db.recordTrigger(webhook.id);

      logger.info('Webhook processed successfully', {
        webhookId: webhook.id,
        name: webhook.name,
        eventType,
        processingTimeMs: Date.now() - startTime,
      });

      return {
        success: true,
        eventId: event.id,
        status: 'processed',
        message,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);

      await this.db.updateEvent(event.id, 'failed', {
        error: errorMessage,
        processingTimeMs: Date.now() - startTime,
      });

      logger.error('Webhook processing failed', {
        webhookId: webhook.id,
        name: webhook.name,
        error: errorMessage,
      });

      return {
        success: false,
        eventId: event.id,
        status: 'failed',
        error: errorMessage,
      };
    }
  }

  /**
   * Test a webhook by sending a test message
   */
  async testWebhook(id: number): Promise<WebhookProcessResult> {
    const webhook = await this.db.getWebhook(id);
    if (!webhook) {
      return {
        success: false,
        status: 'not_found',
        error: 'Webhook not found',
      };
    }

    try {
      const testMessage = `🔔 **Webhook Test**\n\nWebhook: ${webhook.name}\nSource: ${webhook.sourceType}\nTime: ${new Date().toISOString()}`;

      await this.sendMessage(webhook.provider, webhook.target, testMessage);

      logger.info('Webhook test sent', { webhookId: id, name: webhook.name });

      return {
        success: true,
        status: 'processed',
        message: testMessage,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      return {
        success: false,
        status: 'failed',
        error: errorMessage,
      };
    }
  }

  // ============================================
  // SIGNATURE VERIFICATION
  // ============================================

  /**
   * Verify webhook signature
   */
  private verifySignature(
    webhook: Webhook,
    signature: string | undefined,
    rawBody: string
  ): boolean {
    if (!signature) {
      return false;
    }

    if (webhook.sourceType === 'github') {
      return this.verifyGitHubSignature(webhook.token, signature, rawBody);
    }

    // For custom webhooks, expect a simple token match or HMAC
    if (signature.startsWith('sha256=')) {
      return this.verifyHmacSignature(webhook.token, signature, rawBody);
    }

    // Simple token comparison
    return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(webhook.token));
  }

  /**
   * Verify GitHub webhook signature (SHA256 HMAC)
   */
  private verifyGitHubSignature(secret: string, signature: string, rawBody: string): boolean {
    if (!signature.startsWith('sha256=')) {
      return false;
    }

    const expectedSignature =
      'sha256=' + crypto.createHmac('sha256', secret).update(rawBody).digest('hex');

    try {
      return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expectedSignature));
    } catch {
      return false;
    }
  }

  /**
   * Verify HMAC signature
   */
  private verifyHmacSignature(secret: string, signature: string, rawBody: string): boolean {
    const [algorithm, hash] = signature.split('=');
    if (!hash) {
      return false;
    }

    const algo = algorithm === 'sha256' ? 'sha256' : 'sha1';
    const expectedHash = crypto.createHmac(algo, secret).update(rawBody).digest('hex');

    try {
      return crypto.timingSafeEqual(Buffer.from(hash), Buffer.from(expectedHash));
    } catch {
      return false;
    }
  }

  // ============================================
  // EVENT TYPE EXTRACTION
  // ============================================

  /**
   * Extract event type from request headers
   */
  private extractEventType(webhook: Webhook, headers: Record<string, string>): string | undefined {
    if (webhook.sourceType === 'github') {
      return headers[GITHUB_EVENT_HEADER] || headers['x-github-event'];
    }

    // For other sources, try common header patterns
    return headers['x-event-type'] || headers['event-type'];
  }

  // ============================================
  // MESSAGE FORMATTING
  // ============================================

  /**
   * Format webhook message using template
   */
  private formatMessage(
    webhook: Webhook,
    eventType: string | undefined,
    payload: Record<string, unknown>
  ): string {
    // Get template (custom or default)
    let template = webhook.messageTemplate;
    if (!template) {
      const templateKey = eventType ? `${webhook.sourceType}:${eventType}` : webhook.sourceType;
      template = DEFAULT_TEMPLATES[templateKey] || DEFAULT_TEMPLATES['custom'];
    }

    // Build context based on source type
    const context = this.buildTemplateContext(webhook, eventType, payload);

    // Simple template substitution ({{variable}})
    return this.substituteTemplate(template, context);
  }

  /**
   * Build template context from payload
   */
  private buildTemplateContext(
    webhook: Webhook,
    eventType: string | undefined,
    payload: Record<string, unknown>
  ): WebhookTemplateContext {
    const now = new Date();
    const context: WebhookTemplateContext = {
      event_type: eventType || 'unknown',
      webhook_name: webhook.name,
      timestamp: now.toISOString(),
      date: now.toISOString().split('T')[0],
      time: now.toTimeString().slice(0, 5),
      payload,
    };

    // Add source-specific context
    if (webhook.sourceType === 'github') {
      this.addGitHubContext(context, eventType, payload);
    } else if (webhook.sourceType === 'calendar') {
      this.addCalendarContext(context, payload);
    }

    return context;
  }

  /**
   * Add GitHub-specific context variables
   */
  private addGitHubContext(
    context: WebhookTemplateContext,
    eventType: string | undefined,
    payload: Record<string, unknown>
  ): void {
    const repo = payload.repository as Record<string, unknown> | undefined;
    const sender = payload.sender as Record<string, unknown> | undefined;

    if (repo) {
      context.repo_name = repo.name as string;
      context.repo_full_name = repo.full_name as string;
      context.repo_url = repo.html_url as string;
    }

    if (sender) {
      context.sender = sender.login as string;
    }

    context.pr_action = payload.action as string;
    context.issue_action = payload.action as string;

    if (eventType === 'pull_request') {
      const pr = payload.pull_request as Record<string, unknown> | undefined;
      if (pr) {
        context.pr_title = pr.title as string;
        context.pr_number = payload.number as number;
        context.pr_url = pr.html_url as string;
        context.pr_state = pr.state as string;
        context.pr_additions = pr.additions as number;
        context.pr_deletions = pr.deletions as number;

        const user = pr.user as Record<string, unknown> | undefined;
        if (user) {
          context.pr_author = user.login as string;
        }

        const head = pr.head as Record<string, unknown> | undefined;
        const base = pr.base as Record<string, unknown> | undefined;
        if (head) {
          context.pr_branch = head.ref as string;
        }
        if (base) {
          context.pr_base = base.ref as string;
        }
      }
    } else if (eventType === 'issues') {
      const issue = payload.issue as Record<string, unknown> | undefined;
      if (issue) {
        context.issue_title = issue.title as string;
        context.issue_number = issue.number as number;
        context.issue_url = issue.html_url as string;
        context.issue_state = issue.state as string;

        const user = issue.user as Record<string, unknown> | undefined;
        if (user) {
          context.issue_author = user.login as string;
        }
      }
    } else if (eventType === 'push') {
      const commits = payload.commits as unknown[] | undefined;
      context.push_branch = (payload.ref as string)?.replace('refs/heads/', '');
      context.push_commits = commits?.length || 0;
      context.push_compare_url = payload.compare as string;

      const pusher = payload.pusher as Record<string, unknown> | undefined;
      if (pusher) {
        context.push_author = pusher.name as string;
      }
    }
  }

  /**
   * Add Calendar-specific context variables
   */
  private addCalendarContext(
    context: WebhookTemplateContext,
    payload: Record<string, unknown>
  ): void {
    context.event_summary = payload.summary as string;
    context.event_location = payload.location as string;
    context.event_start = payload.start as string;
    context.event_end = payload.end as string;
    context.event_organizer = payload.organizer as string;
    context.meeting_link = payload.meetingLink as string;
  }

  /**
   * Substitute template variables
   */
  private substituteTemplate(template: string, context: WebhookTemplateContext): string {
    return template.replace(/\{\{(\w+)\}\}/g, (match, key) => {
      const value = context[key as keyof WebhookTemplateContext];
      if (value === undefined || value === null) {
        return '';
      }
      if (typeof value === 'object') {
        return JSON.stringify(value);
      }
      return String(value);
    });
  }

  // ============================================
  // MESSAGE DELIVERY
  // ============================================

  /**
   * Send message via the appropriate provider
   */
  private async sendMessage(provider: string, target: string, message: string): Promise<void> {
    if (!this.messageSender) {
      throw new Error('Message sender not configured');
    }

    if (provider === 'whatsapp') {
      await this.messageSender.sendWhatsApp(target, message);
    } else if (provider === 'slack') {
      await this.messageSender.sendSlack(target, message);
    } else {
      throw new Error(`Unknown provider: ${provider}`);
    }
  }

  // ============================================
  // URL HELPERS
  // ============================================

  /**
   * Get the webhook URL for external configuration
   */
  getWebhookUrl(webhookName: string, baseUrl: string): string {
    return `${baseUrl}/webhooks/${encodeURIComponent(webhookName)}`;
  }

  /**
   * Validate cron expression (static utility)
   */
  static isValidWebhookName(name: string): boolean {
    // Alphanumeric, hyphens, underscores, 3-50 chars
    return /^[a-zA-Z0-9_-]{3,50}$/.test(name);
  }
}

/**
 * Create a WebhookService instance
 */
export function createWebhookService(db: WebhookDatabase): WebhookService {
  return new WebhookService(db);
}
