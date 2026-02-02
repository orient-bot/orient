/**
 * Free Model Health Checker Service
 *
 * Monitors the availability and quality of free Zen models.
 * Runs health checks on startup and periodically to ensure reliable model selection.
 *
 * Key responsibilities:
 * - Fetch available free models from OpenCode Zen API
 * - Run quality checks (simple math test) to verify models work
 * - Cache health status with periodic refresh
 * - Provide ordered list of available models by latency
 */

import { createServiceLogger } from '@orient-bot/core';
import { FREE_MODELS, FREE_MODEL_FALLBACK_CHAIN } from '@orient-bot/core';

const logger = createServiceLogger('free-model-health-checker');

// ============================================
// TYPES
// ============================================

export interface FreeModelStatus {
  modelId: string;
  available: boolean;
  lastChecked: Date;
  avgLatencyMs?: number;
  qualityPassed?: boolean;
  errorMessage?: string;
}

export interface FreeModelHealthCheckerOptions {
  /** Refresh interval in milliseconds (default: 30 minutes) */
  refreshIntervalMs?: number;
  /** OpenCode server base URL (default: http://localhost:4099) */
  openCodeBaseUrl?: string;
  /** Request timeout in milliseconds (default: 30000) */
  requestTimeoutMs?: number;
  /** Enable automatic periodic refresh (default: true) */
  enablePeriodicRefresh?: boolean;
}

// ============================================
// HEALTH CHECKER SERVICE
// ============================================

export class FreeModelHealthChecker {
  private statusCache: Map<string, FreeModelStatus> = new Map();
  private refreshIntervalMs: number;
  private openCodeBaseUrl: string;
  private requestTimeoutMs: number;
  private enablePeriodicRefresh: boolean;
  private refreshTimer: ReturnType<typeof setInterval> | null = null;
  private initialized = false;

  constructor(options: FreeModelHealthCheckerOptions = {}) {
    this.refreshIntervalMs = options.refreshIntervalMs ?? 30 * 60 * 1000; // 30 minutes
    this.openCodeBaseUrl = options.openCodeBaseUrl ?? 'http://localhost:4099';
    this.requestTimeoutMs = options.requestTimeoutMs ?? 30000;
    this.enablePeriodicRefresh = options.enablePeriodicRefresh ?? true;
  }

  /**
   * Initialize the health checker
   * Fetches available models and runs initial health checks
   */
  async initialize(): Promise<void> {
    if (this.initialized) {
      logger.debug('Health checker already initialized');
      return;
    }

    const op = logger.startOperation('initialize');

    try {
      // Check all known free models
      await this.checkAllModels();

      // Start periodic refresh if enabled
      if (this.enablePeriodicRefresh) {
        this.startPeriodicRefresh();
      }

      this.initialized = true;
      const availableCount = this.getAvailableModelsSync().length;
      op.success('Health checker initialized', { availableModels: availableCount });
    } catch (error) {
      op.failure(error instanceof Error ? error : String(error));
      // Don't throw - we can still function with cached/fallback data
      this.initialized = true;
    }
  }

  /**
   * Stop the health checker and cleanup resources
   */
  stop(): void {
    if (this.refreshTimer) {
      clearInterval(this.refreshTimer);
      this.refreshTimer = null;
    }
    this.initialized = false;
    logger.info('Health checker stopped');
  }

  /**
   * Check health of all known free models
   */
  private async checkAllModels(): Promise<void> {
    const modelIds = Object.values(FREE_MODELS).map((m) => m.id);

    logger.info('Checking all free models', { count: modelIds.length });

    // Check models in parallel with concurrency limit
    const results = await Promise.allSettled(
      modelIds.map((modelId) => this.checkModelHealth(modelId))
    );

    const successful = results.filter((r) => r.status === 'fulfilled').length;
    const failed = results.filter((r) => r.status === 'rejected').length;

    logger.info('Model health check complete', { successful, failed, total: modelIds.length });
  }

  /**
   * Check health of a single model
   */
  private async checkModelHealth(modelId: string): Promise<FreeModelStatus> {
    const startTime = Date.now();

    try {
      // Simple quality test: ask "What is 2+2? Reply with just the number."
      const response = await this.sendTestMessage(
        modelId,
        'What is 2+2? Reply with just the number.'
      );

      const latencyMs = Date.now() - startTime;

      // Check if response contains "4"
      const qualityPassed = response.includes('4');

      const status: FreeModelStatus = {
        modelId,
        available: true,
        lastChecked: new Date(),
        avgLatencyMs: latencyMs,
        qualityPassed,
      };

      if (!qualityPassed) {
        status.errorMessage = `Quality check failed: expected "4" in response, got "${response.substring(0, 50)}"`;
        logger.warn('Model failed quality check', {
          modelId,
          response: response.substring(0, 100),
        });
      }

      this.statusCache.set(modelId, status);
      return status;
    } catch (error) {
      const status: FreeModelStatus = {
        modelId,
        available: false,
        lastChecked: new Date(),
        qualityPassed: false,
        errorMessage: error instanceof Error ? error.message : String(error),
      };

      this.statusCache.set(modelId, status);
      logger.warn('Model health check failed', { modelId, error: status.errorMessage });
      return status;
    }
  }

