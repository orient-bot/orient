/**
 * Default Configuration Values
 *
 * This module provides sensible defaults for all configuration sections.
 * These defaults are applied when values are not provided in the config file
 * or environment variables.
 */

import type { AppConfig } from './schema.js';

/**
 * Default SLA thresholds
 * These are reasonable starting points that can be customized per organization
 */
export const DEFAULT_SLA_THRESHOLDS = [
  { status: 'In Progress', maxDays: 3 },
  { status: 'In Review', maxDays: 2 },
  { status: 'To Do', maxDays: 5 },
  { status: 'Blocked', maxDays: 1 }, // Blockers should be addressed quickly
] as const;

/**
 * Default Kanban backlog statuses
 * These are common status names for backlog items not visible on the board
 */
export const DEFAULT_KANBAN_BACKLOG_STATUSES = [
  'IN BACKLOG',
  'BACKLOG- NEXT IN LINE',
  'BACKLOG',
  'Backlog',
  'Open', // Some boards use "Open" for backlog
] as const;

/**
 * Default cron schedules (weekdays, business hours)
 */
export const DEFAULT_CRON_SCHEDULES = {
  /** 9:30 AM weekdays - standup reminder */
  standup: '30 9 * * 1-5',
  /** 9:15 AM weekdays - pre-standup data gathering */
  preStandup: '15 9 * * 1-5',
  /** 5:00 PM weekdays - check for stale issues */
  staleCheck: '0 17 * * 1-5',
  /** 4:00 PM Friday - weekly summary */
  weeklySummary: '0 16 * * 5',
} as const;

/**
 * Default feature flags
 * Most features are disabled by default to require explicit opt-in
 */
export const DEFAULT_FEATURES = {
  slaMonitoring: true, // Core functionality, enabled
  weeklyReports: true, // Core functionality, enabled
  whatsappBot: false, // Requires WhatsApp setup
  slackBot: false, // Requires Slack setup
  googleSlides: false, // Requires Google setup
  mcpServer: true, // Core MCP functionality
} as const;

/**
 * Partial default configuration
 * This provides defaults for all optional sections
 */
export const DEFAULT_CONFIG: Partial<AppConfig> = {
  features: { ...DEFAULT_FEATURES },
  sla: {
    enabled: true,
    thresholds: [...DEFAULT_SLA_THRESHOLDS],
  },
  board: {
    kanbanBacklogStatuses: [...DEFAULT_KANBAN_BACKLOG_STATUSES],
  },
  cron: { ...DEFAULT_CRON_SCHEDULES },
  agent: {
    enabled: false,
    model: 'claude-sonnet-4-20250514',
  },
  dashboard: {
    enabled: true,
    port: 4098,
    defaultPermission: 'read_only',
  },
  messageDatabase: {
    dbPath: './data/messages.db',
  },
  timezone: 'UTC',
  logLevel: 'info',
};

/**
 * Get a complete config by merging provided values with defaults
 * This is a deep merge that preserves nested structures
 */
export function mergeWithDefaults(partial: Partial<AppConfig>): Partial<AppConfig> {
  return {
    ...DEFAULT_CONFIG,
    ...partial,
    features: {
      ...DEFAULT_FEATURES,
      ...partial.features,
    },
    sla: {
      enabled: partial.sla?.enabled ?? DEFAULT_CONFIG.sla?.enabled ?? true,
      thresholds: partial.sla?.thresholds ?? DEFAULT_CONFIG.sla?.thresholds ?? [],
    },
    board: {
      kanbanBacklogStatuses:
        partial.board?.kanbanBacklogStatuses ?? DEFAULT_CONFIG.board?.kanbanBacklogStatuses ?? [],
    },
    cron: {
      ...DEFAULT_CRON_SCHEDULES,
      ...partial.cron,
    },
    agent: {
      enabled: partial.agent?.enabled ?? DEFAULT_CONFIG.agent?.enabled ?? false,
      model: partial.agent?.model ?? DEFAULT_CONFIG.agent?.model ?? 'claude-sonnet-4-20250514',
      anthropicApiKey: partial.agent?.anthropicApiKey ?? DEFAULT_CONFIG.agent?.anthropicApiKey,
    },
    dashboard: {
      enabled: partial.dashboard?.enabled ?? DEFAULT_CONFIG.dashboard?.enabled ?? true,
      port: partial.dashboard?.port ?? DEFAULT_CONFIG.dashboard?.port ?? 4098,
      defaultPermission:
        partial.dashboard?.defaultPermission ??
        DEFAULT_CONFIG.dashboard?.defaultPermission ??
        'read_only',
      jwtSecret: partial.dashboard?.jwtSecret ?? DEFAULT_CONFIG.dashboard?.jwtSecret,
    },
    messageDatabase: {
      dbPath:
        partial.messageDatabase?.dbPath ??
        DEFAULT_CONFIG.messageDatabase?.dbPath ??
        './data/messages.db',
      retentionDays:
        partial.messageDatabase?.retentionDays ?? DEFAULT_CONFIG.messageDatabase?.retentionDays,
    },
  };
}
