/**
 * Notification Service
 *
 * Handles proactive notifications across multiple channels:
 * - Reminders (scheduled and immediate)
 * - SLA breach alerts
 * - Daily digests
 * - Status updates
 *
 * Exported via @orient-bot/agents package.
 *
 * Uses the WhatsApp Message Router to deliver via the appropriate channel
 * (Cloud API for proactive notifications, Baileys as fallback).
 */

import { EventEmitter } from 'events';
import { WhatsAppMessageRouter, SendMessageResult } from '@orient-bot/bot-whatsapp';
import { createDedicatedServiceLogger, type NotificationConfig } from '@orient-bot/core';

const logger = createDedicatedServiceLogger('notification', {
  maxSize: '20m',
  maxDays: '14d',
  compress: true,
});

// =============================================================================
// Types
// =============================================================================

export type NotificationChannel = 'whatsapp' | 'slack';
export type NotificationPriority = 'low' | 'normal' | 'high' | 'urgent';

export interface ScheduledReminder {
  id: string;
  recipient: string;
  channel: NotificationChannel;
  message: string;
  scheduledFor: Date;
  createdAt: Date;
  priority: NotificationPriority;
  metadata?: Record<string, unknown>;
}

export interface NotificationResult {
  success: boolean;
  messageId?: string;
  channel: NotificationChannel;
  error?: string;
  timestamp: Date;
}

export interface SlaBreachInfo {
  issueKey: string;
  issueSummary: string;
  status: string;
  daysInStatus: number;
  maxAllowedDays: number;
  assigneePhone?: string;
  assigneeName?: string;
}

export interface DigestItem {
  type: 'in_progress' | 'blocked' | 'completed' | 'new' | 'sla_warning';
  issueKey: string;
  summary: string;
  status?: string;
  assignee?: string;
}

export interface DailyDigestData {
  date: Date;
  inProgressCount: number;
  blockedCount: number;
  completedYesterday: number;
  newToday: number;
  slaWarnings: number;
  items: DigestItem[];
  highlights?: string[];
}

// =============================================================================
// Notification Service Implementation
// =============================================================================

export class NotificationService extends EventEmitter {
  private config: NotificationConfig;
  private whatsappRouter: WhatsAppMessageRouter | null = null;
  private scheduledReminders: Map<string, ScheduledReminder> = new Map();
  private reminderTimers: Map<string, NodeJS.Timeout> = new Map();

  constructor(config: NotificationConfig) {
    super();
    this.config = config;
  }

  /**
   * Attach the WhatsApp message router
   */
  attachWhatsAppRouter(router: WhatsAppMessageRouter): void {
    this.whatsappRouter = router;
    logger.info('WhatsApp router attached to notification service');
  }

  /**
   * Check if notifications are enabled
   */
  isEnabled(): boolean {
    return this.config.enabled;
  }

  /**
   * Send an immediate reminder
   */
  async sendReminder(
    recipient: string,
    message: string,
    channel: NotificationChannel = 'whatsapp'
  ): Promise<NotificationResult> {
    if (!this.config.enabled || !this.config.reminders?.enabled) {
      return {
        success: false,
        channel,
        error: 'Reminders are disabled',
        timestamp: new Date(),
      };
    }

    const op = logger.startOperation('sendReminder');

    if (channel === 'whatsapp' && this.whatsappRouter) {
      const result = await this.whatsappRouter.sendReminder(recipient, 'You', message);

      if (result.success) {
        op.success('Reminder sent', { recipient, channel });
      } else {
        op.failure(result.error || 'Failed to send reminder');
      }

      return {
        success: result.success,
        messageId: result.messageId,
        channel,
        error: result.error,
        timestamp: new Date(),
      };
    }

    // TODO: Add Slack support
    if (channel === 'slack') {
      op.failure('Slack notifications not yet implemented');
      return {
        success: false,
        channel,
        error: 'Slack notifications not yet implemented',
        timestamp: new Date(),
      };
    }

    op.failure('No notification channel available');
    return {
      success: false,
      channel,
      error: 'No notification channel available',
      timestamp: new Date(),
    };
  }

