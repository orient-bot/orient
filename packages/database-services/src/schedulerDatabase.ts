/**
 * Scheduler Database Service
 *
 * SQLite database for storing scheduled jobs and their execution history using Drizzle ORM.
 * Supports cron, recurring, and one-time schedules with timezone support.
 */

import { createServiceLogger } from '@orientbot/core';
import {
  getDatabase,
  eq,
  desc,
  and,
  or,
  lte,
  isNull,
  sql,
  count,
  schema,
} from '@orientbot/database';
import type { Database } from '@orientbot/database';
import {
  ScheduledJob,
  ScheduledJobRun,
  ScheduleType,
  ScheduleProvider,
  CreateScheduledJobInput,
  UpdateScheduledJobInput,
  SchedulerStats,
} from './types/scheduler.js';

const logger = createServiceLogger('scheduler-db');

export class SchedulerDatabase {
  private _db: Database | null = null;

  private get db(): Database {
    if (!this._db) {
      this._db = getDatabase();
    }
    return this._db;
  }

  /**
   * Initialize the database (no-op for SQLite - schema managed via migrations)
   */
  async initialize(): Promise<void> {
    logger.info('Scheduler database initialized (SQLite)');
  }

  // ============================================
  // JOB CRUD OPERATIONS
  // ============================================

  /**
   * Create a new scheduled job
   */
  async createJob(input: CreateScheduledJobInput): Promise<ScheduledJob> {
    // Convert string dates to Date objects
    const runAt = input.runAt
      ? input.runAt instanceof Date
        ? input.runAt
        : new Date(input.runAt)
      : null;

    const result = await this.db
      .insert(schema.scheduledJobs)
      .values({
        name: input.name,
        description: input.description || null,
        scheduleType: input.scheduleType,
        cronExpression: input.cronExpression || null,
        runAt,
        intervalMinutes: input.intervalMinutes || null,
        timezone: input.timezone || 'UTC',
        provider: input.provider,
        target: input.target,
        messageTemplate: input.messageTemplate,
        enabled: input.enabled !== false,
        nextRunAt: input.nextRunAt || null,
      })
      .returning();

    logger.info('Created scheduled job', {
      id: result[0].id,
      name: input.name,
      scheduleType: input.scheduleType,
    });

    return this.rowToJob(result[0]);
  }

  /**
   * Get a job by ID
   */
  async getJob(id: number): Promise<ScheduledJob | null> {
    const result = await this.db
      .select()
      .from(schema.scheduledJobs)
      .where(eq(schema.scheduledJobs.id, id))
      .limit(1);

    return result.length > 0 ? this.rowToJob(result[0]) : null;
  }

  /**
   * Get all scheduled jobs
   */
  async getAllJobs(): Promise<ScheduledJob[]> {
    const result = await this.db
      .select()
      .from(schema.scheduledJobs)
      .orderBy(desc(schema.scheduledJobs.createdAt));

    return result.map((row) => this.rowToJob(row));
  }

  /**
   * Get enabled jobs that are due to run
   */
  async getDueJobs(): Promise<ScheduledJob[]> {
    const now = new Date();
    const result = await this.db
      .select()
      .from(schema.scheduledJobs)
      .where(
        and(
          eq(schema.scheduledJobs.enabled, true),
          or(isNull(schema.scheduledJobs.nextRunAt), lte(schema.scheduledJobs.nextRunAt, now))
        )
      )
      .orderBy(schema.scheduledJobs.nextRunAt);

    return result.map((row) => this.rowToJob(row));
  }

  /**
   * Get jobs by provider
   */
  async getJobsByProvider(provider: ScheduleProvider): Promise<ScheduledJob[]> {
    const result = await this.db
      .select()
      .from(schema.scheduledJobs)
      .where(eq(schema.scheduledJobs.provider, provider))
      .orderBy(desc(schema.scheduledJobs.createdAt));

    return result.map((row) => this.rowToJob(row));
  }

