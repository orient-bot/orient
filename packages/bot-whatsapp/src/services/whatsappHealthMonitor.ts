/**
 * WhatsApp Health Monitor Service
 *
 * Monitors the WhatsApp Baileys connection health and automatically
 * requests a pairing code when the connection is unhealthy.
 * Sends notifications via Slack DM when pairing is needed.
 *
 * Guards against flooding WhatsApp with pairing requests:
 * - Cooldown period after each pairing request (4 hours default)
 * - Skips health checks while waiting for user to pair
 * - Tracks pairing state to prevent duplicate requests
 * - Persists state to database for recovery after restarts
 *
 * Exported via @orient/bot-whatsapp package.
 */

import { EventEmitter } from 'events';
import { WebClient } from '@slack/web-api';
import { WhatsAppService } from './whatsappService.js';
import { MessageDatabase } from '@orient/database-services';
import { createDedicatedServiceLogger } from '@orient/core';

const logger = createDedicatedServiceLogger('whatsapp-health', {
  maxSize: '10m',
  maxDays: '14d',
  compress: true,
});

// =============================================================================
// Constants
// =============================================================================

/** Default cooldown after requesting pairing (4 hours) */
const DEFAULT_PAIRING_COOLDOWN_MS = 4 * 60 * 60 * 1000;

/** Maximum time to wait for pairing before allowing retry (8 hours) */
const MAX_PAIRING_WAIT_MS = 8 * 60 * 60 * 1000;

/** Database keys for persisted state */
const DB_KEY_PAIRING_STATE = 'pairing_state';
const DB_KEY_LAST_PAIRING_REQUEST = 'last_pairing_request_time';
const DB_KEY_CONSECUTIVE_FAILURES = 'consecutive_failures';

// =============================================================================
// Types
// =============================================================================

export interface HealthMonitorConfig {
  /** Enable health monitoring */
  enabled: boolean;
  /** Health check interval in milliseconds (default: 5 minutes) */
  intervalMs: number;
  /** Number of consecutive failures before triggering pairing (default: 2) */
  failureThreshold: number;
  /** Slack user ID to send DM notifications to */
  slackUserId: string;
  /** Admin phone number for pairing code request */
  adminPhone: string;
  /** Cooldown period after requesting pairing before allowing another request (default: 4 hours) */
  pairingCooldownMs?: number;
}

export type PairingState =
  | 'idle' // Normal operation, not waiting for pairing
  | 'pairing_requested' // Pairing code sent, waiting for user to pair
  | 'cooldown'; // In cooldown period after pairing attempt

export interface HealthStatus {
  isHealthy: boolean;
  consecutiveFailures: number;
  lastCheckTime: Date | null;
  lastHealthyTime: Date | null;
  pairingState: PairingState;
  lastPairingRequestTime: Date | null;
  /** Time remaining in cooldown (ms), 0 if not in cooldown */
  cooldownRemainingMs: number;
}

export interface HealthMonitorEvents {
  health_check: (status: HealthStatus) => void;
  unhealthy: (consecutiveFailures: number) => void;
  pairing_requested: (code: string) => void;
  pairing_notification_sent: (slackUserId: string) => void;
  healthy: () => void;
  error: (error: Error) => void;
  pairing_skipped: (reason: string) => void;
}

// =============================================================================
// Health Monitor Service
// =============================================================================

export class WhatsAppHealthMonitor extends EventEmitter {
  private config: HealthMonitorConfig;
  private whatsappService: WhatsAppService;
  private slackClient: WebClient | null;
  private database: MessageDatabase | null;

  private checkInterval: NodeJS.Timeout | null = null;
  private consecutiveFailures: number = 0;
  private lastCheckTime: Date | null = null;
  private lastHealthyTime: Date | null = null;
  private isRunning: boolean = false;

  // Pairing state management
  private pairingState: PairingState = 'idle';
  private lastPairingRequestTime: Date | null = null;
  private pairingCooldownMs: number;

