/**
 * Scheduler Database Service
 *
 * PostgreSQL database for storing scheduled jobs and their execution history.
 * Supports cron, recurring, and one-time schedules with timezone support.
 */

import pg from 'pg';
import { createServiceLogger } from '@orient/core';
import {
  ScheduledJob,
  ScheduledJobRun,
  ScheduleType,
  ScheduleProvider,
  CreateScheduledJobInput,
  UpdateScheduledJobInput,
  SchedulerStats,
} from './types/scheduler.js';

const { Pool } = pg;
const logger = createServiceLogger('scheduler-db');

export class SchedulerDatabase {
  private pool: pg.Pool;
  private initialized: boolean = false;

  constructor(connectionString?: string) {
    const dbUrl =
      connectionString ||
      process.env.DATABASE_URL ||
      'postgresql://aibot:aibot123@localhost:5432/whatsapp_bot_0';

    this.pool = new Pool({
      connectionString: dbUrl,
      max: 10,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 5000,
    });

    this.pool.on('error', (err: Error) => {
      logger.error('Unexpected database pool error', { error: err.message });
    });

    logger.info('Scheduler database pool created', {
      connectionString: dbUrl.replace(/:[^:@]+@/, ':****@'),
    });
  }

  /**
   * Initialize the database (must be called before using)
   */
  async initialize(): Promise<void> {
    if (this.initialized) return;

    await this.initializeTables();
    this.initialized = true;
  }

