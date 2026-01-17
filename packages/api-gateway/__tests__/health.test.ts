/**
 * Tests for Health Monitor
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock core
vi.mock('@orient/core', () => ({
  createServiceLogger: () => ({
    info: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    warn: vi.fn(),
    startOperation: () => ({
      success: vi.fn(),
      failure: vi.fn(),
    }),
  }),
}));

import { HealthMonitor } from '../src/health/monitor.js';

describe('HealthMonitor', () => {
  let monitor: HealthMonitor;

  beforeEach(() => {
    monitor = new HealthMonitor();
  });

  describe('registerCheck', () => {
    it('should register a health check', () => {
      monitor.registerCheck('test', async () => ({
        service: 'test',
        status: 'healthy',
        lastCheck: new Date(),
      }));

      // No error means success
      expect(true).toBe(true);
    });
  });

  describe('runChecks', () => {
    it('should run all registered health checks', async () => {
      monitor.registerCheck('service1', async () => ({
        service: 'service1',
        status: 'healthy',
        lastCheck: new Date(),
      }));

      monitor.registerCheck('service2', async () => ({
        service: 'service2',
        status: 'healthy',
        lastCheck: new Date(),
      }));

      const health = await monitor.runChecks();

      expect(health.status).toBe('healthy');
      expect(health.checks).toHaveLength(2);
      expect(health.uptime).toBeGreaterThanOrEqual(0);
    });

    it('should return unhealthy if any check fails', async () => {
      monitor.registerCheck('healthy', async () => ({
        service: 'healthy',
        status: 'healthy',
        lastCheck: new Date(),
      }));

      monitor.registerCheck('failing', async () => ({
        service: 'failing',
        status: 'unhealthy',
        lastCheck: new Date(),
      }));

      const health = await monitor.runChecks();

      expect(health.status).toBe('unhealthy');
    });

    it('should return degraded if any check is degraded', async () => {
      monitor.registerCheck('healthy', async () => ({
        service: 'healthy',
        status: 'healthy',
        lastCheck: new Date(),
      }));

      monitor.registerCheck('degraded', async () => ({
        service: 'degraded',
        status: 'degraded',
        lastCheck: new Date(),
      }));

      const health = await monitor.runChecks();

      expect(health.status).toBe('degraded');
    });

    it('should handle check errors gracefully', async () => {
      monitor.registerCheck('throwing', async () => {
        throw new Error('Check failed');
      });

      const health = await monitor.runChecks();

      expect(health.status).toBe('unhealthy');
      expect(health.checks[0].details?.error).toContain('Check failed');
    });
  });

  describe('getUptime', () => {
    it('should return uptime in milliseconds', async () => {
      const uptime = monitor.getUptime();
      expect(uptime).toBeGreaterThanOrEqual(0);

      // Wait a bit and check uptime increased
      await new Promise(resolve => setTimeout(resolve, 10));
      const newUptime = monitor.getUptime();
      expect(newUptime).toBeGreaterThan(uptime);
    });
  });

  describe('unregisterCheck', () => {
    it('should unregister a health check', () => {
      monitor.registerCheck('test', async () => ({
        service: 'test',
        status: 'healthy',
        lastCheck: new Date(),
      }));

      const removed = monitor.unregisterCheck('test');
      expect(removed).toBe(true);

      const removedAgain = monitor.unregisterCheck('test');
      expect(removedAgain).toBe(false);
    });
  });
});