  /**
   * Update a scheduled job
   */
  async updateJob(id: number, input: UpdateScheduledJobInput): Promise<ScheduledJob | null> {
    const updateData: Record<string, unknown> = {
      updatedAt: new Date(),
    };

    if (input.name !== undefined) updateData.name = input.name;
    if (input.description !== undefined) updateData.description = input.description;
    if (input.scheduleType !== undefined) updateData.scheduleType = input.scheduleType;
    if (input.cronExpression !== undefined) updateData.cronExpression = input.cronExpression;
    if (input.runAt !== undefined) updateData.runAt = input.runAt;
    if (input.intervalMinutes !== undefined) updateData.intervalMinutes = input.intervalMinutes;
    if (input.timezone !== undefined) updateData.timezone = input.timezone;
    if (input.provider !== undefined) updateData.provider = input.provider;
    if (input.target !== undefined) updateData.target = input.target;
    if (input.messageTemplate !== undefined) updateData.messageTemplate = input.messageTemplate;
    if (input.enabled !== undefined) updateData.enabled = input.enabled;
    if (input.nextRunAt !== undefined) updateData.nextRunAt = input.nextRunAt;

    const result = await this.db
      .update(schema.scheduledJobs)
      .set(updateData)
      .where(eq(schema.scheduledJobs.id, id))
      .returning();

    if (result.length === 0) {
      return null;
    }

    logger.info('Updated scheduled job', { id });
    return this.rowToJob(result[0]);
  }

  /**
   * Delete a scheduled job
   */
  async deleteJob(id: number): Promise<boolean> {
    const result = await this.db
      .delete(schema.scheduledJobs)
      .where(eq(schema.scheduledJobs.id, id))
      .returning({ id: schema.scheduledJobs.id });

    if (result.length > 0) {
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
    const result = await this.db
      .insert(schema.scheduledJobRuns)
      .values({
        jobId,
        startedAt: new Date(),
        status: 'running',
      })
      .returning({ id: schema.scheduledJobRuns.id });

    return result[0].id;
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
    await this.db
      .update(schema.scheduledJobRuns)
      .set({
        completedAt: new Date(),
        status: success ? 'success' : 'failed',
        messageSent: messageSent || null,
        error: error || null,
      })
      .where(eq(schema.scheduledJobRuns.id, runId));
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
    const job = await this.getJob(jobId);
    await this.db
      .update(schema.scheduledJobs)
      .set({
        lastRunAt: new Date(),
        nextRunAt,
        runCount: (job?.runCount || 0) + 1,
        lastError: success ? null : error,
        updatedAt: new Date(),
      })
      .where(eq(schema.scheduledJobs.id, jobId));
  }

  // ============================================
  // JOB RUN HISTORY
  // ============================================

  /**
   * Get run history for a job
   */
  async getJobRuns(jobId: number, limit: number = 50): Promise<ScheduledJobRun[]> {
    const result = await this.db
      .select()
      .from(schema.scheduledJobRuns)
      .where(eq(schema.scheduledJobRuns.jobId, jobId))
      .orderBy(desc(schema.scheduledJobRuns.startedAt))
      .limit(limit);

    return result.map((row) => this.rowToRun(row));
  }

  /**
   * Get recent runs across all jobs
   */
  async getRecentRuns(limit: number = 50): Promise<(ScheduledJobRun & { jobName: string })[]> {
    const result = await this.db
      .select({
        id: schema.scheduledJobRuns.id,
        jobId: schema.scheduledJobRuns.jobId,
        startedAt: schema.scheduledJobRuns.startedAt,
        completedAt: schema.scheduledJobRuns.completedAt,
        status: schema.scheduledJobRuns.status,
        error: schema.scheduledJobRuns.error,
        messageSent: schema.scheduledJobRuns.messageSent,
        jobName: schema.scheduledJobs.name,
      })
      .from(schema.scheduledJobRuns)
      .innerJoin(schema.scheduledJobs, eq(schema.scheduledJobRuns.jobId, schema.scheduledJobs.id))
      .orderBy(desc(schema.scheduledJobRuns.startedAt))
      .limit(limit);

    return result.map((row) => ({
      ...this.rowToRun(row),
      jobName: row.jobName,
    }));
  }

  // ============================================
  // STATISTICS
  // ============================================

  /**
   * Get scheduler statistics
   */
  async getStats(): Promise<SchedulerStats> {
    const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);

    const [totalJobsResult, enabledJobsResult, byProviderResult, byTypeResult, totalRunsResult] =
      await Promise.all([
        this.db.select({ count: count() }).from(schema.scheduledJobs),
        this.db
          .select({ count: count() })
          .from(schema.scheduledJobs)
          .where(eq(schema.scheduledJobs.enabled, true)),
        this.db
          .select({
            provider: schema.scheduledJobs.provider,
            count: count(),
          })
          .from(schema.scheduledJobs)
          .groupBy(schema.scheduledJobs.provider),
        this.db
          .select({
            scheduleType: schema.scheduledJobs.scheduleType,
            count: count(),
          })
          .from(schema.scheduledJobs)
          .groupBy(schema.scheduledJobs.scheduleType),
        this.db.select({ count: count() }).from(schema.scheduledJobRuns),
      ]);

    // Get recent success/failed counts
    const recentSuccessResult = await this.db
      .select({ count: count() })
      .from(schema.scheduledJobRuns)
      .where(
        and(
          eq(schema.scheduledJobRuns.status, 'success'),
          sql`${schema.scheduledJobRuns.startedAt} > ${twentyFourHoursAgo.getTime() / 1000}`
        )
      );

    const recentFailedResult = await this.db
      .select({ count: count() })
      .from(schema.scheduledJobRuns)
      .where(
        and(
          eq(schema.scheduledJobRuns.status, 'failed'),
          sql`${schema.scheduledJobRuns.startedAt} > ${twentyFourHoursAgo.getTime() / 1000}`
        )
      );

    return {
      totalJobs: totalJobsResult[0]?.count || 0,
      enabledJobs: enabledJobsResult[0]?.count || 0,
      byProvider: {
        whatsapp: byProviderResult.find((r) => r.provider === 'whatsapp')?.count || 0,
        slack: byProviderResult.find((r) => r.provider === 'slack')?.count || 0,
      },
      byType: {
        once: byTypeResult.find((r) => r.scheduleType === 'once')?.count || 0,
        recurring: byTypeResult.find((r) => r.scheduleType === 'recurring')?.count || 0,
        cron: byTypeResult.find((r) => r.scheduleType === 'cron')?.count || 0,
      },
      totalRuns: totalRunsResult[0]?.count || 0,
      last24Hours: {
        success: recentSuccessResult[0]?.count || 0,
        failed: recentFailedResult[0]?.count || 0,
      },
    };
  }

