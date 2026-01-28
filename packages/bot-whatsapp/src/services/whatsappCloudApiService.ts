/**
 * WhatsApp Cloud API Service
 *
 * Handles communication with Meta's WhatsApp Business Cloud API.
 * This service enables:
 * - Sending text messages and template messages
 * - Receiving messages via webhooks
 * - Sending notifications (reminders, alerts, digests)
 *
 * Exported via @orientbot/bot-whatsapp package.
 *
 * This is the "bot mode" for WhatsApp, using a dedicated business number.
 */

import { EventEmitter } from 'events';
import crypto from 'crypto';
import { createDedicatedServiceLogger } from '@orientbot/core';
import type { WhatsAppCloudApiConfig } from '@orientbot/core';

const logger = createDedicatedServiceLogger('whatsapp-cloud-api', {
  maxSize: '20m',
  maxDays: '14d',
  compress: true,
});

// =============================================================================
// Types
// =============================================================================

/** Template message parameter */
export interface TemplateParameter {
  type: 'text' | 'currency' | 'date_time' | 'image' | 'document' | 'video';
  text?: string;
  currency?: { fallback_value: string; code: string; amount_1000: number };
  date_time?: { fallback_value: string };
}

/** Template message component */
export interface TemplateComponent {
  type: 'header' | 'body' | 'button';
  parameters?: TemplateParameter[];
  sub_type?: 'quick_reply' | 'url';
  index?: number;
}

/** Template message */
export interface TemplateMessage {
  name: string;
  language: { code: string };
  components?: TemplateComponent[];
}

/** Incoming message from webhook */
export interface CloudApiIncomingMessage {
  id: string;
  from: string; // Phone number in E.164 format (no +)
  timestamp: string;
  type:
    | 'text'
    | 'image'
    | 'audio'
    | 'video'
    | 'document'
    | 'sticker'
    | 'location'
    | 'contacts'
    | 'interactive'
    | 'button'
    | 'reaction';
  text?: { body: string };
  image?: { id: string; mime_type: string; sha256: string; caption?: string };
  audio?: { id: string; mime_type: string };
  video?: { id: string; mime_type: string; caption?: string };
  document?: { id: string; mime_type: string; filename: string; caption?: string };
  interactive?: {
    type: 'button_reply' | 'list_reply';
    button_reply?: { id: string; title: string };
    list_reply?: { id: string; title: string; description?: string };
  };
  reaction?: { message_id: string; emoji: string };
  context?: { from: string; id: string }; // If replying to a message
}

/** Message status update from webhook */
export interface CloudApiMessageStatus {
  id: string;
  status: 'sent' | 'delivered' | 'read' | 'failed';
  timestamp: string;
  recipient_id: string;
  errors?: Array<{
    code: number;
    title: string;
    message: string;
    error_data?: { details: string };
  }>;
}

/** Webhook entry structure */
export interface WebhookEntry {
  id: string;
  changes: Array<{
    value: {
      messaging_product: 'whatsapp';
      metadata: { display_phone_number: string; phone_number_id: string };
      contacts?: Array<{ profile: { name: string }; wa_id: string }>;
      messages?: CloudApiIncomingMessage[];
      statuses?: CloudApiMessageStatus[];
    };
    field: string;
  }>;
}

/** Webhook payload structure */
export interface WebhookPayload {
  object: 'whatsapp_business_account';
  entry: WebhookEntry[];
}

/** Send message result */
export interface SendMessageResult {
  messageId: string;
  success: boolean;
  error?: string;
}

/** Service events */
export interface CloudApiServiceEvents {
  message: (message: CloudApiIncomingMessage, senderName?: string) => void;
  status: (status: CloudApiMessageStatus) => void;
  error: (error: Error) => void;
}

// =============================================================================
// Service Implementation
// =============================================================================

export class WhatsAppCloudApiService extends EventEmitter {
  private config: WhatsAppCloudApiConfig;
  private baseUrl: string;
  private isInitialized: boolean = false;

  constructor(config: WhatsAppCloudApiConfig) {
    super();
    this.config = config;
    this.baseUrl = `https://graph.facebook.com/${config.apiVersion || 'v21.0'}`;
  }

