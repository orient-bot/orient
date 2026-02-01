/**
 * Health Monitor Service
 *
 * Monitors the health of various system components.
 */

import { createServiceLogger } from '@orient-bot/core';
import type { HealthCheckResult, SystemHealth } from '../types.js';

const logger = createServiceLogger('health-monitor');

/**
 * Health Monitor
 *
 * Provides methods for:
 * - Running health checks on system components
 * - Aggregating health status
 * - Reporting system health
 */
export class HealthMonitor {
  private startTime = Date.now();
  private checks: Map<string, () => Promise<HealthCheckResult>> = new Map();

  /**
   * Register a health check
   */
  registerCheck(name: string, check: () => Promise<HealthCheckResult>): void {
    this.checks.set(name, check);
    logger.debug('Health check registered', { name });
  }

  /**
   * Unregister a health check
   */
  unregisterCheck(name: string): boolean {
    return this.checks.delete(name);
  }

  /**
   * Run all health checks
   */
  async runChecks(): Promise<SystemHealth> {
    const op = logger.startOperation('runChecks');

    try {
      const results: HealthCheckResult[] = [];

      for (const [name, check] of this.checks) {
        try {
          const startTime = Date.now();
          const result = await check();
          result.latencyMs = Date.now() - startTime;
          results.push(result);
        } catch (error) {
          results.push({
            service: name,
            status: 'unhealthy',
            lastCheck: new Date(),
            details: { error: String(error) },
          });
        }
      }

      const status = this.aggregateStatus(results);
      const uptime = Date.now() - this.startTime;

      op.success('Health checks completed', { status, checkCount: results.length });

      return {
        status,
        uptime,
        checks: results,
        timestamp: new Date(),
      };
    } catch (error) {
      op.failure(error as Error);
      throw error;
    }
  }

  /**
   * Get uptime in milliseconds
   */
  getUptime(): number {
    return Date.now() - this.startTime;
  }

  /**
   * Aggregate status from individual checks
   */
  private aggregateStatus(results: HealthCheckResult[]): 'healthy' | 'unhealthy' | 'degraded' {
    const unhealthyCount = results.filter((r) => r.status === 'unhealthy').length;
    const degradedCount = results.filter((r) => r.status === 'degraded').length;

    if (unhealthyCount > 0) {
      return 'unhealthy';
    }
    if (degradedCount > 0) {
      return 'degraded';
    }
    return 'healthy';
  }
}