  // ============================================
  // HELPERS
  // ============================================

  /**
   * Convert database row to ScheduledJob type
   */
  private rowToJob(row: typeof schema.scheduledJobs.$inferSelect): ScheduledJob {
    return {
      id: row.id,
      name: row.name,
      description: row.description || undefined,
      scheduleType: row.scheduleType as ScheduleType,
      cronExpression: row.cronExpression || undefined,
      runAt: row.runAt || undefined,
      intervalMinutes: row.intervalMinutes || undefined,
      timezone: row.timezone || 'UTC',
      provider: row.provider as ScheduleProvider,
      target: row.target,
      messageTemplate: row.messageTemplate,
      enabled: row.enabled ?? true,
      lastRunAt: row.lastRunAt || undefined,
      nextRunAt: row.nextRunAt || undefined,
      runCount: row.runCount || 0,
      lastError: row.lastError || undefined,
      createdAt: row.createdAt || new Date(),
      updatedAt: row.updatedAt || new Date(),
    };
  }

  /**
   * Convert database row to ScheduledJobRun type
   */
  private rowToRun(row: Partial<typeof schema.scheduledJobRuns.$inferSelect>): ScheduledJobRun {
    return {
      id: row.id!,
      jobId: row.jobId!,
      startedAt: row.startedAt!,
      completedAt: row.completedAt || undefined,
      status: row.status as 'running' | 'success' | 'failed',
      error: row.error || undefined,
      messageSent: row.messageSent || undefined,
    };
  }

  /**
   * Close the database connection (no-op for SQLite singleton)
   */
  async close(): Promise<void> {
    logger.info('Scheduler database connection closed');
  }
}

/**
 * Create a SchedulerDatabase instance
 */
export function createSchedulerDatabase(): SchedulerDatabase {
  return new SchedulerDatabase();
}
