/**
 * Tests for Scheduler Service
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock core
vi.mock('@orientbot/core', () => ({
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

import { SchedulerService } from '../src/scheduler/service.js';
import type { ScheduledMessage } from '../src/types.js';

describe('SchedulerService', () => {
  let scheduler: SchedulerService;

  beforeEach(() => {
    scheduler = new SchedulerService();
  });

  describe('start/stop', () => {
    it('should start and stop the scheduler', async () => {
      expect(scheduler.getIsRunning()).toBe(false);

      await scheduler.start();
      expect(scheduler.getIsRunning()).toBe(true);

      await scheduler.stop();
      expect(scheduler.getIsRunning()).toBe(false);
    });
  });

  describe('scheduleMessage', () => {
    it('should schedule a message', async () => {
      const message: ScheduledMessage = {
        id: 1,
        name: 'Daily Standup',
        cronExpression: '30 9 * * 1-5',
        targetType: 'slack',
        targetId: '#standup',
        message: 'Time for standup!',
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const job = await scheduler.scheduleMessage(message);

      expect(job.id).toBe('1');
      expect(job.name).toBe('Daily Standup');
      expect(job.cronExpression).toBe('30 9 * * 1-5');
      expect(job.nextRun).toBeInstanceOf(Date);
    });

    it('should store multiple scheduled jobs', async () => {
      const message1: ScheduledMessage = {
        id: 1,
        name: 'Job 1',
        cronExpression: '* * * * *',
        targetType: 'slack',
        targetId: '#channel1',
        message: 'Message 1',
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const message2: ScheduledMessage = {
        id: 2,
        name: 'Job 2',
        cronExpression: '0 * * * *',
        targetType: 'whatsapp',
        targetId: '1234567890',
        message: 'Message 2',
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      await scheduler.scheduleMessage(message1);
      await scheduler.scheduleMessage(message2);

      const jobs = scheduler.getJobs();
      expect(jobs).toHaveLength(2);
    });
  });

  describe('cancelMessage', () => {
    it('should cancel a scheduled message', async () => {
      const message: ScheduledMessage = {
        id: 1,
        name: 'To Cancel',
        cronExpression: '* * * * *',
        targetType: 'slack',
        targetId: '#channel',
        message: 'Message',
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      await scheduler.scheduleMessage(message);
      expect(scheduler.getJobs()).toHaveLength(1);

      const cancelled = await scheduler.cancelMessage(1);
      expect(cancelled).toBe(true);
      expect(scheduler.getJobs()).toHaveLength(0);
    });

    it('should return false for non-existent message', async () => {
      const cancelled = await scheduler.cancelMessage(999);
      expect(cancelled).toBe(false);
    });
  });

  describe('getJob', () => {
    it('should return a specific job', async () => {
      const message: ScheduledMessage = {
        id: 42,
        name: 'Specific Job',
        cronExpression: '0 0 * * *',
        targetType: 'slack',
        targetId: '#channel',
        message: 'Daily message',
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      await scheduler.scheduleMessage(message);

      const job = scheduler.getJob(42);
      expect(job).toBeDefined();
      expect(job?.name).toBe('Specific Job');
    });

    it('should return undefined for non-existent job', () => {
      const job = scheduler.getJob(999);
      expect(job).toBeUndefined();
    });
  });
});