  /**
   * Initialize database tables for scheduler
   */
  private async initializeTables(): Promise<void> {
    const client = await this.pool.connect();

    try {
      await client.query('BEGIN');

      // Scheduled jobs table
      await client.query(`
        CREATE TABLE IF NOT EXISTS scheduled_jobs (
          id SERIAL PRIMARY KEY,
          name TEXT NOT NULL,
          description TEXT,
          
          -- Schedule configuration
          schedule_type TEXT NOT NULL CHECK (schedule_type IN ('once', 'recurring', 'cron')),
          cron_expression TEXT,
          run_at TIMESTAMPTZ,
          interval_minutes INTEGER,
          timezone TEXT DEFAULT 'UTC',
          
          -- Delivery configuration
          provider TEXT NOT NULL CHECK (provider IN ('whatsapp', 'slack')),
          target TEXT NOT NULL,
          message_template TEXT NOT NULL,
          
          -- Job metadata
          enabled BOOLEAN DEFAULT TRUE,
          last_run_at TIMESTAMPTZ,
          next_run_at TIMESTAMPTZ,
          run_count INTEGER DEFAULT 0,
          last_error TEXT,
          
          created_at TIMESTAMPTZ DEFAULT NOW(),
          updated_at TIMESTAMPTZ DEFAULT NOW()
        )
      `);

      // Scheduled job runs history table
      await client.query(`
        CREATE TABLE IF NOT EXISTS scheduled_job_runs (
          id SERIAL PRIMARY KEY,
          job_id INTEGER REFERENCES scheduled_jobs(id) ON DELETE CASCADE,
          started_at TIMESTAMPTZ NOT NULL,
          completed_at TIMESTAMPTZ,
          status TEXT CHECK (status IN ('running', 'success', 'failed')),
          error TEXT,
          message_sent TEXT
        )
      `);

      // Create indexes
      await client.query(`
        CREATE INDEX IF NOT EXISTS idx_scheduled_jobs_enabled ON scheduled_jobs(enabled);
        CREATE INDEX IF NOT EXISTS idx_scheduled_jobs_next_run ON scheduled_jobs(next_run_at);
        CREATE INDEX IF NOT EXISTS idx_scheduled_jobs_provider ON scheduled_jobs(provider);
        CREATE INDEX IF NOT EXISTS idx_scheduled_job_runs_job_id ON scheduled_job_runs(job_id);
        CREATE INDEX IF NOT EXISTS idx_scheduled_job_runs_started_at ON scheduled_job_runs(started_at);
        CREATE INDEX IF NOT EXISTS idx_scheduled_job_runs_status ON scheduled_job_runs(status);
      `);

      await client.query('COMMIT');
      logger.info('Scheduler database tables initialized');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  // ============================================
  // JOB CRUD OPERATIONS
  // ============================================

  /**
   * Create a new scheduled job
   */
  async createJob(input: CreateScheduledJobInput): Promise<ScheduledJob> {
    const result = await this.pool.query(
      `
      INSERT INTO scheduled_jobs (
        name, description, schedule_type, cron_expression, run_at, interval_minutes,
        timezone, provider, target, message_template, enabled, next_run_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
      RETURNING *
    `,
      [
        input.name,
        input.description || null,
        input.scheduleType,
        input.cronExpression || null,
        input.runAt || null,
        input.intervalMinutes || null,
        input.timezone || 'UTC',
        input.provider,
        input.target,
        input.messageTemplate,
        input.enabled !== false,
        input.nextRunAt || null,
      ]
    );

    logger.info('Created scheduled job', {
      id: result.rows[0].id,
      name: input.name,
      scheduleType: input.scheduleType,
    });

    return this.rowToJob(result.rows[0]);
  }

  /**
   * Get a job by ID
   */
  async getJob(id: number): Promise<ScheduledJob | null> {
    const result = await this.pool.query('SELECT * FROM scheduled_jobs WHERE id = $1', [id]);

    return result.rows.length > 0 ? this.rowToJob(result.rows[0]) : null;
  }

  /**
   * Get all scheduled jobs
   */
  async getAllJobs(): Promise<ScheduledJob[]> {
    const result = await this.pool.query('SELECT * FROM scheduled_jobs ORDER BY created_at DESC');

    return result.rows.map((row) => this.rowToJob(row));
  }

  /**
   * Get enabled jobs that are due to run
   */
  async getDueJobs(): Promise<ScheduledJob[]> {
    const result = await this.pool.query(
      `
      SELECT * FROM scheduled_jobs 
      WHERE enabled = TRUE 
        AND (next_run_at IS NULL OR next_run_at <= NOW())
      ORDER BY next_run_at ASC
    `
    );

    return result.rows.map((row) => this.rowToJob(row));
  }

  /**
   * Get jobs by provider
   */
  async getJobsByProvider(provider: ScheduleProvider): Promise<ScheduledJob[]> {
    const result = await this.pool.query(
      'SELECT * FROM scheduled_jobs WHERE provider = $1 ORDER BY created_at DESC',
      [provider]
    );

    return result.rows.map((row) => this.rowToJob(row));
  }

  /**
   * Update a scheduled job
   */
  async updateJob(id: number, input: UpdateScheduledJobInput): Promise<ScheduledJob | null> {
    const updates: string[] = [];
    const values: unknown[] = [];
    let paramIndex = 1;

    if (input.name !== undefined) {
      updates.push(`name = $${paramIndex++}`);
      values.push(input.name);
    }
    if (input.description !== undefined) {
      updates.push(`description = $${paramIndex++}`);
      values.push(input.description);
    }
    if (input.scheduleType !== undefined) {
      updates.push(`schedule_type = $${paramIndex++}`);
      values.push(input.scheduleType);
    }
    if (input.cronExpression !== undefined) {
      updates.push(`cron_expression = $${paramIndex++}`);
      values.push(input.cronExpression);
    }
    if (input.runAt !== undefined) {
      updates.push(`run_at = $${paramIndex++}`);
      values.push(input.runAt);
    }
    if (input.intervalMinutes !== undefined) {
      updates.push(`interval_minutes = $${paramIndex++}`);
      values.push(input.intervalMinutes);
    }
    if (input.timezone !== undefined) {
      updates.push(`timezone = $${paramIndex++}`);
      values.push(input.timezone);
    }
    if (input.provider !== undefined) {
      updates.push(`provider = $${paramIndex++}`);
      values.push(input.provider);
    }
    if (input.target !== undefined) {
      updates.push(`target = $${paramIndex++}`);
      values.push(input.target);
    }
    if (input.messageTemplate !== undefined) {
      updates.push(`message_template = $${paramIndex++}`);
      values.push(input.messageTemplate);
    }
    if (input.enabled !== undefined) {
      updates.push(`enabled = $${paramIndex++}`);
      values.push(input.enabled);
    }
    if (input.nextRunAt !== undefined) {
      updates.push(`next_run_at = $${paramIndex++}`);
      values.push(input.nextRunAt);
    }

    if (updates.length === 0) {
      return this.getJob(id);
    }

    updates.push(`updated_at = NOW()`);
    values.push(id);

    const result = await this.pool.query(
      `UPDATE scheduled_jobs SET ${updates.join(', ')} WHERE id = $${paramIndex} RETURNING *`,
      values
    );

    if (result.rows.length === 0) {
      return null;
    }

    logger.info('Updated scheduled job', { id });
    return this.rowToJob(result.rows[0]);
  }

  /**
   * Delete a scheduled job
   */
  async deleteJob(id: number): Promise<boolean> {
    const result = await this.pool.query('DELETE FROM scheduled_jobs WHERE id = $1', [id]);

    if ((result.rowCount || 0) > 0) {
      logger.info('Deleted scheduled job', { id });
      return true;
    }
    return false;
  }

  /**
   * Toggle job enabled state
   */
  async toggleJob(id: number, enabled: boolean): Promise<ScheduledJob | null> {
    return this.updateJob(id, { enabled });
  }

  /**
   * Record job execution start
   */
  async recordJobStart(jobId: number): Promise<number> {
    const result = await this.pool.query(
      `
      INSERT INTO scheduled_job_runs (job_id, started_at, status)
      VALUES ($1, NOW(), 'running')
      RETURNING id
    `,
      [jobId]
    );

    return result.rows[0].id;
  }

  /**
   * Record job execution completion
   */
  async recordJobCompletion(
    runId: number,
    success: boolean,
    messageSent?: string,
    error?: string
  ): Promise<void> {
    await this.pool.query(
      `
      UPDATE scheduled_job_runs 
      SET completed_at = NOW(), 
          status = $1, 
          message_sent = $2, 
          error = $3
      WHERE id = $4
    `,
      [success ? 'success' : 'failed', messageSent || null, error || null, runId]
    );
  }

  /**
   * Update job after execution
   */
  async updateJobAfterRun(
    jobId: number,
    success: boolean,
    nextRunAt: Date | null,
    error?: string
  ): Promise<void> {
    await this.pool.query(
      `
      UPDATE scheduled_jobs 
      SET last_run_at = NOW(),
          next_run_at = $1,
          run_count = run_count + 1,
          last_error = $2,
          updated_at = NOW()
      WHERE id = $3
    `,
      [nextRunAt, success ? null : error, jobId]
    );
  }

  // ============================================
  // JOB RUN HISTORY
  // ============================================

  /**
   * Get run history for a job
   */
  async getJobRuns(jobId: number, limit: number = 50): Promise<ScheduledJobRun[]> {
    const result = await this.pool.query(
      `
      SELECT * FROM scheduled_job_runs 
      WHERE job_id = $1 
      ORDER BY started_at DESC 
      LIMIT $2
    `,
      [jobId, limit]
    );

    return result.rows.map((row) => this.rowToRun(row));
  }

  /**
   * Get recent runs across all jobs
   */
  async getRecentRuns(limit: number = 50): Promise<(ScheduledJobRun & { jobName: string })[]> {
    const result = await this.pool.query(
      `
      SELECT r.*, j.name as job_name 
      FROM scheduled_job_runs r
      JOIN scheduled_jobs j ON r.job_id = j.id
      ORDER BY r.started_at DESC 
      LIMIT $1
    `,
      [limit]
    );

    return result.rows.map((row) => ({
      ...this.rowToRun(row),
      jobName: row.job_name,
    }));
  }

  // ============================================
  // STATISTICS
  // ============================================

  /**
   * Get scheduler statistics
   */
  async getStats(): Promise<SchedulerStats> {
    const [totalJobs, enabledJobs, byProvider, byType, totalRuns, recentSuccess, recentFailed] =
      await Promise.all([
        this.pool.query('SELECT COUNT(*) as count FROM scheduled_jobs'),
        this.pool.query('SELECT COUNT(*) as count FROM scheduled_jobs WHERE enabled = TRUE'),
        this.pool.query(`
          SELECT provider, COUNT(*) as count 
          FROM scheduled_jobs 
          GROUP BY provider
        `),
        this.pool.query(`
          SELECT schedule_type, COUNT(*) as count 
          FROM scheduled_jobs 
          GROUP BY schedule_type
        `),
        this.pool.query('SELECT COUNT(*) as count FROM scheduled_job_runs'),
        this.pool.query(`
          SELECT COUNT(*) as count FROM scheduled_job_runs 
          WHERE status = 'success' AND started_at > NOW() - INTERVAL '24 hours'
        `),
        this.pool.query(`
          SELECT COUNT(*) as count FROM scheduled_job_runs 
          WHERE status = 'failed' AND started_at > NOW() - INTERVAL '24 hours'
        `),
      ]);

    type CountRow = { provider?: string; schedule_type?: string; count: string };

    return {
      totalJobs: parseInt(totalJobs.rows[0].count),
      enabledJobs: parseInt(enabledJobs.rows[0].count),
      byProvider: {
        whatsapp: parseInt(
          byProvider.rows.find((r: CountRow) => r.provider === 'whatsapp')?.count || '0'
        ),
        slack: parseInt(
          byProvider.rows.find((r: CountRow) => r.provider === 'slack')?.count || '0'
        ),
      },
      byType: {
        once: parseInt(byType.rows.find((r: CountRow) => r.schedule_type === 'once')?.count || '0'),
        recurring: parseInt(
          byType.rows.find((r: CountRow) => r.schedule_type === 'recurring')?.count || '0'
        ),
        cron: parseInt(byType.rows.find((r: CountRow) => r.schedule_type === 'cron')?.count || '0'),
      },
      totalRuns: parseInt(totalRuns.rows[0].count),
      last24Hours: {
        success: parseInt(recentSuccess.rows[0].count),
        failed: parseInt(recentFailed.rows[0].count),
      },
    };
  }

  // ============================================
  // HELPERS
  // ============================================

  /**
   * Convert database row to ScheduledJob type
   */
  private rowToJob(row: Record<string, unknown>): ScheduledJob {
    return {
      id: row.id as number,
      name: row.name as string,
      description: row.description as string | undefined,
      scheduleType: row.schedule_type as ScheduleType,
      cronExpression: row.cron_expression as string | undefined,
      runAt: row.run_at ? new Date(row.run_at as string) : undefined,
      intervalMinutes: row.interval_minutes as number | undefined,
      timezone: row.timezone as string,
      provider: row.provider as ScheduleProvider,
      target: row.target as string,
      messageTemplate: row.message_template as string,
      enabled: row.enabled as boolean,
      lastRunAt: row.last_run_at ? new Date(row.last_run_at as string) : undefined,
      nextRunAt: row.next_run_at ? new Date(row.next_run_at as string) : undefined,
      runCount: row.run_count as number,
      lastError: row.last_error as string | undefined,
      createdAt: new Date(row.created_at as string),
      updatedAt: new Date(row.updated_at as string),
    };
  }

  /**
   * Convert database row to ScheduledJobRun type
   */
  private rowToRun(row: Record<string, unknown>): ScheduledJobRun {
    return {
      id: row.id as number,
      jobId: row.job_id as number,
      startedAt: new Date(row.started_at as string),
      completedAt: row.completed_at ? new Date(row.completed_at as string) : undefined,
      status: row.status as 'running' | 'success' | 'failed',
      error: row.error as string | undefined,
      messageSent: row.message_sent as string | undefined,
    };
  }

  /**
   * Close the database connection pool
   */
  async close(): Promise<void> {
    await this.pool.end();
    logger.info('Scheduler database connection pool closed');
  }
}

/**
 * Create a SchedulerDatabase instance
 */
export function createSchedulerDatabase(connectionString?: string): SchedulerDatabase {
  return new SchedulerDatabase(connectionString);
}
