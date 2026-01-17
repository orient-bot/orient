/**
 * Scheduler Service
 *
 * Manages scheduled jobs using node-cron for time-based execution.
 * Supports cron expressions, recurring intervals, and one-time schedules.
 * Delivers messages via WhatsApp Business or Slack.
 */

import cron, { ScheduledTask } from 'node-cron';
import { createServiceLogger } from '@orient/core';
import { SchedulerDatabase } from './schedulerDatabase.js';
import {
  ScheduledJob,
  CreateScheduledJobInput,
  UpdateScheduledJobInput,
  SchedulerStats,
  ScheduledJobRun,
} from '../types/scheduler.js';

const logger = createServiceLogger('scheduler');

/**
 * Message sender interface for sending scheduled messages
 */
export interface MessageSender {
  sendWhatsApp(target: string, message: string): Promise<void>;
  sendSlack(target: string, message: string): Promise<void>;
}

/**
 * Scheduler Service Configuration
 */
export interface SchedulerConfig {
  checkIntervalMs?: number; // How often to check for due jobs (default: 60000 = 1 min)
  defaultTimezone?: string; // Default timezone (default: 'Asia/Jerusalem')
}

/**
 * Scheduler Service
 *
 * Handles job scheduling, execution, and notification delivery.
 */
export class SchedulerService {
  private db: SchedulerDatabase;
  private messageSender: MessageSender | null = null;
  private cronTasks: Map<number, ScheduledTask> = new Map();
  private checkInterval: NodeJS.Timeout | null = null;
  private config: SchedulerConfig;
  private isRunning: boolean = false;

  constructor(db: SchedulerDatabase, config: SchedulerConfig = {}) {
    this.db = db;
    this.config = {
      checkIntervalMs: config.checkIntervalMs || 60000,
      defaultTimezone: config.defaultTimezone || 'Asia/Jerusalem',
    };
  }

  /**
   * Set the message sender for delivering scheduled messages
   */
  setMessageSender(sender: MessageSender): void {
    this.messageSender = sender;
    logger.info('Message sender configured');
  }

  /**
   * Start the scheduler service
   */
  async start(): Promise<void> {
    if (this.isRunning) {
      logger.warn('Scheduler already running');
      return;
    }

    await this.db.initialize();
    this.isRunning = true;

    // Load and schedule all enabled cron jobs
    const jobs = await this.db.getAllJobs();
    let scheduledCount = 0;

    for (const job of jobs) {
      if (job.enabled && job.scheduleType === 'cron' && job.cronExpression) {
        this.scheduleCronJob(job);
        scheduledCount++;
      }
    }

    // Start interval checker for recurring and one-time jobs
    this.checkInterval = setInterval(() => this.checkDueJobs(), this.config.checkIntervalMs);

    logger.info('Scheduler service started', {
      cronJobsScheduled: scheduledCount,
      checkIntervalMs: this.config.checkIntervalMs,
    });
  }

  /**
   * Stop the scheduler service
   */
  async stop(): Promise<void> {
    if (!this.isRunning) {
      return;
    }

    // Stop all cron tasks
    for (const [jobId, task] of this.cronTasks) {
      task.stop();
      logger.debug('Stopped cron task', { jobId });
    }
    this.cronTasks.clear();

    // Stop interval checker
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
      this.checkInterval = null;
    }

