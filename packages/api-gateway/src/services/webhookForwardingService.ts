/**
 * Webhook Forwarding Service
 *
 * Enables forwarding of production webhooks to local development environments.
 *
 * Features:
 * - TTL-based auto-expiration of forwarding registrations
 * - Circuit breaker to stop forwarding to failing endpoints
 *
 * Exported via @orientbot/database-services package.
 * - Heartbeat-based renewal for active dev sessions
 * - Fire-and-forget forwarding (never blocks production)
 * - Shared secret authentication for registrations
 *
 * Usage:
 * 1. Production: Receives webhooks and forwards copies to registered dev URLs
 * 2. Local Dev: Registers its ngrok URL with production, sends heartbeats
 */

import { createDedicatedServiceLogger } from '@orientbot/core';

const logger = createDedicatedServiceLogger('webhook-forwarding', {
  maxSize: '10m',
  maxDays: '7d',
  compress: true,
});

// =============================================================================
// Types
// =============================================================================

export interface ForwardingTarget {
  /** Unique ID for this registration */
  id: string;
  /** The URL to forward webhooks to */
  url: string;
  /** When this registration was created */
  registeredAt: Date;
  /** When this registration expires */
  expiresAt: Date;
  /** Optional description (e.g., "Tom's local dev") */
  description?: string;
  /** Number of consecutive failures */
  failureCount: number;
  /** Last successful forward */
  lastSuccessAt?: Date;
  /** Last failure */
  lastFailureAt?: Date;
  /** Whether this target is currently in circuit-open state */
  circuitOpen: boolean;
  /** When the circuit was opened */
  circuitOpenedAt?: Date;
}

export interface ForwardingServiceConfig {
  /** Shared secret for authenticating registration requests */
  sharedSecret: string;
  /** Default TTL for registrations in seconds (default: 30 minutes) */
  defaultTtlSeconds: number;
  /** Maximum TTL for registrations in seconds (default: 4 hours) */
  maxTtlSeconds: number;
  /** Number of failures before opening circuit (default: 5) */
  circuitBreakerThreshold: number;
  /** Time to wait before retrying after circuit opens (default: 60 seconds) */
  circuitResetSeconds: number;
  /** Timeout for forwarding requests in ms (default: 5000) */
  forwardTimeoutMs: number;
  /** Maximum number of registered targets (default: 5) */
  maxTargets: number;
}

export interface RegisterRequest {
  /** The URL to forward webhooks to */
  url: string;
  /** TTL in seconds (optional, uses default if not specified) */
  ttlSeconds?: number;
  /** Optional description */
  description?: string;
}

export interface RegisterResponse {
  success: boolean;
  id?: string;
  expiresAt?: Date;
  error?: string;
}

export interface ForwardResult {
  targetId: string;
  url: string;
  success: boolean;
  statusCode?: number;
  durationMs: number;
  error?: string;
}

// =============================================================================
// Default Configuration
// =============================================================================

const DEFAULT_CONFIG: ForwardingServiceConfig = {
  sharedSecret: process.env.WEBHOOK_FORWARD_SECRET || '',
  defaultTtlSeconds: 30 * 60, // 30 minutes
  maxTtlSeconds: 4 * 60 * 60, // 4 hours
  circuitBreakerThreshold: 5, // 5 failures
  circuitResetSeconds: 60, // 1 minute
  forwardTimeoutMs: 5000, // 5 seconds
  maxTargets: 5, // Max 5 concurrent dev environments
};

// =============================================================================
// Service Implementation
// =============================================================================

export class WebhookForwardingService {
  private config: ForwardingServiceConfig;
  private targets: Map<string, ForwardingTarget> = new Map();
  private cleanupInterval: NodeJS.Timeout | null = null;

  constructor(config: Partial<ForwardingServiceConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };

