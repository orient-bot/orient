/**
 * Schedule Configuration Tools
 *
 * Tools for managing scheduled messages and jobs:
 * - config_create_schedule: Create a new scheduled message (with confirmation)
 * - config_update_schedule: Update an existing schedule (with confirmation)
 * - config_delete_schedule: Delete a schedule (with confirmation)
 * - config_list_schedules: List all schedules
 */

import { z } from 'zod';
import { createTool, MCPTool } from '../base.js';
import type { ToolContext } from '../../types.js';
import { getPendingActionsStore } from './pending-store.js';

// Register the executor when the module loads
import { registerScheduleExecutor } from './executors/schedule-executor.js';
registerScheduleExecutor();

const targetTypeSchema = z.enum(['whatsapp', 'slack']);

type ScheduleRecord = {
  id: number;
  name: string;
  cronExpression?: string;
  provider: 'whatsapp' | 'slack';
  target: string;
  messageTemplate: string;
  enabled: boolean;
  lastRunAt?: Date;
  nextRunAt?: Date;
};

/**
 * Create a new scheduled message (creates pending action)
 */
export const configCreateSchedule: MCPTool = createTool({
  name: 'config_create_schedule',
  description:
    'Create a new scheduled message or job. Creates a pending action that requires user confirmation. Uses cron expressions for scheduling.',
  category: 'system',
  inputSchema: z.object({
    name: z.string().describe('Human-readable name for the schedule'),
    cron_expression: z.string().describe('Cron expression (e.g., "0 9 * * 1-5" for 9am weekdays)'),
    target_type: targetTypeSchema.describe('Destination platform: whatsapp or slack'),
    target_id: z.string().describe('Target identifier: chat ID for WhatsApp, channel ID for Slack'),
    message: z.string().describe('The message to send'),
    enabled: z.boolean().optional().describe('Whether the schedule is active (default: true)'),
  }),
  keywords: ['schedule', 'create', 'recurring', 'cron', 'reminder', 'message'],
  useCases: [
    'Create a daily standup reminder',
    'Schedule weekly reports',
    'Set up recurring notifications',
    'Create automated messages',
  ],
  examples: [
    {
      description: 'Daily standup reminder at 9am weekdays',
      input: {
        name: 'Daily Standup Reminder',
        cron_expression: '0 9 * * 1-5',
        target_type: 'whatsapp',
        target_id: '120363123456789@g.us',
        message: 'Good morning! Time for standup.',
      },
    },
  ],
  execute: async (
    input: {
      name: string;
      cron_expression: string;
      target_type: 'whatsapp' | 'slack';
      target_id: string;
      message: string;
      enabled?: boolean;
    },
    _context: ToolContext
  ) => {
    const store = getPendingActionsStore();

    const summary = `Create schedule "${input.name}" (${input.cron_expression}) → ${input.target_type} ${input.target_id.substring(0, 20)}`;

    const result = store.createPendingAction(
      'schedule',
      'create',
      input.name,
      {
        name: input.name,
        scheduleType: 'cron',
        cronExpression: input.cron_expression,
        provider: input.target_type,
        target: input.target_id,
        messageTemplate: input.message,
        enabled: input.enabled ?? true,
        timezone: 'UTC',
      },
      {
        targetDisplay: input.name,
        summary,
      }
    );

    return {
      status: 'pending',
      action_id: result.actionId,
      summary: result.summary,
      confirmation_required: true,
      instructions: result.confirmationInstructions,
      expires_at: result.expiresAt,
    };
  },
});

/**
 * Update an existing schedule (creates pending action)
 */
export const configUpdateSchedule: MCPTool = createTool({
  name: 'config_update_schedule',
  description:
    'Update an existing scheduled message. Creates a pending action that requires user confirmation.',
  category: 'system',
  inputSchema: z.object({
    schedule_id: z.number().describe('Schedule ID to update'),
    name: z.string().optional().describe('Update the schedule name'),
    cron_expression: z.string().optional().describe('Update the cron expression'),
    message: z.string().optional().describe('Update the message text'),
    enabled: z.boolean().optional().describe('Enable or disable the schedule'),
  }),
  keywords: ['schedule', 'update', 'modify', 'change', 'recurring'],
  useCases: [
    'Change schedule timing',
    'Update scheduled message text',
    'Enable or disable a schedule',
    'Modify recurring notification',
  ],
  examples: [
    {
      description: 'Disable a schedule',
      input: {
        schedule_id: 5,
        enabled: false,
      },
    },
  ],
  execute: async (
    input: {
      schedule_id: number;
      name?: string;
      cron_expression?: string;
      message?: string;
      enabled?: boolean;
    },
    _context: ToolContext
  ) => {
    const store = getPendingActionsStore();

    // Get current schedule
    const current = await getScheduleById(input.schedule_id);
    if (!current.exists) {
      return {
        success: false,
        message: `Schedule ID ${input.schedule_id} not found.`,
      };
    }

    // Build changes object
    const changes: Record<string, unknown> = {};
    const changedFields: string[] = [];

    if (input.name !== undefined) {
      changes.name = input.name;
      changedFields.push(`name: "${current.name}" → "${input.name}"`);
    }
    if (input.cron_expression !== undefined) {
      changes.cronExpression = input.cron_expression;
      changedFields.push(`schedule: ${current.cron_expression} → ${input.cron_expression}`);
    }
    if (input.message !== undefined) {
      changes.messageTemplate = input.message;
      changedFields.push(`message: updated`);
    }
    if (input.enabled !== undefined) {
      changes.enabled = input.enabled;
      changedFields.push(`enabled: ${current.enabled} → ${input.enabled}`);
    }

    if (changedFields.length === 0) {
      return {
        success: false,
        message: 'No changes specified. Provide at least one field to update.',
      };
    }

    const summary = `Update schedule "${current.name}" (ID: ${input.schedule_id}): ${changedFields.join(', ')}`;

    const result = store.createPendingAction(
      'schedule',
      'update',
      String(input.schedule_id),
      changes,
      {
        targetDisplay: current.name,
        previousValues: {
          enabled: current.enabled,
          cron_expression: current.cron_expression,
        },
        summary,
      }
    );

    return {
      status: 'pending',
      action_id: result.actionId,
      summary: result.summary,
      confirmation_required: true,
      instructions: result.confirmationInstructions,
      expires_at: result.expiresAt,
    };
  },
});

