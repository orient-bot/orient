/**
 * Scheduler Types
 *
 * Types for the scheduling service that handles automated notifications
 * via WhatsApp Business and Slack.
 */

// ============================================
// SCHEDULE CONFIGURATION TYPES
// ============================================

/**
 * Type of schedule
 * - once: Run at a specific date/time
 * - recurring: Run every X minutes
 * - cron: Run on a cron schedule
 */
export type ScheduleType = 'once' | 'recurring' | 'cron';

/**
 * Delivery provider
 */
export type ScheduleProvider = 'whatsapp' | 'slack';

/**
 * Run status for job history
 */
export type RunStatus = 'running' | 'success' | 'failed';

// ============================================
// SCHEDULED JOB TYPES
// ============================================

/**
 * A scheduled job stored in the database
 */
export interface ScheduledJob {
  id: number;
  name: string;
  description?: string;

  // Schedule configuration
  scheduleType: ScheduleType;
  cronExpression?: string; // For cron type: "0 8 * * 1-5"
  runAt?: Date; // For once type: specific datetime
  intervalMinutes?: number; // For recurring type
  timezone: string; // IANA timezone (e.g., "Asia/Jerusalem")

  // Delivery configuration
  provider: ScheduleProvider;
  target: string; // Phone number or channel ID
  messageTemplate: string; // Message to send (supports template variables)

  // Job metadata
  enabled: boolean;
  lastRunAt?: Date;
  nextRunAt?: Date;
  runCount: number;
  lastError?: string;

  createdAt: Date;
  updatedAt: Date;
}

/**
 * A record of a scheduled job run
 */
export interface ScheduledJobRun {
  id: number;
  jobId: number;
  startedAt: Date;
  completedAt?: Date;
  status: RunStatus;
  error?: string;
  messageSent?: string;
}

// ============================================
// INPUT TYPES
// ============================================

/**
 * Input for creating a new scheduled job
 */
export interface CreateScheduledJobInput {
  name: string;
  description?: string;
  scheduleType: ScheduleType;
  cronExpression?: string;
  runAt?: Date | string;
  intervalMinutes?: number;
  timezone?: string;
  provider: ScheduleProvider;
  target: string;
  messageTemplate: string;
  enabled?: boolean;
  nextRunAt?: Date;
}

/**
 * Input for updating a scheduled job
 */
export interface UpdateScheduledJobInput {
  name?: string;
  description?: string;
  scheduleType?: ScheduleType;
  cronExpression?: string;
  runAt?: Date | string;
  intervalMinutes?: number;
  timezone?: string;
  provider?: ScheduleProvider;
  target?: string;
  messageTemplate?: string;
  enabled?: boolean;
  nextRunAt?: Date | null;
}

// ============================================
// STATISTICS TYPES
// ============================================

/**
 * Scheduler statistics for dashboard
 */
export interface SchedulerStats {
  totalJobs: number;
  enabledJobs: number;
  byProvider: {
    whatsapp: number;
    slack: number;
  };
  byType: {
    once: number;
    recurring: number;
    cron: number;
  };
  totalRuns: number;
  last24Hours: {
    success: number;
    failed: number;
  };
}

// ============================================
// TEMPLATE VARIABLES
// ============================================

/**
 * Available template variables for message templates
 * These are replaced at runtime when the scheduled message is sent
 */
export interface TemplateVariables {
  // Date/Time
  '{{date}}': string; // Current date (YYYY-MM-DD)
  '{{time}}': string; // Current time (HH:MM)
  '{{datetime}}': string; // Full datetime
  '{{day}}': string; // Day name (Monday, Tuesday, etc.)

  // Job info
  '{{job.name}}': string; // Job name
  '{{job.runCount}}': number; // How many times this job has run

  // Dynamic (fetched at runtime)
  '{{jira.blockers}}': string; // Current blockers from JIRA
  '{{jira.inProgress}}': string; // In-progress issues
}

// ============================================
// COMMON SCHEDULE PRESETS
// ============================================

/**
 * Common cron expressions for quick setup
 */
export const CRON_PRESETS = {
  // Weekday mornings
  WEEKDAY_8AM: '0 8 * * 1-5',
  WEEKDAY_9AM: '0 9 * * 1-5',
  WEEKDAY_830AM: '30 8 * * 1-5',

  // End of day
  WEEKDAY_5PM: '0 17 * * 1-5',
  WEEKDAY_6PM: '0 18 * * 1-5',

  // Weekly
  MONDAY_9AM: '0 9 * * 1',
  FRIDAY_4PM: '0 16 * * 5',
  SUNDAY_8PM: '0 20 * * 0',

  // Hourly checks
  EVERY_HOUR: '0 * * * *',
  EVERY_2_HOURS: '0 */2 * * *',
  EVERY_4_HOURS: '0 */4 * * *',

  // Daily
  DAILY_9AM: '0 9 * * *',
  DAILY_MIDNIGHT: '0 0 * * *',
} as const;

/**
 * Common timezone options
 */
export const COMMON_TIMEZONES = [
  'UTC',
  'Asia/Jerusalem',
  'America/New_York',
  'America/Los_Angeles',
  'Europe/London',
  'Europe/Paris',
  'Asia/Tokyo',
  'Australia/Sydney',
] as const;