  /**
   * Send a test message to a model via OpenCode
   */
  private async sendTestMessage(modelId: string, message: string): Promise<string> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.requestTimeoutMs);

    try {
      // Use a unique session ID for health checks
      const sessionId = `health-check-${modelId.replace(/\//g, '-')}-${Date.now()}`;

      const response = await fetch(`${this.openCodeBaseUrl}/sessions/${sessionId}/messages`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          message,
          model: modelId,
        }),
        signal: controller.signal,
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const data = (await response.json()) as Record<string, unknown>;

      // Clean up the health check session
      await fetch(`${this.openCodeBaseUrl}/sessions/${sessionId}`, {
        method: 'DELETE',
      }).catch(() => {
        // Ignore cleanup errors
      });

      // Extract text from response
      if (typeof data === 'string') {
        return data;
      }
      if (typeof data.text === 'string') {
        return data.text;
      }
      if (data.content !== undefined) {
        return typeof data.content === 'string' ? data.content : JSON.stringify(data.content);
      }
      if (data.message !== undefined) {
        return typeof data.message === 'string' ? data.message : JSON.stringify(data.message);
      }

      return JSON.stringify(data);
    } finally {
      clearTimeout(timeoutId);
    }
  }

  /**
   * Start periodic health check refresh
   */
  private startPeriodicRefresh(): void {
    if (this.refreshTimer) {
      clearInterval(this.refreshTimer);
    }

    this.refreshTimer = setInterval(async () => {
      logger.debug('Starting periodic health check refresh');
      await this.checkAllModels();
    }, this.refreshIntervalMs);

    logger.info('Periodic refresh started', { intervalMs: this.refreshIntervalMs });
  }

  /**
   * Get list of available models, sorted by latency
   */
  async getAvailableModels(): Promise<string[]> {
    // Ensure initialized
    if (!this.initialized) {
      await this.initialize();
    }

    return this.getAvailableModelsSync();
  }

  /**
   * Get list of available models synchronously (from cache)
   */
  getAvailableModelsSync(): string[] {
    return Array.from(this.statusCache.entries())
      .filter(([_, status]) => status.available && status.qualityPassed)
      .sort((a, b) => (a[1].avgLatencyMs ?? 999999) - (b[1].avgLatencyMs ?? 999999))
      .map(([id]) => id);
  }

  /**
   * Check if a specific model is available
   */
  isModelAvailable(modelId: string): boolean {
    const status = this.statusCache.get(modelId);
    return (status?.available && status?.qualityPassed) ?? false;
  }

  /**
   * Get status for a specific model
   */
  getModelStatus(modelId: string): FreeModelStatus | null {
    return this.statusCache.get(modelId) ?? null;
  }

  /**
   * Get all model statuses
   */
  getAllStatuses(): FreeModelStatus[] {
    return Array.from(this.statusCache.values());
  }

  /**
   * Get the timestamp of the last health check
   */
  getLastCheckTime(): Date | null {
    const statuses = Array.from(this.statusCache.values());
    if (statuses.length === 0) return null;

    return statuses.reduce((latest, status) => {
      return status.lastChecked > latest ? status.lastChecked : latest;
    }, statuses[0].lastChecked);
  }

  /**
   * Force a refresh of all model health checks
   */
  async refresh(): Promise<void> {
    logger.info('Forcing health check refresh');
    await this.checkAllModels();
  }

  /**
   * Get the first available model from the fallback chain
   */
  getFirstAvailableModel(): string | null {
    for (const modelId of FREE_MODEL_FALLBACK_CHAIN) {
      if (this.isModelAvailable(modelId)) {
        return modelId;
      }
    }
    return null;
  }
}

// ============================================
// SINGLETON INSTANCE
// ============================================

let healthCheckerInstance: FreeModelHealthChecker | null = null;

/**
 * Get the singleton health checker instance
 */
export function getFreeModelHealthChecker(
  options?: FreeModelHealthCheckerOptions
): FreeModelHealthChecker {
  if (!healthCheckerInstance) {
    healthCheckerInstance = new FreeModelHealthChecker(options);
  }
  return healthCheckerInstance;
}

/**
 * Reset the singleton instance (mainly for testing)
 */
export function resetFreeModelHealthChecker(): void {
  if (healthCheckerInstance) {
    healthCheckerInstance.stop();
    healthCheckerInstance = null;
  }
}