    this.isRunning = false;
    logger.info('Scheduler service stopped');
  }

  // ============================================
  // JOB MANAGEMENT
  // ============================================

  /**
   * Create a new scheduled job
   */
  async createJob(input: CreateScheduledJobInput): Promise<ScheduledJob> {
    // Calculate next run time
    const nextRunAt = this.calculateNextRun(input);

    const job = await this.db.createJob({
      ...input,
      nextRunAt,
    });

    // If cron job, schedule it immediately
    if (job.enabled && job.scheduleType === 'cron' && job.cronExpression) {
      this.scheduleCronJob(job);
    }

    logger.info('Created scheduled job', {
      id: job.id,
      name: job.name,
      scheduleType: job.scheduleType,
      nextRunAt: job.nextRunAt,
    });

    return job;
  }

  /**
   * Get a job by ID
   */
  async getJob(id: number): Promise<ScheduledJob | null> {
    return this.db.getJob(id);
  }

  /**
   * Get all jobs
   */
  async getAllJobs(): Promise<ScheduledJob[]> {
    return this.db.getAllJobs();
  }

  /**
   * Update a job
   */
  async updateJob(id: number, input: UpdateScheduledJobInput): Promise<ScheduledJob | null> {
    const existingJob = await this.db.getJob(id);
    if (!existingJob) {
      return null;
    }

    // Stop existing cron task if running
    this.stopCronTask(id);

    // Recalculate next run if schedule changed
    let nextRunAt = input.nextRunAt;
    if (
      input.scheduleType !== undefined ||
      input.cronExpression !== undefined ||
      input.runAt !== undefined ||
      input.intervalMinutes !== undefined
    ) {
      // Create a merged object for calculating next run
      const mergedForCalc: CreateScheduledJobInput = {
        name: input.name ?? existingJob.name,
        scheduleType: input.scheduleType ?? existingJob.scheduleType,
        provider: input.provider ?? existingJob.provider,
        target: input.target ?? existingJob.target,
        messageTemplate: input.messageTemplate ?? existingJob.messageTemplate,
        description: input.description ?? existingJob.description,
        cronExpression: input.cronExpression ?? existingJob.cronExpression,
        runAt: input.runAt ?? existingJob.runAt,
        intervalMinutes: input.intervalMinutes ?? existingJob.intervalMinutes,
        timezone: input.timezone ?? existingJob.timezone,
        enabled: input.enabled ?? existingJob.enabled,
      };
      nextRunAt = this.calculateNextRun(mergedForCalc);
    }

    const job = await this.db.updateJob(id, { ...input, nextRunAt });
    if (!job) {
      return null;
    }

    // Reschedule cron task if enabled
    if (job.enabled && job.scheduleType === 'cron' && job.cronExpression) {
      this.scheduleCronJob(job);
    }

    logger.info('Updated scheduled job', { id, name: job.name });
    return job;
  }

  /**
   * Delete a job
   */
  async deleteJob(id: number): Promise<boolean> {
    this.stopCronTask(id);
    const deleted = await this.db.deleteJob(id);
    if (deleted) {
      logger.info('Deleted scheduled job', { id });
    }
    return deleted;
  }

  /**
   * Toggle job enabled state
   */
  async toggleJob(id: number, enabled: boolean): Promise<ScheduledJob | null> {
    const job = await this.db.toggleJob(id, enabled);
    if (!job) {
      return null;
    }

    if (enabled && job.scheduleType === 'cron' && job.cronExpression) {
      this.scheduleCronJob(job);
    } else {
      this.stopCronTask(id);
    }

    logger.info('Toggled scheduled job', { id, enabled });
    return job;
  }

  /**
   * Manually run a job now
   */
  async runJobNow(id: number): Promise<{ success: boolean; error?: string; messageSent?: string }> {
    const job = await this.db.getJob(id);
    if (!job) {
      return { success: false, error: 'Job not found' };
    }

    return this.executeJob(job);
  }

  /**
   * Get job run history
   */
  async getJobRuns(jobId: number, limit: number = 50): Promise<ScheduledJobRun[]> {
    return this.db.getJobRuns(jobId, limit);
  }

  /**
   * Get recent runs across all jobs
   */
  async getRecentRuns(limit: number = 50): Promise<(ScheduledJobRun & { jobName: string })[]> {
    return this.db.getRecentRuns(limit);
  }

  /**
   * Get scheduler statistics
   */
  async getStats(): Promise<SchedulerStats> {
    return this.db.getStats();
  }

  // ============================================
  // SCHEDULING LOGIC
  // ============================================

  /**
   * Schedule a cron job
   */
  private scheduleCronJob(job: ScheduledJob): void {
    if (!job.cronExpression) {
      logger.warn('Cannot schedule cron job without expression', { jobId: job.id });
      return;
    }

    // Validate cron expression
    if (!cron.validate(job.cronExpression)) {
      logger.error('Invalid cron expression', {
        jobId: job.id,
        expression: job.cronExpression,
      });
      return;
    }

    // Stop existing task if any
    this.stopCronTask(job.id);

    // Schedule new task
    const task = cron.schedule(
      job.cronExpression,
      async () => {
        logger.info('Cron job triggered', { jobId: job.id, name: job.name });
        await this.executeJob(job);
      },
      {
        timezone: job.timezone || this.config.defaultTimezone,
      }
    );

    this.cronTasks.set(job.id, task);
    logger.debug('Scheduled cron job', {
      jobId: job.id,
      expression: job.cronExpression,
      timezone: job.timezone,
    });
  }

  /**
   * Stop a cron task
   */
  private stopCronTask(jobId: number): void {
    const task = this.cronTasks.get(jobId);
    if (task) {
      task.stop();
      this.cronTasks.delete(jobId);
      logger.debug('Stopped cron task', { jobId });
    }
  }

  /**
   * Check for due jobs (recurring and one-time)
   */
  private async checkDueJobs(): Promise<void> {
    try {
      const dueJobs = await this.db.getDueJobs();

      for (const job of dueJobs) {
        // Skip cron jobs (they have their own scheduler)
        if (job.scheduleType === 'cron') {
          continue;
        }

        logger.info('Executing due job', { jobId: job.id, name: job.name });
        await this.executeJob(job);
      }
    } catch (error) {
      logger.error('Error checking due jobs', {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  /**
   * Execute a scheduled job
   */
  private async executeJob(
    job: ScheduledJob
  ): Promise<{ success: boolean; error?: string; messageSent?: string }> {
    // Record job start
    const runId = await this.db.recordJobStart(job.id);

    try {
      // Generate message from template
      const message = this.processTemplate(job.messageTemplate, job);

      // Send message
      await this.sendMessage(job.provider, job.target, message);

      // Calculate next run time
      const nextRunAt = this.calculateNextRunAfterExecution(job);

      // Record success
      await this.db.recordJobCompletion(runId, true, message);
      await this.db.updateJobAfterRun(job.id, true, nextRunAt);

      // Disable one-time jobs after successful execution
      if (job.scheduleType === 'once') {
        await this.db.updateJob(job.id, { enabled: false });
        logger.info('One-time job completed and disabled', {
          jobId: job.id,
          name: job.name,
        });
      }

      logger.info('Job executed successfully', {
        jobId: job.id,
        name: job.name,
        provider: job.provider,
        nextRunAt,
      });

      return { success: true, messageSent: message };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);

      // Calculate next run time (still schedule next run even on failure)
      const nextRunAt = this.calculateNextRunAfterExecution(job);

      // Record failure
      await this.db.recordJobCompletion(runId, false, undefined, errorMessage);
      await this.db.updateJobAfterRun(job.id, false, nextRunAt, errorMessage);

      logger.error('Job execution failed', {
        jobId: job.id,
        name: job.name,
        error: errorMessage,
      });

      return { success: false, error: errorMessage };
    }
  }

  /**
   * Send message via the appropriate provider
   */
  private async sendMessage(provider: string, target: string, message: string): Promise<void> {
    if (!this.messageSender) {
      throw new Error('Message sender not configured');
    }

    if (provider === 'whatsapp') {
      await this.messageSender.sendWhatsApp(target, message);
    } else if (provider === 'slack') {
      await this.messageSender.sendSlack(target, message);
    } else {
      throw new Error(`Unknown provider: ${provider}`);
    }
  }

  /**
   * Process message template with variables
   */
  private processTemplate(template: string, job: ScheduledJob): string {
    const now = new Date();
    const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

    let processed = template;

    // Date/time variables
    processed = processed.replace(/\{\{date\}\}/g, now.toISOString().split('T')[0]);
    processed = processed.replace(/\{\{time\}\}/g, now.toTimeString().slice(0, 5));
    processed = processed.replace(/\{\{datetime\}\}/g, now.toISOString());
    processed = processed.replace(/\{\{day\}\}/g, days[now.getDay()]);

    // Job info variables
    processed = processed.replace(/\{\{job\.name\}\}/g, job.name);
    processed = processed.replace(/\{\{job\.runCount\}\}/g, String(job.runCount + 1));

    return processed;
  }

  /**
   * Calculate initial next run time for a new job
   */
  private calculateNextRun(
    input: CreateScheduledJobInput | (ScheduledJob & Partial<UpdateScheduledJobInput>)
  ): Date | undefined {
    const now = new Date();

    switch (input.scheduleType) {
      case 'once':
        if (input.runAt) {
          const runAt = typeof input.runAt === 'string' ? new Date(input.runAt) : input.runAt;
          return runAt > now ? runAt : undefined;
        }
        return undefined;

      case 'recurring':
        if (input.intervalMinutes) {
          return new Date(now.getTime() + input.intervalMinutes * 60 * 1000);
        }
        return undefined;

      case 'cron':
        // For cron, node-cron handles the scheduling, but we can calculate next run
        // for display purposes using a simple approach
        if (input.cronExpression && cron.validate(input.cronExpression)) {
          // For now, just return a placeholder - actual scheduling is handled by node-cron
          return undefined;
        }
        return undefined;

      default:
        return undefined;
    }
  }

  /**
   * Calculate next run time after job execution
   */
  private calculateNextRunAfterExecution(job: ScheduledJob): Date | null {
    const now = new Date();

    switch (job.scheduleType) {
      case 'once':
        // One-time jobs don't run again
        return null;

      case 'recurring':
        if (job.intervalMinutes) {
          return new Date(now.getTime() + job.intervalMinutes * 60 * 1000);
        }
        return null;

      case 'cron':
        // Cron jobs are scheduled by node-cron, we don't need to track next run
        return null;

      default:
        return null;
    }
  }

  /**
   * Validate a cron expression
   */
  static validateCronExpression(expression: string): boolean {
    return cron.validate(expression);
  }

  /**
   * Get human-readable description of a cron expression
   */
  static describeCronExpression(expression: string): string {
    // Basic descriptions for common patterns
    const descriptions: Record<string, string> = {
      '0 8 * * 1-5': 'Weekdays at 8:00 AM',
      '0 9 * * 1-5': 'Weekdays at 9:00 AM',
      '30 8 * * 1-5': 'Weekdays at 8:30 AM',
      '0 17 * * 1-5': 'Weekdays at 5:00 PM',
      '0 18 * * 1-5': 'Weekdays at 6:00 PM',
      '0 9 * * 1': 'Mondays at 9:00 AM',
      '0 16 * * 5': 'Fridays at 4:00 PM',
      '0 * * * *': 'Every hour',
      '0 */2 * * *': 'Every 2 hours',
      '0 */4 * * *': 'Every 4 hours',
      '0 9 * * *': 'Daily at 9:00 AM',
      '0 0 * * *': 'Daily at midnight',
    };

    if (descriptions[expression]) {
      return descriptions[expression];
    }

    // Parse and describe
    const parts = expression.split(' ');
    if (parts.length !== 5) {
      return expression;
    }

    const [minute, hour, dayOfMonth, month, dayOfWeek] = parts;

    let desc = '';

    // Time
    if (minute !== '*' && hour !== '*') {
      desc = `At ${hour.padStart(2, '0')}:${minute.padStart(2, '0')}`;
    } else if (hour !== '*') {
      desc = `At ${hour}:00`;
    } else if (minute === '0') {
      desc = 'Every hour';
    } else {
      desc = expression;
    }

    // Day of week
    if (dayOfWeek === '1-5') {
      desc += ' on weekdays';
    } else if (dayOfWeek === '0,6') {
      desc += ' on weekends';
    } else if (dayOfWeek !== '*') {
      const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
      desc += ` on ${days[parseInt(dayOfWeek)] || dayOfWeek}`;
    }

    return desc || expression;
  }
}

/**
 * Create a SchedulerService instance
 */
export function createSchedulerService(
  db: SchedulerDatabase,
  config?: SchedulerConfig
): SchedulerService {
  return new SchedulerService(db, config);
}
