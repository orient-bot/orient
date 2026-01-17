/**
 * Tests for API Gateway Entry Point
 * 
 * Verifies the main.ts module structure and startup logic.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock dependencies before imports
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
  createDedicatedServiceLogger: () => ({
    info: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    warn: vi.fn(),
    startOperation: () => ({
      success: vi.fn(),
      failure: vi.fn(),
    }),
  }),
  loadConfig: vi.fn().mockResolvedValue(undefined),
  getConfig: vi.fn().mockReturnValue({
    integrations: {
      jira: { host: 'test.atlassian.net', email: 'test@test.com', apiToken: 'token' },
    },
    organization: {
      name: 'Test Org',
      jiraProjectKey: 'TEST',
    },
  }),
}));

describe('API Gateway Entry Point', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Module Structure', () => {
    it('should export SchedulerService from index', async () => {
      const { SchedulerService } = await import('../src/index.js');
      expect(SchedulerService).toBeDefined();
      expect(typeof SchedulerService).toBe('function');
    });

    it('should export HealthMonitor from index', async () => {
      const { HealthMonitor } = await import('../src/index.js');
      expect(HealthMonitor).toBeDefined();
      expect(typeof HealthMonitor).toBe('function');
    });

    it('should export types from package', async () => {
      const types = await import('../src/types.js');
      expect(types).toBeDefined();
    });
  });

  describe('SchedulerService', () => {
    it('should start and stop cleanly', async () => {
      const { SchedulerService } = await import('../src/scheduler/service.js');
      
      const scheduler = new SchedulerService();
      
      expect(scheduler.getIsRunning()).toBe(false);
      
      await scheduler.start();
      expect(scheduler.getIsRunning()).toBe(true);
      
      await scheduler.stop();
      expect(scheduler.getIsRunning()).toBe(false);
    });

    it('should manage jobs', async () => {
      const { SchedulerService } = await import('../src/scheduler/service.js');
      
      const scheduler = new SchedulerService();
      await scheduler.start();
      
      const job = await scheduler.scheduleMessage({
        id: 1,
        name: 'Test Job',
        cronExpression: '0 9 * * *',
        message: 'Hello',
        targetType: 'slack',
        targetId: 'C123',
        enabled: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      
      expect(job.id).toBe('1');
      expect(job.name).toBe('Test Job');
      expect(scheduler.getJobs().length).toBe(1);
      
      const cancelled = await scheduler.cancelMessage(1);
      expect(cancelled).toBe(true);
      expect(scheduler.getJobs().length).toBe(0);
      
      await scheduler.stop();
    });
  });

  describe('HealthMonitor', () => {
    it('should register and run health checks', async () => {
      const { HealthMonitor } = await import('../src/health/monitor.js');
      
      const monitor = new HealthMonitor();
      
      monitor.registerCheck('test-service', async () => ({
        service: 'test-service',
        status: 'healthy',
        lastCheck: new Date(),
      }));
      
      const health = await monitor.runChecks();
      
      expect(health.status).toBe('healthy');
      expect(health.checks.length).toBe(1);
      expect(health.checks[0].service).toBe('test-service');
    });

    it('should report unhealthy when checks fail', async () => {
      const { HealthMonitor } = await import('../src/health/monitor.js');
      
      const monitor = new HealthMonitor();
      
      monitor.registerCheck('failing-service', async () => ({
        service: 'failing-service',
        status: 'unhealthy',
        lastCheck: new Date(),
        details: { error: 'Connection refused' },
      }));
      
      const health = await monitor.runChecks();
      
      expect(health.status).toBe('unhealthy');
    });

    it('should track uptime', async () => {
      const { HealthMonitor } = await import('../src/health/monitor.js');
      
      const monitor = new HealthMonitor();
      
      // Small delay to ensure uptime > 0
      await new Promise(resolve => setTimeout(resolve, 10));
      
      expect(monitor.getUptime()).toBeGreaterThan(0);
    });
  });
});