  /**
   * Initialize the service
   */
  async initialize(): Promise<void> {
    if (!this.config.enabled) {
      logger.info('WhatsApp Cloud API is disabled');
      return;
    }

    if (!this.config.phoneNumberId || !this.config.accessToken) {
      logger.warn('WhatsApp Cloud API not configured - missing phoneNumberId or accessToken');
      return;
    }

    // Verify credentials by fetching phone number info
    try {
      const response = await this.makeRequest('GET', `/${this.config.phoneNumberId}`);
      logger.info('WhatsApp Cloud API initialized', {
        phoneNumberId: this.config.phoneNumberId,
        displayPhoneNumber: response.display_phone_number,
        verifiedName: response.verified_name,
      });
      this.isInitialized = true;
    } catch (error) {
      logger.error('Failed to initialize WhatsApp Cloud API', {
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * Check if the service is ready
   */
  isReady(): boolean {
    return this.isInitialized && this.config.enabled === true;
  }

  /**
   * Make an authenticated request to the Graph API
   */
  private async makeRequest(
    method: 'GET' | 'POST' | 'DELETE',
    path: string,
    body?: Record<string, unknown>
  ): Promise<Record<string, unknown>> {
    const url = `${this.baseUrl}${path}`;

    const headers: Record<string, string> = {
      Authorization: `Bearer ${this.config.accessToken}`,
      'Content-Type': 'application/json',
    };

    const options: RequestInit = {
      method,
      headers,
    };

    if (body) {
      options.body = JSON.stringify(body);
    }

    const response = await fetch(url, options);
    const data = (await response.json()) as Record<string, unknown>;

    if (!response.ok) {
      const errorMessage =
        (data as { error?: { message?: string } }).error?.message || 'Unknown error';
      throw new Error(`Graph API error: ${errorMessage}`);
    }

    return data;
  }

  /**
   * Send a text message
   */
  async sendTextMessage(to: string, text: string): Promise<SendMessageResult> {
    if (!this.isReady()) {
      return { messageId: '', success: false, error: 'Service not initialized' };
    }

    // Normalize phone number (remove + if present)
    const normalizedTo = to.replace(/^\+/, '');

    const op = logger.startOperation('sendTextMessage');

    try {
      const response = await this.makeRequest('POST', `/${this.config.phoneNumberId}/messages`, {
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to: normalizedTo,
        type: 'text',
        text: { body: text },
      });

      const messages = response.messages as Array<{ id: string }>;
      const messageId = messages?.[0]?.id || '';

      op.success('Message sent', { to: normalizedTo, messageId });
      return { messageId, success: true };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      op.failure(error instanceof Error ? error : String(error));
      return { messageId: '', success: false, error: errorMessage };
    }
  }

  /**
   * Send a template message (required for business-initiated conversations)
   */
  async sendTemplateMessage(
    to: string,
    templateName: string,
    languageCode: string,
    parameters?: string[]
  ): Promise<SendMessageResult> {
    if (!this.isReady()) {
      return { messageId: '', success: false, error: 'Service not initialized' };
    }

    const normalizedTo = to.replace(/^\+/, '');
    const op = logger.startOperation('sendTemplateMessage');

    try {
      const components: TemplateComponent[] = [];

      if (parameters && parameters.length > 0) {
        components.push({
          type: 'body',
          parameters: parameters.map((text) => ({ type: 'text', text })),
        });
      }

      const payload: Record<string, unknown> = {
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to: normalizedTo,
        type: 'template',
        template: {
          name: templateName,
          language: { code: languageCode },
          ...(components.length > 0 && { components }),
        },
      };

      const response = await this.makeRequest(
        'POST',
        `/${this.config.phoneNumberId}/messages`,
        payload
      );

      const messages = response.messages as Array<{ id: string }>;
      const messageId = messages?.[0]?.id || '';

      op.success('Template message sent', { to: normalizedTo, template: templateName, messageId });
      return { messageId, success: true };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      op.failure(error instanceof Error ? error : String(error));
      return { messageId: '', success: false, error: errorMessage };
    }
  }

  /**
   * Send a reminder notification using the reminder template
   */
  async sendReminder(to: string, name: string, message: string): Promise<SendMessageResult> {
    const templateName = this.config.templates?.reminder || 'daily_reminder';
    return this.sendTemplateMessage(to, templateName, 'en', [name, message]);
  }

  /**
   * Send an SLA alert using the sla_alert template
   */
  async sendSlaAlert(
    to: string,
    issueKey: string,
    status: string,
    days: string
  ): Promise<SendMessageResult> {
    const templateName = this.config.templates?.slaAlert || 'sla_alert';
    return this.sendTemplateMessage(to, templateName, 'en', [issueKey, status, days]);
  }

  /**
   * Send a daily digest using the daily_digest template
   */
  async sendDailyDigest(to: string, summary: string): Promise<SendMessageResult> {
    const templateName = this.config.templates?.dailyDigest || 'daily_digest';
    return this.sendTemplateMessage(to, templateName, 'en', [summary]);
  }

  /**
   * Mark a message as read
   */
  async markAsRead(messageId: string): Promise<void> {
    if (!this.isReady()) return;

    try {
      await this.makeRequest('POST', `/${this.config.phoneNumberId}/messages`, {
        messaging_product: 'whatsapp',
        status: 'read',
        message_id: messageId,
      });
      logger.debug('Marked message as read', { messageId });
    } catch (error) {
      logger.warn('Failed to mark message as read', {
        messageId,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  /**
   * Download media file by ID
   */
  async downloadMedia(mediaId: string): Promise<{ buffer: Buffer; mimeType: string } | null> {
    if (!this.isReady()) return null;

    try {
      // First, get the media URL
      const mediaInfo = await this.makeRequest('GET', `/${mediaId}`);
      const mediaUrl = mediaInfo.url as string;
      const mimeType = mediaInfo.mime_type as string;

      // Then download the actual file
      const response = await fetch(mediaUrl, {
        headers: {
          Authorization: `Bearer ${this.config.accessToken}`,
        },
      });

      if (!response.ok) {
        throw new Error(`Failed to download media: ${response.status}`);
      }

      const arrayBuffer = await response.arrayBuffer();
      return { buffer: Buffer.from(arrayBuffer), mimeType };
    } catch (error) {
      logger.error('Failed to download media', {
        mediaId,
        error: error instanceof Error ? error.message : String(error),
      });
      return null;
    }
  }

  // =============================================================================
  // Webhook Handling
  // =============================================================================

  /**
   * Verify webhook subscription (GET request from Meta)
   */
  verifyWebhook(mode: string, token: string, challenge: string): string | null {
    const verifyToken = this.config.webhookVerifyToken;

    if (mode === 'subscribe' && token === verifyToken) {
      logger.info('Webhook verified successfully');
      return challenge;
    }

    logger.warn('Webhook verification failed', { mode, tokenMatch: token === verifyToken });
    return null;
  }

  /**
   * Verify webhook signature (X-Hub-Signature-256 header)
   */
  verifySignature(payload: string, signature: string): boolean {
    if (!this.config.appSecret) {
      logger.warn('No app secret configured, skipping signature verification');
      return true; // Allow if no secret configured (development only!)
    }

    const expectedSignature = crypto
      .createHmac('sha256', this.config.appSecret)
      .update(payload)
      .digest('hex');

    const actualSignature = signature.replace('sha256=', '');
    return crypto.timingSafeEqual(Buffer.from(expectedSignature), Buffer.from(actualSignature));
  }

  /**
   * Process incoming webhook event
   */
  processWebhookEvent(payload: WebhookPayload): void {
    if (payload.object !== 'whatsapp_business_account') {
      logger.warn('Received non-WhatsApp webhook', { object: payload.object });
      return;
    }

    for (const entry of payload.entry) {
      for (const change of entry.changes) {
        const value = change.value;

        // Process incoming messages
        if (value.messages && value.messages.length > 0) {
          for (const message of value.messages) {
            // Get sender name from contacts array
            const senderName = value.contacts?.find((c) => c.wa_id === message.from)?.profile?.name;

            logger.info('Received message via Cloud API', {
              id: message.id,
              from: message.from,
              type: message.type,
              senderName,
            });

            this.emit('message', message, senderName);
          }
        }

        // Process message status updates
        if (value.statuses && value.statuses.length > 0) {
          for (const status of value.statuses) {
            logger.debug('Message status update', {
              id: status.id,
              status: status.status,
              recipient: status.recipient_id,
            });

            this.emit('status', status);

            // Log errors if present
            if (status.errors) {
              for (const error of status.errors) {
                logger.error('Message delivery error', {
                  messageId: status.id,
                  code: error.code,
                  title: error.title,
                  message: error.message,
                });
              }
            }
          }
        }
      }
    }
  }

  /**
   * Get configuration (for external access)
   */
  getConfig(): WhatsAppCloudApiConfig {
    return this.config;
  }

  /**
   * Convert E.164 phone number to JID format (for compatibility with Baileys)
   */
  static phoneToJid(phone: string): string {
    const normalized = phone.replace(/^\+/, '').replace(/\D/g, '');
    return `${normalized}@s.whatsapp.net`;
  }

  /**
   * Convert JID to E.164 phone number
   */
  static jidToPhone(jid: string): string {
    return jid.split('@')[0].split(':')[0];
  }
}

/**
 * Create a WhatsApp Cloud API service instance
 */
export function createWhatsAppCloudApiService(
  config: WhatsAppCloudApiConfig
): WhatsAppCloudApiService {
  return new WhatsAppCloudApiService(config);
}
