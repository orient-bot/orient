/**
 * Schedule Executor
 *
 * Executes confirmed schedule configuration actions.
 */

import { createServiceLogger } from '@orient/core';
import { getPendingActionsStore } from '../pending-store.js';
import type { PendingAction, ActionExecutionResult } from '../pending-store.js';

const logger = createServiceLogger('schedule-executor');

/**
 * Execute a schedule configuration action
 */
async function executeScheduleAction(action: PendingAction): Promise<ActionExecutionResult> {
  logger.info('Executing schedule action', {
    actionId: action.id,
    operation: action.operation,
    target: action.target,
  });

  try {
    const { createSchedulerDatabase } = await import('@orient/database-services');
    const schedulerDb = createSchedulerDatabase();

    if (action.operation === 'delete') {
      const scheduleId = parseInt(action.target, 10);
      await schedulerDb.deleteJob(scheduleId);

      return {
        success: true,
        message: `Successfully deleted schedule "${action.targetDisplay}" (ID: ${scheduleId}).`,
        data: {
          schedule_id: scheduleId,
          operation: 'deleted',
        },
      };
    } else if (action.operation === 'create') {
      const {
        name,
        scheduleType,
        cronExpression,
        provider,
        target,
        messageTemplate,
        enabled,
        timezone,
      } = action.changes as {
        name: string;
        scheduleType: 'cron';
        cronExpression: string;
        provider: 'whatsapp' | 'slack';
        target: string;
        messageTemplate: string;
        enabled: boolean;
        timezone?: string;
      };

      const schedule = await schedulerDb.createJob({
        name,
        scheduleType,
        cronExpression,
        provider,
        target,
        messageTemplate,
        enabled,
        timezone: timezone || 'UTC',
      });

      return {
        success: true,
        message: `Successfully created schedule "${name}" (ID: ${schedule.id}).`,
        data: {
          schedule_id: schedule.id,
          name: schedule.name,
          next_run: schedule.nextRunAt,
        },
      };
    } else {
      // update
      const scheduleId = parseInt(action.target, 10);

      // Build update object
      const updateData: Record<string, unknown> = {};

      if ('name' in action.changes) {
        updateData.name = action.changes.name;
      }
      if ('cronExpression' in action.changes) {
        updateData.cronExpression = action.changes.cronExpression;
      }
      if ('messageTemplate' in action.changes) {
        updateData.messageTemplate = action.changes.messageTemplate;
      }
      if ('enabled' in action.changes) {
        updateData.enabled = action.changes.enabled;
      }

      await schedulerDb.updateJob(scheduleId, updateData);

      const changedFields = Object.keys(action.changes).join(', ');

      return {
        success: true,
        message: `Successfully updated schedule "${action.targetDisplay}" (ID: ${scheduleId}). Changed: ${changedFields}`,
        data: {
          schedule_id: scheduleId,
          updated_fields: Object.keys(action.changes),
        },
      };
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error('Schedule action execution failed', {
      actionId: action.id,
      error: errorMessage,
    });

    return {
      success: false,
      message: `Failed to ${action.operation} schedule: ${errorMessage}`,
    };
  }
}

/**
 * Register the schedule executor with the pending actions store
 */
export function registerScheduleExecutor(): void {
  const store = getPendingActionsStore();
  store.registerExecutor('schedule', executeScheduleAction);
  logger.debug('Schedule executor registered');
}
