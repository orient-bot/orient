/**
 * Tests for Scheduler Database Service
 *
 * Tests for job scheduling CRUD operations, execution tracking, and statistics.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Create module-level mocks before vi.mock (avoids hoisting issues)
const mockQuery = vi.fn();
const mockClient = {
  query: vi.fn(),
  release: vi.fn(),
};
const mockPool = {
  query: mockQuery,
  connect: vi.fn().mockResolvedValue(mockClient),
  end: vi.fn(),
  on: vi.fn(),
  removeListener: vi.fn(),
};

// Mock pg module
vi.mock('pg', () => ({
  default: {
    Pool: class MockPool {
      query = mockQuery;
      connect = mockPool.connect;
      end = mockPool.end;
      on = mockPool.on;
      removeListener = mockPool.removeListener;
    },
  },
}));

// Mock logger
vi.mock('@orient/core', () => ({
  createServiceLogger: () => ({
    info: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    warn: vi.fn(),
  }),
}));

import { SchedulerDatabase, createSchedulerDatabase } from '../src/schedulerDatabase.js';

describe('SchedulerDatabase', () => {
  let db: SchedulerDatabase;
  const originalEnv = process.env;

  // Test fixtures
  const mockJobRow = {
    id: 1,
    name: 'Daily Standup Reminder',
    description: 'Sends daily standup reminder',
    schedule_type: 'cron',
    cron_expression: '0 9 * * 1-5',
    run_at: null,
    interval_minutes: null,
    timezone: 'Asia/Jerusalem',
    provider: 'whatsapp',
    target: '1234567890',
    message_template: 'Time for standup! 🏃',
    enabled: true,
    last_run_at: '2024-01-15T09:00:00Z',
    next_run_at: '2024-01-16T09:00:00Z',
    run_count: 50,
    last_error: null,
    created_at: '2024-01-01T00:00:00Z',
    updated_at: '2024-01-15T09:00:00Z',
  };

  const mockRunRow = {
    id: 1,
    job_id: 1,
    started_at: '2024-01-15T09:00:00Z',
    completed_at: '2024-01-15T09:00:05Z',
    status: 'success',
    error: null,
    message_sent: 'Time for standup! 🏃',
  };

  beforeEach(() => {
    vi.clearAllMocks();
    process.env = { ...originalEnv };
    process.env.DATABASE_URL = 'postgresql://test:test@localhost:5432/test';

    // Reset mock implementations
    mockQuery.mockReset();
    mockQuery.mockResolvedValue({ rows: [], rowCount: 0 });
    mockClient.query.mockReset();
    mockClient.query.mockResolvedValue({ rows: [], rowCount: 0 });

    db = new SchedulerDatabase();
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  // ============================================
  // JOB CRUD OPERATIONS
  // ============================================

  describe('createJob', () => {
    it('should create a cron job', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [mockJobRow],
        rowCount: 1,
      });

      const result = await db.createJob({
        name: 'Daily Standup Reminder',
        description: 'Sends daily standup reminder',
        scheduleType: 'cron',
        cronExpression: '0 9 * * 1-5',
        timezone: 'Asia/Jerusalem',
        provider: 'whatsapp',
        target: '1234567890',
        messageTemplate: 'Time for standup! 🏃',
      });

      expect(result.id).toBe(1);
      expect(result.name).toBe('Daily Standup Reminder');
      expect(result.scheduleType).toBe('cron');
      expect(result.cronExpression).toBe('0 9 * * 1-5');
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO scheduled_jobs'),
        expect.arrayContaining(['Daily Standup Reminder', 'cron', '0 9 * * 1-5'])
      );
    });

    it('should create a one-time job', async () => {
      const runAt = new Date('2024-02-01T10:00:00Z');
      const onceJobRow = {
        ...mockJobRow,
        id: 2,
        name: 'One-time Notification',
        schedule_type: 'once',
        cron_expression: null,
        run_at: runAt.toISOString(),
      };

      mockQuery.mockResolvedValueOnce({
        rows: [onceJobRow],
        rowCount: 1,
      });

      const result = await db.createJob({
        name: 'One-time Notification',
        scheduleType: 'once',
        runAt: runAt,
        provider: 'slack',
        target: 'C12345678',
        messageTemplate: 'Important reminder!',
      });

      expect(result.scheduleType).toBe('once');
      expect(result.runAt).toEqual(runAt);
    });

    it('should create a recurring job', async () => {
      const recurringJobRow = {
        ...mockJobRow,
        id: 3,
        name: 'Hourly Check',
        schedule_type: 'recurring',
        cron_expression: null,
        interval_minutes: 60,
      };

      mockQuery.mockResolvedValueOnce({
        rows: [recurringJobRow],
        rowCount: 1,
      });

      const result = await db.createJob({
        name: 'Hourly Check',
        scheduleType: 'recurring',
        intervalMinutes: 60,
        provider: 'whatsapp',
        target: '9876543210',
        messageTemplate: 'Hourly check-in',
      });

      expect(result.scheduleType).toBe('recurring');
      expect(result.intervalMinutes).toBe(60);
    });

    it('should use UTC timezone by default', async () => {
      const defaultTimezoneRow = {
        ...mockJobRow,
        timezone: 'UTC',
      };

      mockQuery.mockResolvedValueOnce({
        rows: [defaultTimezoneRow],
        rowCount: 1,
      });

      await db.createJob({
        name: 'Test Job',
        scheduleType: 'cron',
        cronExpression: '0 9 * * *',
        provider: 'whatsapp',
        target: '1234567890',
        messageTemplate: 'Test',
      });

      expect(mockQuery).toHaveBeenCalledWith(expect.any(String), expect.arrayContaining(['UTC']));
    });

    it('should enable job by default', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [mockJobRow],
        rowCount: 1,
      });

      await db.createJob({
        name: 'Test Job',
        scheduleType: 'cron',
        cronExpression: '0 9 * * *',
        provider: 'whatsapp',
        target: '1234567890',
        messageTemplate: 'Test',
      });

      expect(mockQuery).toHaveBeenCalledWith(expect.any(String), expect.arrayContaining([true]));
    });
  });

  describe('getJob', () => {
    it('should return job by ID', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [mockJobRow],
        rowCount: 1,
      });

      const result = await db.getJob(1);

      expect(result).not.toBeNull();
      expect(result?.id).toBe(1);
      expect(result?.name).toBe('Daily Standup Reminder');
      expect(mockQuery).toHaveBeenCalledWith('SELECT * FROM scheduled_jobs WHERE id = $1', [1]);
    });

    it('should return null for non-existent job', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [],
        rowCount: 0,
      });

      const result = await db.getJob(999);

      expect(result).toBeNull();
    });

    it('should convert database row to typed object', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [mockJobRow],
        rowCount: 1,
      });

      const result = await db.getJob(1);

      // Verify type conversions
      expect(result?.lastRunAt).toBeInstanceOf(Date);
      expect(result?.nextRunAt).toBeInstanceOf(Date);
      expect(result?.createdAt).toBeInstanceOf(Date);
      expect(result?.updatedAt).toBeInstanceOf(Date);
      expect(typeof result?.runCount).toBe('number');
      expect(typeof result?.enabled).toBe('boolean');
    });
  });

  describe('getAllJobs', () => {
    it('should return all jobs ordered by created_at DESC', async () => {
      const job2 = { ...mockJobRow, id: 2, name: 'Job 2' };
      mockQuery.mockResolvedValueOnce({
        rows: [mockJobRow, job2],
        rowCount: 2,
      });

      const result = await db.getAllJobs();

      expect(result).toHaveLength(2);
      expect(result[0].name).toBe('Daily Standup Reminder');
      expect(mockQuery).toHaveBeenCalledWith(
        'SELECT * FROM scheduled_jobs ORDER BY created_at DESC'
      );
    });

    it('should return empty array when no jobs exist', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [],
        rowCount: 0,
      });

      const result = await db.getAllJobs();

      expect(result).toEqual([]);
    });
  });

  describe('getDueJobs', () => {
    it('should return enabled jobs with past next_run_at', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [mockJobRow],
        rowCount: 1,
      });

      const result = await db.getDueJobs();

      expect(result).toHaveLength(1);
      expect(mockQuery).toHaveBeenCalledWith(expect.stringContaining('WHERE enabled = TRUE'));
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('next_run_at IS NULL OR next_run_at <= NOW()')
      );
    });

    it('should return jobs ordered by next_run_at ASC', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [mockJobRow],
        rowCount: 1,
      });

      await db.getDueJobs();

      expect(mockQuery).toHaveBeenCalledWith(expect.stringContaining('ORDER BY next_run_at ASC'));
    });
  });

  describe('getJobsByProvider', () => {
    it('should filter jobs by WhatsApp provider', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [mockJobRow],
        rowCount: 1,
      });

      const result = await db.getJobsByProvider('whatsapp');

      expect(result).toHaveLength(1);
      expect(mockQuery).toHaveBeenCalledWith(expect.stringContaining('WHERE provider = $1'), [
        'whatsapp',
      ]);
    });

    it('should filter jobs by Slack provider', async () => {
      const slackJob = { ...mockJobRow, provider: 'slack', target: 'C12345678' };
      mockQuery.mockResolvedValueOnce({
        rows: [slackJob],
        rowCount: 1,
      });

      const result = await db.getJobsByProvider('slack');

      expect(result).toHaveLength(1);
      expect(result[0].provider).toBe('slack');
    });
  });

  describe('updateJob', () => {
    it('should update job name', async () => {
      const updatedRow = { ...mockJobRow, name: 'Updated Name' };
      mockQuery.mockResolvedValueOnce({
        rows: [updatedRow],
        rowCount: 1,
      });

      const result = await db.updateJob(1, { name: 'Updated Name' });

      expect(result?.name).toBe('Updated Name');
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE scheduled_jobs SET name = $1'),
        expect.arrayContaining(['Updated Name', 1])
      );
    });

    it('should update multiple fields', async () => {
      const updatedRow = {
        ...mockJobRow,
        name: 'New Name',
        enabled: false,
        timezone: 'America/New_York',
      };
      mockQuery.mockResolvedValueOnce({
        rows: [updatedRow],
        rowCount: 1,
      });

      const result = await db.updateJob(1, {
        name: 'New Name',
        enabled: false,
        timezone: 'America/New_York',
      });

      expect(result?.name).toBe('New Name');
      expect(result?.enabled).toBe(false);
      expect(result?.timezone).toBe('America/New_York');
    });

    it('should return current job if no updates provided', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [mockJobRow],
        rowCount: 1,
      });

      const result = await db.updateJob(1, {});

      expect(result?.id).toBe(1);
      // Should call getJob instead of update
      expect(mockQuery).toHaveBeenCalledWith('SELECT * FROM scheduled_jobs WHERE id = $1', [1]);
    });

    it('should return null for non-existent job', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [],
        rowCount: 0,
      });

      const result = await db.updateJob(999, { name: 'Updated' });

      expect(result).toBeNull();
    });

    it('should update cron expression', async () => {
      const updatedRow = { ...mockJobRow, cron_expression: '0 10 * * 1-5' };
      mockQuery.mockResolvedValueOnce({
        rows: [updatedRow],
        rowCount: 1,
      });

      const result = await db.updateJob(1, { cronExpression: '0 10 * * 1-5' });

      expect(result?.cronExpression).toBe('0 10 * * 1-5');
    });

    it('should update message template', async () => {
      const updatedRow = { ...mockJobRow, message_template: 'New template' };
      mockQuery.mockResolvedValueOnce({
        rows: [updatedRow],
        rowCount: 1,
      });

      const result = await db.updateJob(1, { messageTemplate: 'New template' });

      expect(result?.messageTemplate).toBe('New template');
    });
  });

  describe('deleteJob', () => {
    it('should delete existing job', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [],
        rowCount: 1,
      });

      const result = await db.deleteJob(1);

      expect(result).toBe(true);
      expect(mockQuery).toHaveBeenCalledWith('DELETE FROM scheduled_jobs WHERE id = $1', [1]);
    });

    it('should return false for non-existent job', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [],
        rowCount: 0,
      });

      const result = await db.deleteJob(999);

      expect(result).toBe(false);
    });
  });

  describe('toggleJob', () => {
    it('should enable a disabled job', async () => {
      const enabledRow = { ...mockJobRow, enabled: true };
      mockQuery.mockResolvedValueOnce({
        rows: [enabledRow],
        rowCount: 1,
      });

      const result = await db.toggleJob(1, true);

      expect(result?.enabled).toBe(true);
    });

    it('should disable an enabled job', async () => {
      const disabledRow = { ...mockJobRow, enabled: false };
      mockQuery.mockResolvedValueOnce({
        rows: [disabledRow],
        rowCount: 1,
      });

      const result = await db.toggleJob(1, false);

      expect(result?.enabled).toBe(false);
    });
  });

  // ============================================
  // JOB EXECUTION TRACKING
  // ============================================

  describe('recordJobStart', () => {
    it('should create a new run record with running status', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [{ id: 10 }],
        rowCount: 1,
      });

      const runId = await db.recordJobStart(1);

      expect(runId).toBe(10);
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO scheduled_job_runs'),
        [1]
      );
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining("'running'"),
        expect.any(Array)
      );
    });
  });

  describe('recordJobCompletion', () => {
    it('should record successful completion', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 1 });

      await db.recordJobCompletion(10, true, 'Message sent successfully');

      expect(mockQuery).toHaveBeenCalledWith(expect.stringContaining('UPDATE scheduled_job_runs'), [
        'success',
        'Message sent successfully',
        null,
        10,
      ]);
    });

    it('should record failed completion with error', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 1 });

      await db.recordJobCompletion(10, false, undefined, 'Connection timeout');

      expect(mockQuery).toHaveBeenCalledWith(expect.stringContaining('UPDATE scheduled_job_runs'), [
        'failed',
        null,
        'Connection timeout',
        10,
      ]);
    });
  });

  describe('updateJobAfterRun', () => {
    it('should update job after successful run', async () => {
      const nextRun = new Date('2024-01-17T09:00:00Z');
      mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 1 });

      await db.updateJobAfterRun(1, true, nextRun);

      expect(mockQuery).toHaveBeenCalledWith(expect.stringContaining('UPDATE scheduled_jobs'), [
        nextRun,
        null,
        1,
      ]);
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('run_count = run_count + 1'),
        expect.any(Array)
      );
    });

    it('should update job after failed run with error', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 1 });

      await db.updateJobAfterRun(1, false, null, 'API error');

      expect(mockQuery).toHaveBeenCalledWith(expect.stringContaining('UPDATE scheduled_jobs'), [
        null,
        'API error',
        1,
      ]);
    });

    it('should set next_run_at to null for one-time jobs', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 1 });

      await db.updateJobAfterRun(1, true, null);

      expect(mockQuery).toHaveBeenCalledWith(expect.any(String), [null, null, 1]);
    });
  });

  // ============================================
  // JOB RUN HISTORY
  // ============================================

  describe('getJobRuns', () => {
    it('should return run history for a job', async () => {
      const run2 = { ...mockRunRow, id: 2, started_at: '2024-01-14T09:00:00Z' };
      mockQuery.mockResolvedValueOnce({
        rows: [mockRunRow, run2],
        rowCount: 2,
      });

      const result = await db.getJobRuns(1);

      expect(result).toHaveLength(2);
      expect(result[0].id).toBe(1);
      expect(result[0].status).toBe('success');
      expect(mockQuery).toHaveBeenCalledWith(expect.stringContaining('WHERE job_id = $1'), [1, 50]);
    });

    it('should respect limit parameter', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [mockRunRow],
        rowCount: 1,
      });

      await db.getJobRuns(1, 10);

      expect(mockQuery).toHaveBeenCalledWith(expect.stringContaining('LIMIT $2'), [1, 10]);
    });

    it('should convert dates to Date objects', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [mockRunRow],
        rowCount: 1,
      });

      const result = await db.getJobRuns(1);

      expect(result[0].startedAt).toBeInstanceOf(Date);
      expect(result[0].completedAt).toBeInstanceOf(Date);
    });

    it('should handle runs without completedAt', async () => {
      const runningRow = { ...mockRunRow, completed_at: null, status: 'running' };
      mockQuery.mockResolvedValueOnce({
        rows: [runningRow],
        rowCount: 1,
      });

      const result = await db.getJobRuns(1);

      expect(result[0].completedAt).toBeUndefined();
      expect(result[0].status).toBe('running');
    });
  });

  describe('getRecentRuns', () => {
    it('should return recent runs across all jobs with job names', async () => {
      const runWithName = { ...mockRunRow, job_name: 'Daily Standup Reminder' };
      mockQuery.mockResolvedValueOnce({
        rows: [runWithName],
        rowCount: 1,
      });

      const result = await db.getRecentRuns();

      expect(result).toHaveLength(1);
      expect(result[0].jobName).toBe('Daily Standup Reminder');
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('JOIN scheduled_jobs j ON r.job_id = j.id'),
        [50]
      );
    });

    it('should respect limit parameter', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [],
        rowCount: 0,
      });

      await db.getRecentRuns(25);

      expect(mockQuery).toHaveBeenCalledWith(expect.any(String), [25]);
    });
  });

  // ============================================
  // STATISTICS
  // ============================================

  describe('getStats', () => {
    it('should return scheduler statistics', async () => {
      // Mock all parallel queries
      mockQuery
        // totalJobs
        .mockResolvedValueOnce({ rows: [{ count: '10' }], rowCount: 1 })
        // enabledJobs
        .mockResolvedValueOnce({ rows: [{ count: '8' }], rowCount: 1 })
        // byProvider
        .mockResolvedValueOnce({
          rows: [
            { provider: 'whatsapp', count: '6' },
            { provider: 'slack', count: '4' },
          ],
          rowCount: 2,
        })
        // byType
        .mockResolvedValueOnce({
          rows: [
            { schedule_type: 'cron', count: '5' },
            { schedule_type: 'once', count: '3' },
            { schedule_type: 'recurring', count: '2' },
          ],
          rowCount: 3,
        })
        // totalRuns
        .mockResolvedValueOnce({ rows: [{ count: '150' }], rowCount: 1 })
        // recentSuccess
        .mockResolvedValueOnce({ rows: [{ count: '12' }], rowCount: 1 })
        // recentFailed
        .mockResolvedValueOnce({ rows: [{ count: '2' }], rowCount: 1 });

      const result = await db.getStats();

      expect(result.totalJobs).toBe(10);
      expect(result.enabledJobs).toBe(8);
      expect(result.byProvider.whatsapp).toBe(6);
      expect(result.byProvider.slack).toBe(4);
      expect(result.byType.cron).toBe(5);
      expect(result.byType.once).toBe(3);
      expect(result.byType.recurring).toBe(2);
      expect(result.totalRuns).toBe(150);
      expect(result.last24Hours.success).toBe(12);
      expect(result.last24Hours.failed).toBe(2);
    });

    it('should handle empty database', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [{ count: '0' }], rowCount: 1 })
        .mockResolvedValueOnce({ rows: [{ count: '0' }], rowCount: 1 })
        .mockResolvedValueOnce({ rows: [], rowCount: 0 })
        .mockResolvedValueOnce({ rows: [], rowCount: 0 })
        .mockResolvedValueOnce({ rows: [{ count: '0' }], rowCount: 1 })
        .mockResolvedValueOnce({ rows: [{ count: '0' }], rowCount: 1 })
        .mockResolvedValueOnce({ rows: [{ count: '0' }], rowCount: 1 });

      const result = await db.getStats();

      expect(result.totalJobs).toBe(0);
      expect(result.enabledJobs).toBe(0);
      expect(result.byProvider.whatsapp).toBe(0);
      expect(result.byProvider.slack).toBe(0);
      expect(result.byType.cron).toBe(0);
      expect(result.byType.once).toBe(0);
      expect(result.byType.recurring).toBe(0);
      expect(result.totalRuns).toBe(0);
    });
  });

  // ============================================
  // INITIALIZATION
  // ============================================

  describe('initialize', () => {
    it('should initialize database tables', async () => {
      mockClient.query.mockResolvedValue({ rows: [], rowCount: 0 });

      await db.initialize();

      expect(mockPool.connect).toHaveBeenCalled();
      expect(mockClient.query).toHaveBeenCalledWith('BEGIN');
      expect(mockClient.query).toHaveBeenCalledWith(
        expect.stringContaining('CREATE TABLE IF NOT EXISTS scheduled_jobs')
      );
      expect(mockClient.query).toHaveBeenCalledWith(
        expect.stringContaining('CREATE TABLE IF NOT EXISTS scheduled_job_runs')
      );
      expect(mockClient.query).toHaveBeenCalledWith('COMMIT');
      expect(mockClient.release).toHaveBeenCalled();
    });

    it('should only initialize once', async () => {
      mockClient.query.mockResolvedValue({ rows: [], rowCount: 0 });

      await db.initialize();
      await db.initialize();

      // connect should only be called once
      expect(mockPool.connect).toHaveBeenCalledTimes(1);
    });

    it('should rollback on error', async () => {
      mockClient.query
        .mockResolvedValueOnce({ rows: [] }) // BEGIN
        .mockRejectedValueOnce(new Error('Table creation failed'));

      await expect(db.initialize()).rejects.toThrow('Table creation failed');

      expect(mockClient.query).toHaveBeenCalledWith('ROLLBACK');
      expect(mockClient.release).toHaveBeenCalled();
    });
  });

  // ============================================
  // CONNECTION MANAGEMENT
  // ============================================

  describe('close', () => {
    it('should close the connection pool', async () => {
      await db.close();

      expect(mockPool.end).toHaveBeenCalled();
    });
  });

  describe('constructor', () => {
    it('should use provided connection string', () => {
      const customDb = new SchedulerDatabase('postgresql://custom:custom@localhost:5432/custom');
      expect(customDb).toBeDefined();
    });

    it('should use DATABASE_URL environment variable', () => {
      process.env.DATABASE_URL = 'postgresql://env:env@localhost:5432/env';
      const envDb = new SchedulerDatabase();
      expect(envDb).toBeDefined();
    });

    it('should use default connection string when none provided', () => {
      delete process.env.DATABASE_URL;
      const defaultDb = new SchedulerDatabase();
      expect(defaultDb).toBeDefined();
    });
  });

  // ============================================
  // ERROR HANDLING
  // ============================================

  describe('Error handling', () => {
    it('should handle database query failures in createJob', async () => {
      mockQuery.mockRejectedValueOnce(new Error('Connection refused'));

      await expect(
        db.createJob({
          name: 'Test',
          scheduleType: 'cron',
          cronExpression: '0 9 * * *',
          provider: 'whatsapp',
          target: '1234567890',
          messageTemplate: 'Test',
        })
      ).rejects.toThrow('Connection refused');
    });

    it('should handle database query failures in getJob', async () => {
      mockQuery.mockRejectedValueOnce(new Error('Database error'));

      await expect(db.getJob(1)).rejects.toThrow('Database error');
    });

    it('should handle database query failures in getStats', async () => {
      mockQuery.mockRejectedValueOnce(new Error('Stats query failed'));

      await expect(db.getStats()).rejects.toThrow('Stats query failed');
    });
  });

  // ============================================
  // FACTORY FUNCTION
  // ============================================

  describe('createSchedulerDatabase', () => {
    it('should create a SchedulerDatabase instance', () => {
      const instance = createSchedulerDatabase();
      expect(instance).toBeInstanceOf(SchedulerDatabase);
    });

    it('should pass connection string to constructor', () => {
      const instance = createSchedulerDatabase('postgresql://test@localhost/test');
      expect(instance).toBeDefined();
    });
  });
});
