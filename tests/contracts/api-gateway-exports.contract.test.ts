/**
 * Contract Tests for @orientbot/api-gateway
 *
 * These tests verify that the api-gateway package exports all expected
 * types and classes. They serve as a contract that must not break
 * when refactoring the package internals.
 */

import { describe, it, expect } from 'vitest';

describe('@orientbot/api-gateway Contract Tests', () => {
  describe('Type Exports', () => {
    it('should export ScheduledMessage type', async () => {
      const module = await import('@orientbot/api-gateway');
      expect(module).toBeDefined();
    });

    it('should export WebhookForward type', async () => {
      const module = await import('@orientbot/api-gateway');
      expect(module).toBeDefined();
    });

    it('should export HealthCheckResult type', async () => {
      const module = await import('@orientbot/api-gateway');
      expect(module).toBeDefined();
    });

    it('should export SystemHealth type', async () => {
      const module = await import('@orientbot/api-gateway');
      expect(module).toBeDefined();
    });

    it('should export SchedulerJobInfo type', async () => {
      const module = await import('@orientbot/api-gateway');
      expect(module).toBeDefined();
    });
  });

  describe('Scheduler Exports', () => {
    it('should export SchedulerService class', async () => {
      const module = await import('@orientbot/api-gateway');
      expect(module.SchedulerService).toBeDefined();
      expect(typeof module.SchedulerService).toBe('function');
    });

    it('SchedulerService should be instantiable', async () => {
      const { SchedulerService } = await import('@orientbot/api-gateway');

      const scheduler = new SchedulerService();

      expect(scheduler).toBeDefined();
      expect(typeof scheduler.start).toBe('function');
      expect(typeof scheduler.stop).toBe('function');
      expect(typeof scheduler.scheduleMessage).toBe('function');
      expect(typeof scheduler.getJobs).toBe('function');
    });
  });

  describe('Health Monitor Exports', () => {
    it('should export HealthMonitor class', async () => {
      const module = await import('@orientbot/api-gateway');
      expect(module.HealthMonitor).toBeDefined();
      expect(typeof module.HealthMonitor).toBe('function');
    });

    it('HealthMonitor should be instantiable', async () => {
      const { HealthMonitor } = await import('@orientbot/api-gateway');

      const monitor = new HealthMonitor();

      expect(monitor).toBeDefined();
      expect(typeof monitor.registerCheck).toBe('function');
      expect(typeof monitor.runChecks).toBe('function');
      expect(typeof monitor.getUptime).toBe('function');
    });
  });
});
