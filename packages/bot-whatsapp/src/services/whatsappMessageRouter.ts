/**
 * WhatsApp Message Router
 *
 * Unified routing layer that manages message delivery between:
 * - Personal Mode (Baileys) - operates as your paired device
 * - Bot Mode (Cloud API) - operates as a separate bot number
 *
 * This router decides which channel to use based on:
 * - Message type (notification vs conversation)
 *
 * Exported via @orient-bot/bot-whatsapp package.
 * - Configuration defaults
 * - Per-chat overrides
 * - Channel availability
 */

import { EventEmitter } from 'events';
import { WhatsAppService } from './whatsappService.js';
import {
  WhatsAppCloudApiService,
  CloudApiIncomingMessage,
  SendMessageResult,
} from './whatsappCloudApiService.js';
// Re-export SendMessageResult for consumers
export type { SendMessageResult } from './whatsappCloudApiService.js';
import { createDedicatedServiceLogger } from '@orient-bot/core';

const logger = createDedicatedServiceLogger('whatsapp-router', {
  maxSize: '20m',
  maxDays: '14d',
  compress: true,
});

// =============================================================================
// Types
// =============================================================================

export type WhatsAppMode = 'personal' | 'bot';

export interface MessageRouterConfig {
  /** Default mode for interactive conversations */
  defaultMode: WhatsAppMode;
  /** Mode to use for notifications (reminders, alerts, digests) */
  notificationMode: WhatsAppMode;
  /** Per-chat mode overrides (key: JID or phone, value: mode) */
  channelOverrides?: Map<string, WhatsAppMode>;
}

export interface UnifiedMessage {
  id: string;
  from: string;
  fromPhone: string;
  text: string;
  timestamp: Date;
  isGroup: boolean;
  groupId?: string;
  senderName?: string;
  source: WhatsAppMode;
  replyToMessageId?: string;
}

export interface SendOptions {
  /** Force a specific mode (overrides routing logic) */
  mode?: WhatsAppMode;
  /** Template name for Cloud API (required for business-initiated) */
  templateName?: string;
  /** Template parameters */
  templateParams?: string[];
  /** Language code for templates (default: 'en') */
  languageCode?: string;
}

export interface RouterEvents {
  message: (message: UnifiedMessage) => void;
  message_stored: (message: UnifiedMessage) => void;
  error: (error: Error, source: WhatsAppMode) => void;
}

// =============================================================================
// Router Implementation
// =============================================================================

export class WhatsAppMessageRouter extends EventEmitter {
  private baileysService: WhatsAppService | null = null;
  private cloudApiService: WhatsAppCloudApiService | null = null;
  private config: MessageRouterConfig;
  private channelOverrides: Map<string, WhatsAppMode>;

  constructor(config: MessageRouterConfig) {
    super();
    this.config = config;
    this.channelOverrides = config.channelOverrides || new Map();
  }

  /**
   * Attach the Baileys (personal) service
   */
  attachBaileysService(service: WhatsAppService): void {
    this.baileysService = service;

    // Forward Baileys messages through router
    service.on('message', (msg) => {
      const unified = this.baileysMessageToUnified(msg, 'personal');
      this.emit('message', unified);
    });

    service.on('message_stored', (msg) => {
      const unified = this.baileysMessageToUnified(msg, 'personal');
      this.emit('message_stored', unified);
    });

    service.on('error', (error) => {
      this.emit('error', error, 'personal');
    });

    logger.info('Baileys service attached to router');
  }

  /**
   * Attach the Cloud API (bot) service
   */
  attachCloudApiService(service: WhatsAppCloudApiService): void {
    this.cloudApiService = service;

    // Forward Cloud API messages through router
    service.on('message', (msg: CloudApiIncomingMessage, senderName?: string) => {
      const unified = this.cloudApiMessageToUnified(msg, senderName);
      this.emit('message', unified);
    });

    service.on('error', (error) => {
      this.emit('error', error, 'bot');
    });

    logger.info('Cloud API service attached to router');
  }