/**
 * Delete a schedule (creates pending action)
 */
export const configDeleteSchedule: MCPTool = createTool({
  name: 'config_delete_schedule',
  description:
    'Delete a scheduled message or job. Creates a pending action that requires user confirmation.',
  category: 'system',
  inputSchema: z.object({
    schedule_id: z.number().describe('Schedule ID to delete'),
  }),
  keywords: ['schedule', 'delete', 'remove', 'cancel', 'recurring'],
  useCases: ['Remove an old schedule', 'Cancel a recurring message', 'Delete unused schedules'],
  examples: [
    {
      description: 'Delete a schedule',
      input: { schedule_id: 5 },
    },
  ],
  execute: async (input: { schedule_id: number }, _context: ToolContext) => {
    const store = getPendingActionsStore();

    // Get current schedule
    const current = await getScheduleById(input.schedule_id);
    if (!current.exists) {
      return {
        success: false,
        message: `Schedule ID ${input.schedule_id} not found.`,
      };
    }

    const summary = `Delete schedule "${current.name}" (${current.cron_expression}, ${current.target_type})`;

    const result = store.createPendingAction(
      'schedule',
      'delete',
      String(input.schedule_id),
      {},
      {
        targetDisplay: current.name,
        previousValues: {
          name: current.name,
          cron_expression: current.cron_expression,
          target_type: current.target_type,
        },
        summary,
      }
    );

    return {
      status: 'pending',
      action_id: result.actionId,
      summary: result.summary,
      confirmation_required: true,
      instructions: result.confirmationInstructions,
      expires_at: result.expiresAt,
    };
  },
});

/**
 * List all schedules
 */
export const configListSchedules: MCPTool = createTool({
  name: 'config_list_schedules',
  description:
    'List all scheduled messages and jobs. Shows schedule names, timing, targets, and enabled status.',
  category: 'system',
  inputSchema: z
    .object({
      active_only: z
        .boolean()
        .optional()
        .describe('If true, only show active schedules (default: false)'),
    })
    .describe('Optional filters for schedule list'),
  keywords: ['schedule', 'list', 'all', 'recurring', 'messages'],
  useCases: [
    'See all scheduled messages',
    'Check active schedules',
    'Review recurring notifications',
  ],
  examples: [
    {
      description: 'List all active schedules',
      input: { active_only: true },
    },
  ],
  execute: async (input: { active_only?: boolean }, _context: ToolContext) => {
    return await listAllSchedules(input.active_only);
  },
});

/**
 * Helper: Get schedule by ID
 */
async function getScheduleById(scheduleId: number) {
  const { createSchedulerDatabase } = await import('@orient/database-services');
  const schedulerDb = createSchedulerDatabase();

  const schedule = await schedulerDb.getJob(scheduleId);

  if (!schedule) {
    return {
      exists: false,
      schedule_id: scheduleId,
    };
  }

  return {
    exists: true,
    id: schedule.id,
    name: schedule.name,
    cron_expression: schedule.cronExpression,
    target_type: schedule.provider,
    target_id: schedule.target,
    message: schedule.messageTemplate,
    enabled: schedule.enabled,
    last_run: schedule.lastRunAt,
    next_run: schedule.nextRunAt,
  };
}

/**
 * Helper: List all schedules
 */
async function listAllSchedules(activeOnly?: boolean) {
  const { createSchedulerDatabase } = await import('@orient/database-services');
  const schedulerDb = createSchedulerDatabase();

  let schedules = (await schedulerDb.getAllJobs()) as ScheduleRecord[];

  if (activeOnly) {
    schedules = schedules.filter((s) => s.enabled);
  }

  return {
    count: schedules.length,
    schedules: schedules.map((s) => ({
      id: s.id,
      name: s.name,
      cron_expression: s.cronExpression,
      target_type: s.provider,
      target_id: s.target,
      message_preview:
        s.messageTemplate.substring(0, 50) + (s.messageTemplate.length > 50 ? '...' : ''),
      enabled: s.enabled,
      next_run: s.nextRunAt,
    })),
  };
}

/**
 * All schedule tools
 */
export const scheduleTools: MCPTool[] = [
  configCreateSchedule,
  configUpdateSchedule,
  configDeleteSchedule,
  configListSchedules,
];