  constructor(
    config: HealthMonitorConfig,
    whatsappService: WhatsAppService,
    slackClient: WebClient | null,
    database: MessageDatabase | null = null
  ) {
    super();
    this.config = config;
    this.whatsappService = whatsappService;
    this.slackClient = slackClient;
    this.database = database;
    this.pairingCooldownMs = config.pairingCooldownMs ?? DEFAULT_PAIRING_COOLDOWN_MS;

    logger.info('WhatsApp Health Monitor initialized', {
      enabled: config.enabled,
      intervalMs: config.intervalMs,
      failureThreshold: config.failureThreshold,
      pairingCooldownMs: this.pairingCooldownMs,
      pairingCooldownHours: Math.round((this.pairingCooldownMs / (60 * 60 * 1000)) * 10) / 10,
      hasDatabase: !!database,
      slackUserId: config.slackUserId ? `${config.slackUserId.substring(0, 4)}...` : 'NOT SET',
    });
  }

  /**
   * Load persisted state from database
   */
  private async loadPersistedState(): Promise<void> {
    if (!this.database) {
      logger.debug('No database configured, skipping state load');
      return;
    }

    try {
      const state = await this.database.getAllHealthMonitorState();

      if (state[DB_KEY_PAIRING_STATE]) {
        this.pairingState = state[DB_KEY_PAIRING_STATE] as PairingState;
      }

      if (state[DB_KEY_LAST_PAIRING_REQUEST]) {
        const lastReq = state[DB_KEY_LAST_PAIRING_REQUEST];
        if (typeof lastReq === 'string' || typeof lastReq === 'number') {
          this.lastPairingRequestTime = new Date(lastReq);
        }
      }

      if (state[DB_KEY_CONSECUTIVE_FAILURES]) {
        const failures = state[DB_KEY_CONSECUTIVE_FAILURES];
        if (typeof failures === 'string' || typeof failures === 'number') {
          this.consecutiveFailures = parseInt(String(failures), 10) || 0;
        }
      }

      logger.info('Loaded persisted health monitor state', {
        pairingState: this.pairingState,
        lastPairingRequestTime: this.lastPairingRequestTime?.toISOString(),
        consecutiveFailures: this.consecutiveFailures,
      });
    } catch (error) {
      logger.warn('Failed to load persisted state, starting fresh', {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  /**
   * Save state to database
   */
  private async persistState(): Promise<void> {
    if (!this.database) return;

    try {
      await this.database.setHealthMonitorState(DB_KEY_PAIRING_STATE, this.pairingState);

      if (this.lastPairingRequestTime) {
        await this.database.setHealthMonitorState(
          DB_KEY_LAST_PAIRING_REQUEST,
          this.lastPairingRequestTime.toISOString()
        );
      } else {
        await this.database.deleteHealthMonitorState(DB_KEY_LAST_PAIRING_REQUEST);
      }

      await this.database.setHealthMonitorState(
        DB_KEY_CONSECUTIVE_FAILURES,
        String(this.consecutiveFailures)
      );
    } catch (error) {
      logger.warn('Failed to persist state', {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  /**
   * Start the health monitoring loop
   */
  async start(): Promise<void> {
    if (!this.config.enabled) {
      logger.info('Health monitor is disabled');
      return;
    }

    if (this.isRunning) {
      logger.warn('Health monitor is already running');
      return;
    }

    // Load any persisted state from previous run
    await this.loadPersistedState();

    logger.info('Starting health monitor', {
      intervalMs: this.config.intervalMs,
      failureThreshold: this.config.failureThreshold,
      pairingCooldownHours: Math.round((this.pairingCooldownMs / (60 * 60 * 1000)) * 10) / 10,
    });

    this.isRunning = true;

    // Run first check after a short delay (let services initialize)
    setTimeout(() => {
      this.runHealthCheck();
    }, 10000); // 10 second initial delay

    // Set up periodic checks
    this.checkInterval = setInterval(() => {
      this.runHealthCheck();
    }, this.config.intervalMs);

    logger.info('Health monitor started');
  }

  /**
   * Stop the health monitoring loop
   */
  stop(): void {
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
      this.checkInterval = null;
    }
    this.isRunning = false;
    logger.info('Health monitor stopped');
  }

  /**
   * Calculate remaining cooldown time in milliseconds
   */
  private getCooldownRemainingMs(): number {
    if (!this.lastPairingRequestTime) return 0;

    const elapsed = Date.now() - this.lastPairingRequestTime.getTime();
    const remaining = this.pairingCooldownMs - elapsed;

    return Math.max(0, remaining);
  }

  /**
   * Check if we're currently in cooldown period
   */
  private isInCooldown(): boolean {
    return this.getCooldownRemainingMs() > 0;
  }

  /**
   * Check if we've been waiting too long for pairing (user didn't complete it)
   */
  private isPairingTimedOut(): boolean {
    if (!this.lastPairingRequestTime) return false;

    const elapsed = Date.now() - this.lastPairingRequestTime.getTime();
    return elapsed > MAX_PAIRING_WAIT_MS;
  }

  /**
   * Update pairing state based on current conditions
   */
  private async updatePairingState(): Promise<void> {
    const previousState = this.pairingState;

    // If connection is healthy, reset to idle
    if (this.whatsappService.isReady()) {
      if (this.pairingState !== 'idle') {
        logger.info('Connection restored, resetting pairing state to idle');
        this.pairingState = 'idle';
        this.consecutiveFailures = 0;
        await this.persistState();
      }
      return;
    }

    // If we timed out waiting for pairing, reset to idle to allow retry
    if (this.pairingState === 'pairing_requested' && this.isPairingTimedOut()) {
      logger.warn('Pairing wait timeout exceeded, resetting state to allow retry', {
        maxWaitMs: MAX_PAIRING_WAIT_MS,
        maxWaitHours: Math.round((MAX_PAIRING_WAIT_MS / (60 * 60 * 1000)) * 10) / 10,
      });
      this.pairingState = 'idle';
      await this.persistState();
      return;
    }

    // If we're in cooldown, check if it's expired
    if (this.pairingState === 'cooldown' && !this.isInCooldown()) {
      logger.info('Cooldown period expired, state now idle');
      this.pairingState = 'idle';
      await this.persistState();
      return;
    }

    // Persist if state changed
    if (previousState !== this.pairingState) {
      await this.persistState();
    }
  }

  /**
   * Get the current health status
   */
  getStatus(): HealthStatus {
    // Don't await here to keep it sync for status checks
    this.updatePairingState().catch((e) =>
      logger.warn('Failed to update state', { error: String(e) })
    );

    return {
      isHealthy: this.whatsappService.isReady(),
      consecutiveFailures: this.consecutiveFailures,
      lastCheckTime: this.lastCheckTime,
      lastHealthyTime: this.lastHealthyTime,
      pairingState: this.pairingState,
      lastPairingRequestTime: this.lastPairingRequestTime,
      cooldownRemainingMs: this.getCooldownRemainingMs(),
    };
  }

  /**
   * Run a single health check
   */
  private async runHealthCheck(): Promise<void> {
    const op = logger.startOperation('healthCheck');
    this.lastCheckTime = new Date();

    // Update pairing state first
    await this.updatePairingState();

    try {
      const isHealthy = this.whatsappService.isReady();

      if (isHealthy) {
        // Connection is healthy
        if (this.consecutiveFailures > 0 || this.pairingState !== 'idle') {
          logger.info('Connection recovered', {
            previousFailures: this.consecutiveFailures,
            previousPairingState: this.pairingState,
          });
        }

        this.consecutiveFailures = 0;
        this.lastHealthyTime = new Date();
        this.pairingState = 'idle';
        await this.persistState();

        this.emit('healthy');
        this.emit('health_check', this.getStatus());
        op.success('Connection healthy');
        return;
      }

      // Connection is unhealthy - but check if we should skip counting
      if (this.pairingState === 'pairing_requested') {
        // We've already requested pairing, just waiting for user
        const timeSince = this.lastPairingRequestTime
          ? Math.round((Date.now() - this.lastPairingRequestTime.getTime()) / 60000)
          : 0;
        logger.debug('Connection unhealthy, but waiting for user to complete pairing', {
          timeSincePairingRequestMinutes: timeSince,
          maxWaitHours: Math.round((MAX_PAIRING_WAIT_MS / (60 * 60 * 1000)) * 10) / 10,
        });
        this.emit('pairing_skipped', 'waiting_for_user');
        op.success('Skipped - waiting for pairing');
        return;
      }

      if (this.pairingState === 'cooldown') {
        // In cooldown, don't trigger pairing
        const remainingMs = this.getCooldownRemainingMs();
        const remainingHours = Math.round((remainingMs / (60 * 60 * 1000)) * 10) / 10;
        logger.debug('Connection unhealthy, but in cooldown period', {
          cooldownRemainingMs: remainingMs,
          cooldownRemainingHours: remainingHours,
        });
        this.emit('pairing_skipped', 'cooldown');
        op.success('Skipped - in cooldown');
        return;
      }

      // Normal unhealthy state - count failures
      this.consecutiveFailures++;
      await this.persistState();

      logger.warn('Connection unhealthy', {
        consecutiveFailures: this.consecutiveFailures,
        threshold: this.config.failureThreshold,
        pairingState: this.pairingState,
      });

      this.emit('unhealthy', this.consecutiveFailures);
      this.emit('health_check', this.getStatus());

      // Check if we should trigger pairing
      if (this.consecutiveFailures >= this.config.failureThreshold) {
        await this.triggerPairing();
      }

      op.success('Connection unhealthy', { failures: this.consecutiveFailures });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error('Health check failed', { error: errorMessage });
      this.emit('error', error instanceof Error ? error : new Error(errorMessage));
      op.failure(error instanceof Error ? error : errorMessage);
    }
  }

  /**
   * Trigger the pairing process
   */
  private async triggerPairing(): Promise<void> {
    // Double-check guards before proceeding
    if (this.pairingState !== 'idle') {
      logger.warn('Pairing requested but not in idle state, skipping', {
        currentState: this.pairingState,
      });
      return;
    }

    if (this.isInCooldown()) {
      const remainingHours =
        Math.round((this.getCooldownRemainingMs() / (60 * 60 * 1000)) * 10) / 10;
      logger.warn('Pairing requested but still in cooldown, skipping', {
        cooldownRemainingHours: remainingHours,
      });
      return;
    }

    const op = logger.startOperation('triggerPairing');

    // Set state immediately to prevent concurrent triggers
    this.pairingState = 'pairing_requested';
    this.lastPairingRequestTime = new Date();
    await this.persistState();

    try {
      logger.info('Triggering automatic pairing process');

      // Step 1: Disconnect and flush session
      logger.info('Disconnecting and flushing session...');
      await this.whatsappService.disconnect();

      // Small delay before reconnecting
      await new Promise((resolve) => setTimeout(resolve, 2000));

      // Step 2: Reconnect to initialize socket
      logger.info('Reconnecting to initialize socket...');
      await this.whatsappService.connect();

      // Small delay for socket to initialize
      await new Promise((resolve) => setTimeout(resolve, 3000));

      // Step 3: Request pairing code
      logger.info('Requesting pairing code...');
      const code = await this.whatsappService.requestPairingCode(this.config.adminPhone);

      // Format code with dash (ABCD-1234)
      const formattedCode =
        code.length === 8 ? `${code.substring(0, 4)}-${code.substring(4)}` : code;

      const maxWaitHours = Math.round((MAX_PAIRING_WAIT_MS / (60 * 60 * 1000)) * 10) / 10;
      logger.info('Pairing code generated successfully', {
        codeLength: code.length,
        formatted: formattedCode,
        nextCheckIn: `${this.config.intervalMs / 1000}s`,
        willSkipChecksUntil: `connection restored or ${maxWaitHours}h timeout`,
      });

      this.emit('pairing_requested', formattedCode);

      // Step 4: Send Slack notification
      await this.sendSlackNotification(formattedCode);

      op.success('Pairing triggered successfully');
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error('Failed to trigger pairing', { error: errorMessage });
      this.emit('error', error instanceof Error ? error : new Error(errorMessage));

      // Move to cooldown state to prevent immediate retry
      this.pairingState = 'cooldown';
      const cooldownHours = Math.round((this.pairingCooldownMs / (60 * 60 * 1000)) * 10) / 10;
      logger.info('Entering cooldown after failed pairing attempt', {
        cooldownHours,
      });
      await this.persistState();

      op.failure(error instanceof Error ? error : errorMessage);
    }
  }

  /**
   * Send a Slack DM notification with the pairing code
   */
  private async sendSlackNotification(pairingCode: string): Promise<void> {
    if (!this.slackClient) {
      logger.warn('No Slack client configured - cannot send pairing notification');
      return;
    }

    if (!this.config.slackUserId) {
      logger.warn('No Slack user ID configured - cannot send pairing notification');
      return;
    }

    const op = logger.startOperation('sendSlackNotification');

    try {
      // Open a DM conversation with the user
      const conversationResult = await this.slackClient.conversations.open({
        users: this.config.slackUserId,
      });

      if (!conversationResult.ok || !conversationResult.channel?.id) {
        throw new Error('Failed to open DM conversation with user');
      }

      const channelId = conversationResult.channel.id;
      const maxWaitHours = Math.round(MAX_PAIRING_WAIT_MS / (60 * 60 * 1000));

      // Send the notification message
      const message = `:warning: *WhatsApp Connection Lost*

The WhatsApp bot connection is unhealthy and needs re-pairing.

*Pairing Code:* \`${pairingCode}\`

*Steps to pair:*
1. Open WhatsApp on your phone
2. Go to Settings → Linked Devices
3. Tap "Link a Device"
4. Enter the code above

_This code expires in a few minutes. The health monitor will wait up to ${maxWaitHours} hours for you to pair before requesting a new code._`;

      const sendResult = await this.slackClient.chat.postMessage({
        channel: channelId,
        text: message,
        mrkdwn: true,
      });

      if (!sendResult.ok) {
        throw new Error('Failed to send Slack message');
      }

      logger.info('Slack notification sent', {
        userId: this.config.slackUserId,
        channelId,
        ts: sendResult.ts,
      });

      this.emit('pairing_notification_sent', this.config.slackUserId);
      op.success('Notification sent');
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error('Failed to send Slack notification', { error: errorMessage });
      this.emit('error', error instanceof Error ? error : new Error(errorMessage));
      op.failure(error instanceof Error ? error : errorMessage);
    }
  }

  /**
   * Force a health check (for manual triggering)
   */
  async forceCheck(): Promise<HealthStatus> {
    await this.runHealthCheck();
    return this.getStatus();
  }

  /**
   * Force trigger pairing (for manual triggering)
   * Resets state to allow immediate pairing attempt
   */
  async forcePairing(): Promise<void> {
    logger.info('Force pairing requested, resetting state');
    this.pairingState = 'idle';
    this.lastPairingRequestTime = null;
    await this.persistState();
    await this.triggerPairing();
  }

  /**
   * Reset the monitor state (useful after manual intervention)
   */
  async reset(): Promise<void> {
    logger.info('Resetting health monitor state');
    this.pairingState = 'idle';
    this.lastPairingRequestTime = null;
    this.consecutiveFailures = 0;
    await this.persistState();
  }
}

// =============================================================================
// Factory Function
// =============================================================================

export function createWhatsAppHealthMonitor(
  config: HealthMonitorConfig,
  whatsappService: WhatsAppService,
  slackClient: WebClient | null,
  database: MessageDatabase | null = null
): WhatsAppHealthMonitor {
  return new WhatsAppHealthMonitor(config, whatsappService, slackClient, database);
}