  /**
   * Schedule a reminder for later
   */
  scheduleReminder(
    recipient: string,
    message: string,
    scheduledFor: Date,
    channel: NotificationChannel = 'whatsapp',
    priority: NotificationPriority = 'normal',
    metadata?: Record<string, unknown>
  ): string {
    const id = `reminder_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    const reminder: ScheduledReminder = {
      id,
      recipient,
      channel,
      message,
      scheduledFor,
      createdAt: new Date(),
      priority,
      metadata,
    };

    this.scheduledReminders.set(id, reminder);

    // Calculate delay until scheduled time
    const delay = scheduledFor.getTime() - Date.now();

    if (delay <= 0) {
      // Send immediately if time has passed
      this.executeReminder(id);
    } else {
      // Schedule for later
      const timer = setTimeout(() => {
        this.executeReminder(id);
      }, delay);

      this.reminderTimers.set(id, timer);
    }

    logger.info('Reminder scheduled', {
      id,
      recipient,
      scheduledFor: scheduledFor.toISOString(),
      delayMs: Math.max(0, delay),
    });

    return id;
  }

  /**
   * Execute a scheduled reminder
   */
  private async executeReminder(id: string): Promise<void> {
    const reminder = this.scheduledReminders.get(id);
    if (!reminder) {
      logger.warn('Reminder not found', { id });
      return;
    }

    // Clean up
    this.scheduledReminders.delete(id);
    this.reminderTimers.delete(id);

    // Send the reminder
    const result = await this.sendReminder(reminder.recipient, reminder.message, reminder.channel);

    // Emit event for tracking
    this.emit('reminder_sent', {
      reminder,
      result,
    });
  }

  /**
   * Cancel a scheduled reminder
   */
  cancelReminder(id: string): boolean {
    const reminder = this.scheduledReminders.get(id);
    if (!reminder) {
      return false;
    }

    const timer = this.reminderTimers.get(id);
    if (timer) {
      clearTimeout(timer);
      this.reminderTimers.delete(id);
    }

    this.scheduledReminders.delete(id);
    logger.info('Reminder cancelled', { id });

    return true;
  }

  /**
   * Get all pending reminders
   */
  getPendingReminders(): ScheduledReminder[] {
    return Array.from(this.scheduledReminders.values());
  }

  /**
   * Send an SLA breach alert
   */
  async sendSlaAlert(
    recipient: string,
    breach: SlaBreachInfo,
    channel: NotificationChannel = 'whatsapp'
  ): Promise<NotificationResult> {
    if (!this.config.enabled || !this.config.slaAlerts?.enabled) {
      return {
        success: false,
        channel,
        error: 'SLA alerts are disabled',
        timestamp: new Date(),
      };
    }

    const op = logger.startOperation('sendSlaAlert');

    if (channel === 'whatsapp' && this.whatsappRouter) {
      const result = await this.whatsappRouter.sendSlaAlert(
        recipient,
        breach.issueKey,
        breach.status,
        breach.daysInStatus
      );

      if (result.success) {
        op.success('SLA alert sent', {
          recipient,
          issueKey: breach.issueKey,
          daysInStatus: breach.daysInStatus,
        });
      } else {
        op.failure(result.error || 'Failed to send SLA alert');
      }

      return {
        success: result.success,
        messageId: result.messageId,
        channel,
        error: result.error,
        timestamp: new Date(),
      };
    }

    op.failure('No notification channel available');
    return {
      success: false,
      channel,
      error: 'No notification channel available',
      timestamp: new Date(),
    };
  }

  /**
   * Send multiple SLA breach alerts
   */
  async sendSlaAlerts(
    recipient: string,
    breaches: SlaBreachInfo[],
    channel: NotificationChannel = 'whatsapp'
  ): Promise<NotificationResult[]> {
    const results: NotificationResult[] = [];

    for (const breach of breaches) {
      const result = await this.sendSlaAlert(recipient, breach, channel);
      results.push(result);

      // Small delay between alerts to avoid rate limiting
      await new Promise((resolve) => setTimeout(resolve, 500));
    }

    return results;
  }

  /**
   * Send a daily digest
   */
  async sendDailyDigest(
    recipient: string,
    data: DailyDigestData,
    channel: NotificationChannel = 'whatsapp'
  ): Promise<NotificationResult> {
    if (!this.config.enabled || !this.config.dailyDigest?.enabled) {
      return {
        success: false,
        channel,
        error: 'Daily digest is disabled',
        timestamp: new Date(),
      };
    }

    const op = logger.startOperation('sendDailyDigest');

    // Format the digest summary
    const summary = this.formatDigestSummary(data);

    if (channel === 'whatsapp' && this.whatsappRouter) {
      const result = await this.whatsappRouter.sendDailyDigest(recipient, summary);

      if (result.success) {
        op.success('Daily digest sent', {
          recipient,
          inProgress: data.inProgressCount,
          blocked: data.blockedCount,
        });
      } else {
        op.failure(result.error || 'Failed to send daily digest');
      }

      return {
        success: result.success,
        messageId: result.messageId,
        channel,
        error: result.error,
        timestamp: new Date(),
      };
    }

    op.failure('No notification channel available');
    return {
      success: false,
      channel,
      error: 'No notification channel available',
      timestamp: new Date(),
    };
  }

  /**
   * Format digest data into a summary string
   */
  private formatDigestSummary(data: DailyDigestData): string {
    const parts: string[] = [];

    // Main stats
    parts.push(`📊 ${data.inProgressCount} in progress`);

    if (data.blockedCount > 0) {
      parts.push(`🚧 ${data.blockedCount} blocked`);
    }

    if (data.completedYesterday > 0) {
      parts.push(`✅ ${data.completedYesterday} completed yesterday`);
    }

    if (data.newToday > 0) {
      parts.push(`🆕 ${data.newToday} new today`);
    }

    if (data.slaWarnings > 0) {
      parts.push(`⚠️ ${data.slaWarnings} SLA warnings`);
    }

    // Add highlights if present
    if (data.highlights && data.highlights.length > 0) {
      parts.push('');
      parts.push('Key items:');
      for (const highlight of data.highlights.slice(0, 3)) {
        parts.push(`• ${highlight}`);
      }
    }

    return parts.join('\n');
  }

  /**
   * Send a custom notification
   */
  async sendCustomNotification(
    recipient: string,
    message: string,
    channel: NotificationChannel = 'whatsapp'
  ): Promise<NotificationResult> {
    if (!this.config.enabled) {
      return {
        success: false,
        channel,
        error: 'Notifications are disabled',
        timestamp: new Date(),
      };
    }

    const op = logger.startOperation('sendCustomNotification');

    if (channel === 'whatsapp' && this.whatsappRouter) {
      // Use regular message sending (not template) for custom notifications
      const success = await this.whatsappRouter.sendMessage(recipient, message, {
        mode: 'bot',
      });

      if (success) {
        op.success('Custom notification sent', { recipient, channel });
        return {
          success: true,
          channel,
          timestamp: new Date(),
        };
      } else {
        op.failure('Failed to send custom notification');
        return {
          success: false,
          channel,
          error: 'Failed to send notification',
          timestamp: new Date(),
        };
      }
    }

    op.failure('No notification channel available');
    return {
      success: false,
      channel,
      error: 'No notification channel available',
      timestamp: new Date(),
    };
  }

  /**
   * Get notification service status
   */
  getStatus(): {
    enabled: boolean;
    remindersEnabled: boolean;
    slaAlertsEnabled: boolean;
    dailyDigestEnabled: boolean;
    pendingReminders: number;
    whatsappAvailable: boolean;
  } {
    const routerStatus = this.whatsappRouter?.getStatus();

    return {
      enabled: this.config.enabled,
      remindersEnabled: this.config.reminders?.enabled ?? true,
      slaAlertsEnabled: this.config.slaAlerts?.enabled ?? true,
      dailyDigestEnabled: this.config.dailyDigest?.enabled ?? true,
      pendingReminders: this.scheduledReminders.size,
      whatsappAvailable: routerStatus?.bot?.ready || routerStatus?.personal?.ready || false,
    };
  }

  /**
   * Clean up resources
   */
  destroy(): void {
    // Cancel all pending reminders
    for (const timer of this.reminderTimers.values()) {
      clearTimeout(timer);
    }
    this.reminderTimers.clear();
    this.scheduledReminders.clear();

    logger.info('Notification service destroyed');
  }
}

/**
 * Create a notification service
 */
export function createNotificationService(config: NotificationConfig): NotificationService {
  return new NotificationService(config);
}