  /**
   * Convert Baileys message to unified format
   */
  private baileysMessageToUnified(
    msg: {
      id: string;
      from: string;
      fromPhone: string;
      text: string;
      timestamp: Date;
      isGroup: boolean;
      groupId?: string;
    },
    source: WhatsAppMode
  ): UnifiedMessage {
    return {
      id: msg.id,
      from: msg.from,
      fromPhone: msg.fromPhone,
      text: msg.text,
      timestamp: msg.timestamp,
      isGroup: msg.isGroup,
      groupId: msg.groupId,
      source,
    };
  }

  /**
   * Convert Cloud API message to unified format
   */
  private cloudApiMessageToUnified(
    msg: CloudApiIncomingMessage,
    senderName?: string
  ): UnifiedMessage {
    const text =
      msg.text?.body ||
      msg.image?.caption ||
      msg.video?.caption ||
      msg.interactive?.button_reply?.title ||
      msg.interactive?.list_reply?.title ||
      '';

    return {
      id: msg.id,
      from: WhatsAppCloudApiService.phoneToJid(msg.from),
      fromPhone: msg.from,
      text,
      timestamp: new Date(parseInt(msg.timestamp) * 1000),
      isGroup: false, // Cloud API doesn't support groups yet
      senderName,
      source: 'bot',
      replyToMessageId: msg.context?.id,
    };
  }

  /**
   * Determine which mode to use for a given recipient
   */
  private getMode(recipient: string, options?: SendOptions): WhatsAppMode {
    // Explicit mode override takes precedence
    if (options?.mode) {
      return options.mode;
    }

    // Check per-chat overrides
    const normalizedRecipient = recipient.replace(/^\+/, '').split('@')[0];

    if (this.channelOverrides.has(recipient)) {
      return this.channelOverrides.get(recipient)!;
    }

    if (this.channelOverrides.has(normalizedRecipient)) {
      return this.channelOverrides.get(normalizedRecipient)!;
    }

    // Use default mode
    return this.config.defaultMode;
  }

  /**
   * Check if a mode is available
   */
  private isModeAvailable(mode: WhatsAppMode): boolean {
    if (mode === 'personal') {
      return this.baileysService?.isReady() ?? false;
    }
    if (mode === 'bot') {
      return this.cloudApiService?.isReady() ?? false;
    }
    return false;
  }

  /**
   * Send a message using the appropriate channel
   */
  async sendMessage(recipient: string, text: string, options?: SendOptions): Promise<boolean> {
    const mode = this.getMode(recipient, options);
    const op = logger.startOperation('sendMessage');

    // Check availability and try fallback if needed
    if (!this.isModeAvailable(mode)) {
      const fallbackMode: WhatsAppMode = mode === 'personal' ? 'bot' : 'personal';

      if (this.isModeAvailable(fallbackMode)) {
        logger.warn('Primary mode unavailable, using fallback', {
          primary: mode,
          fallback: fallbackMode,
          recipient,
        });
        return this.sendViaMode(recipient, text, fallbackMode, options, op);
      }

      op.failure('No WhatsApp channels available');
      return false;
    }

    return this.sendViaMode(recipient, text, mode, options, op);
  }

  /**
   * Send via specific mode
   */
  private async sendViaMode(
    recipient: string,
    text: string,
    mode: WhatsAppMode,
    options: SendOptions | undefined,
    op: ReturnType<typeof logger.startOperation>
  ): Promise<boolean> {
    try {
      if (mode === 'personal' && this.baileysService) {
        // Use Baileys
        const jid = recipient.includes('@') ? recipient : `${recipient}@s.whatsapp.net`;
        await this.baileysService.sendMessage(jid, text);
        op.success('Message sent via Baileys', { recipient, mode });
        return true;
      }

      if (mode === 'bot' && this.cloudApiService) {
        // Use Cloud API
        const phone = recipient.replace(/@.*$/, '').replace(/^\+/, '');
        const result = await this.cloudApiService.sendTextMessage(phone, text);

        if (result.success) {
          op.success('Message sent via Cloud API', {
            recipient,
            mode,
            messageId: result.messageId,
          });
          return true;
        } else {
          op.failure(result.error || 'Cloud API send failed');
          return false;
        }
      }

      op.failure('No service available for mode');
      return false;
    } catch (error) {
      op.failure(error instanceof Error ? error : String(error));
      return false;
    }
  }