    // Start cleanup interval
    this.cleanupInterval = setInterval(() => {
      this.cleanupExpiredTargets();
    }, 30000); // Check every 30 seconds
  }

  /**
   * Check if the service is enabled (has a shared secret configured)
   */
  isEnabled(): boolean {
    return this.config.sharedSecret.length >= 16;
  }

  /**
   * Validate the shared secret
   */
  validateSecret(providedSecret: string): boolean {
    if (!this.isEnabled()) return false;
    // Constant-time comparison to prevent timing attacks
    const expected = this.config.sharedSecret;
    if (providedSecret.length !== expected.length) return false;
    let result = 0;
    for (let i = 0; i < expected.length; i++) {
      result |= expected.charCodeAt(i) ^ providedSecret.charCodeAt(i);
    }
    return result === 0;
  }

  /**
   * Register a forwarding target
   */
  register(secret: string, request: RegisterRequest): RegisterResponse {
    // Validate secret
    if (!this.validateSecret(secret)) {
      logger.warn('Registration rejected: invalid secret');
      return { success: false, error: 'Invalid authentication' };
    }

    // Validate URL
    try {
      const url = new URL(request.url);
      if (!['http:', 'https:'].includes(url.protocol)) {
        return { success: false, error: 'URL must be HTTP or HTTPS' };
      }
    } catch {
      return { success: false, error: 'Invalid URL format' };
    }

    // Check max targets
    if (this.targets.size >= this.config.maxTargets) {
      // Remove oldest expired or failing target
      const sortedTargets = Array.from(this.targets.values()).sort((a, b) => {
        // Prioritize removing: expired > circuit open > oldest
        if (a.expiresAt < new Date() && b.expiresAt >= new Date()) return -1;
        if (b.expiresAt < new Date() && a.expiresAt >= new Date()) return 1;
        if (a.circuitOpen && !b.circuitOpen) return -1;
        if (b.circuitOpen && !a.circuitOpen) return 1;
        return a.registeredAt.getTime() - b.registeredAt.getTime();
      });

      if (sortedTargets.length > 0) {
        this.targets.delete(sortedTargets[0].id);
        logger.info('Removed oldest target to make room', { removedId: sortedTargets[0].id });
      } else {
        return { success: false, error: 'Maximum number of targets reached' };
      }
    }

    // Calculate TTL
    let ttlSeconds = request.ttlSeconds || this.config.defaultTtlSeconds;
    ttlSeconds = Math.min(ttlSeconds, this.config.maxTtlSeconds);

    // Generate ID
    const id = `fwd_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    // Create target
    const now = new Date();
    const target: ForwardingTarget = {
      id,
      url: request.url,
      registeredAt: now,
      expiresAt: new Date(now.getTime() + ttlSeconds * 1000),
      description: request.description,
      failureCount: 0,
      circuitOpen: false,
    };

    this.targets.set(id, target);

    logger.info('Registered forwarding target', {
      id,
      url: request.url,
      expiresAt: target.expiresAt.toISOString(),
      description: request.description,
    });

    return {
      success: true,
      id,
      expiresAt: target.expiresAt,
    };
  }

  /**
   * Renew (heartbeat) an existing registration
   */
  renew(secret: string, targetId: string, ttlSeconds?: number): RegisterResponse {
    if (!this.validateSecret(secret)) {
      return { success: false, error: 'Invalid authentication' };
    }

    const target = this.targets.get(targetId);
    if (!target) {
      return { success: false, error: 'Target not found' };
    }

    // Extend expiration
    const newTtl = Math.min(ttlSeconds || this.config.defaultTtlSeconds, this.config.maxTtlSeconds);
    target.expiresAt = new Date(Date.now() + newTtl * 1000);

    // Reset circuit breaker if it was open
    if (target.circuitOpen) {
      target.circuitOpen = false;
      target.failureCount = 0;
      logger.info('Circuit reset via heartbeat', { id: targetId });
    }

    logger.debug('Renewed forwarding target', {
      id: targetId,
      newExpiresAt: target.expiresAt.toISOString(),
    });

    return {
      success: true,
      id: targetId,
      expiresAt: target.expiresAt,
    };
  }

  /**
   * Deregister a forwarding target
   */
  deregister(secret: string, targetId: string): boolean {
    if (!this.validateSecret(secret)) {
      logger.warn('Deregistration rejected: invalid secret');
      return false;
    }

    const existed = this.targets.delete(targetId);
    if (existed) {
      logger.info('Deregistered forwarding target', { id: targetId });
    }
    return existed;
  }

  /**
   * Get all active targets (for status endpoint)
   */
  getActiveTargets(): ForwardingTarget[] {
    const now = new Date();
    return Array.from(this.targets.values()).filter((t) => t.expiresAt > now);
  }

  /**
   * Forward a webhook payload to all registered targets
   * This is fire-and-forget - never blocks the caller
   */
  async forwardWebhook(payload: string, headers: Record<string, string>): Promise<void> {
    const now = new Date();
    const activeTargets = Array.from(this.targets.values()).filter(
      (t) => t.expiresAt > now && !this.isCircuitOpen(t)
    );

    if (activeTargets.length === 0) {
      return; // No targets to forward to
    }

    logger.debug('Forwarding webhook to targets', {
      targetCount: activeTargets.length,
      targetIds: activeTargets.map((t) => t.id),
    });

    // Forward to all targets in parallel, fire-and-forget
    const forwardPromises = activeTargets.map((target) =>
      this.forwardToTarget(target, payload, headers)
    );

    // Don't await - let them complete in background
    Promise.allSettled(forwardPromises).then((results) => {
      const summary = results.map((r, i) => ({
        targetId: activeTargets[i].id,
        status: r.status,
        value: r.status === 'fulfilled' ? r.value : undefined,
      }));

      const successCount = summary.filter((s) => s.value?.success).length;
      if (successCount < activeTargets.length) {
        logger.debug('Webhook forwarding completed with failures', {
          total: activeTargets.length,
          successful: successCount,
        });
      }
    });
  }

  /**
   * Forward to a single target with timeout and error handling
   */
  private async forwardToTarget(
    target: ForwardingTarget,
    payload: string,
    headers: Record<string, string>
  ): Promise<ForwardResult> {
    const startTime = Date.now();

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), this.config.forwardTimeoutMs);

      const response = await fetch(target.url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Forwarded-From': 'production',
          'X-Forward-Target-Id': target.id,
          // Forward relevant headers
          ...(headers['x-hub-signature-256'] && {
            'X-Hub-Signature-256': headers['x-hub-signature-256'],
          }),
        },
        body: payload,
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      const durationMs = Date.now() - startTime;

      if (response.ok) {
        // Success - reset failure count
        target.failureCount = 0;
        target.lastSuccessAt = new Date();

        return {
          targetId: target.id,
          url: target.url,
          success: true,
          statusCode: response.status,
          durationMs,
        };
      } else {
        // HTTP error
        this.recordFailure(target);
        return {
          targetId: target.id,
          url: target.url,
          success: false,
          statusCode: response.status,
          durationMs,
          error: `HTTP ${response.status}`,
        };
      }
    } catch (error) {
      const durationMs = Date.now() - startTime;
      this.recordFailure(target);

      const errorMessage = error instanceof Error ? error.message : String(error);

      // Don't log every failure as error (it's expected when dev is offline)
      logger.debug('Forward failed', {
        targetId: target.id,
        error: errorMessage,
        failureCount: target.failureCount,
      });

      return {
        targetId: target.id,
        url: target.url,
        success: false,
        durationMs,
        error: errorMessage,
      };
    }
  }

  /**
   * Record a failure and potentially open the circuit
   */
  private recordFailure(target: ForwardingTarget): void {
    target.failureCount++;
    target.lastFailureAt = new Date();

    if (target.failureCount >= this.config.circuitBreakerThreshold) {
      target.circuitOpen = true;
      target.circuitOpenedAt = new Date();
      logger.info('Circuit opened for target', {
        id: target.id,
        url: target.url,
        failureCount: target.failureCount,
      });
    }
  }

  /**
   * Check if circuit is open (with auto-reset after timeout)
   */
  private isCircuitOpen(target: ForwardingTarget): boolean {
    if (!target.circuitOpen) return false;

    // Check if enough time has passed to try again
    if (target.circuitOpenedAt) {
      const elapsed = Date.now() - target.circuitOpenedAt.getTime();
      if (elapsed >= this.config.circuitResetSeconds * 1000) {
        // Half-open: allow one attempt
        target.circuitOpen = false;
        target.failureCount = this.config.circuitBreakerThreshold - 1; // One more failure will re-open
        logger.debug('Circuit half-opened for retry', { id: target.id });
        return false;
      }
    }

    return true;
  }

  /**
   * Clean up expired targets
   */
  private cleanupExpiredTargets(): void {
    const now = new Date();
    let removed = 0;

    for (const [id, target] of this.targets) {
      if (target.expiresAt <= now) {
        this.targets.delete(id);
        removed++;
      }
    }

    if (removed > 0) {
      logger.debug('Cleaned up expired targets', { removed });
    }
  }

  /**
   * Get service status
   */
  getStatus(): {
    enabled: boolean;
    activeTargets: number;
    targets: Array<{
      id: string;
      url: string;
      expiresIn: number;
      failureCount: number;
      circuitOpen: boolean;
    }>;
  } {
    const now = Date.now();
    const activeTargets = this.getActiveTargets();

    return {
      enabled: this.isEnabled(),
      activeTargets: activeTargets.length,
      targets: activeTargets.map((t) => ({
        id: t.id,
        url: t.url.replace(/\/\/[^@]+@/, '//***@'), // Mask any credentials in URL
        expiresIn: Math.max(0, Math.round((t.expiresAt.getTime() - now) / 1000)),
        failureCount: t.failureCount,
        circuitOpen: t.circuitOpen,
      })),
    };
  }

  /**
   * Destroy the service
   */
  destroy(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
    this.targets.clear();
  }
}

// =============================================================================
// Singleton Instance
// =============================================================================

let instance: WebhookForwardingService | null = null;

export function getWebhookForwardingService(): WebhookForwardingService {
  if (!instance) {
    instance = new WebhookForwardingService();
  }
  return instance;
}

export function createWebhookForwardingService(
  config?: Partial<ForwardingServiceConfig>
): WebhookForwardingService {
  return new WebhookForwardingService(config);
}