  /**
   * Send a notification (always uses bot mode for proactive messages)
   */
  async sendNotification(
    recipient: string,
    templateName: string,
    params: string[],
    languageCode: string = 'en'
  ): Promise<SendMessageResult> {
    const mode = this.config.notificationMode;
    const op = logger.startOperation('sendNotification');

    if (mode === 'bot' && this.cloudApiService?.isReady()) {
      const phone = recipient.replace(/@.*$/, '').replace(/^\+/, '');
      const result = await this.cloudApiService.sendTemplateMessage(
        phone,
        templateName,
        languageCode,
        params
      );

      if (result.success) {
        op.success('Notification sent via Cloud API', {
          recipient: phone,
          template: templateName,
          messageId: result.messageId,
        });
      } else {
        op.failure(result.error || 'Template send failed');
      }

      return result;
    }

    if (mode === 'personal' && this.baileysService?.isReady()) {
      // Fallback: send as regular message via Baileys
      // (Can't use templates with Baileys)
      const jid = recipient.includes('@') ? recipient : `${recipient}@s.whatsapp.net`;
      const text = `📬 ${params.join(' ')}`;

      try {
        await this.baileysService.sendMessage(jid, text);
        op.success('Notification sent via Baileys (as text)', { recipient: jid });
        return { messageId: `baileys_${Date.now()}`, success: true };
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        op.failure(errorMsg);
        return { messageId: '', success: false, error: errorMsg };
      }
    }

    const error = 'No notification channel available';
    op.failure(error);
    return { messageId: '', success: false, error };
  }

  /**
   * Send a reminder notification
   */
  async sendReminder(recipient: string, name: string, message: string): Promise<SendMessageResult> {
    if (this.cloudApiService?.isReady()) {
      return this.cloudApiService.sendReminder(recipient, name, message);
    }

    // Fallback to Baileys
    return this.sendNotification(recipient, 'reminder', [name, message]);
  }

  /**
   * Send an SLA alert notification
   */
  async sendSlaAlert(
    recipient: string,
    issueKey: string,
    status: string,
    days: number
  ): Promise<SendMessageResult> {
    if (this.cloudApiService?.isReady()) {
      return this.cloudApiService.sendSlaAlert(recipient, issueKey, status, String(days));
    }

    return this.sendNotification(recipient, 'sla_alert', [issueKey, status, String(days)]);
  }

  /**
   * Send a daily digest notification
   */
  async sendDailyDigest(recipient: string, summary: string): Promise<SendMessageResult> {
    if (this.cloudApiService?.isReady()) {
      return this.cloudApiService.sendDailyDigest(recipient, summary);
    }

    return this.sendNotification(recipient, 'daily_digest', [summary]);
  }

  /**
   * Set a per-chat mode override
   */
  setChannelOverride(chatId: string, mode: WhatsAppMode): void {
    this.channelOverrides.set(chatId, mode);
    logger.info('Channel override set', { chatId, mode });
  }

  /**
   * Remove a per-chat mode override
   */
  removeChannelOverride(chatId: string): void {
    this.channelOverrides.delete(chatId);
    logger.info('Channel override removed', { chatId });
  }

  /**
   * Get the current mode for a chat
   */
  getChannelMode(chatId: string): WhatsAppMode {
    return this.getMode(chatId);
  }

  /**
   * Get status of all channels
   */
  getStatus(): {
    personal: { available: boolean; ready: boolean };
    bot: { available: boolean; ready: boolean };
    defaultMode: WhatsAppMode;
    notificationMode: WhatsAppMode;
  } {
    return {
      personal: {
        available: this.baileysService !== null,
        ready: this.baileysService?.isReady() ?? false,
      },
      bot: {
        available: this.cloudApiService !== null,
        ready: this.cloudApiService?.isReady() ?? false,
      },
      defaultMode: this.config.defaultMode,
      notificationMode: this.config.notificationMode,
    };
  }
}

/**
 * Create a WhatsApp message router
 */
export function createWhatsAppMessageRouter(config: MessageRouterConfig): WhatsAppMessageRouter {
  return new WhatsAppMessageRouter(config);
}
