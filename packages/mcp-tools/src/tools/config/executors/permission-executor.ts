/**
 * Permission Executor
 *
 * Executes confirmed permission configuration actions.
 */

import { createServiceLogger } from '@orientbot/core';
import { getPendingActionsStore } from '../pending-store.js';
import type { PendingAction, ActionExecutionResult } from '../pending-store.js';
import type { ChatPermission, ChatType } from '@orientbot/database-services';

const logger = createServiceLogger('permission-executor');

/**
 * Execute a permission configuration action
 */
async function executePermissionAction(action: PendingAction): Promise<ActionExecutionResult> {
  logger.info('Executing permission action', {
    actionId: action.id,
    operation: action.operation,
    target: action.target,
  });

  try {
    const { createMessageDatabase } = await import('@orientbot/database-services');
    const db = createMessageDatabase();

    const { permission, chatType, displayName, notes } = action.changes as {
      permission: ChatPermission;
      chatType: ChatType;
      displayName?: string;
      notes?: string;
    };

    // Set the permission
    await db.setChatPermission(
      action.target,
      chatType,
      permission,
      displayName,
      notes,
      'onboarder-agent'
    );

    const displayTarget = action.targetDisplay || action.target.substring(0, 30);

    return {
      success: true,
      message: `Successfully set permission for ${displayTarget} to "${permission}".`,
      data: {
        chat_id: action.target,
        permission,
        chat_type: chatType,
        display_name: displayName,
      },
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error('Permission action execution failed', {
      actionId: action.id,
      error: errorMessage,
    });

    return {
      success: false,
      message: `Failed to set permission: ${errorMessage}`,
    };
  }
}

/**
 * Register the permission executor with the pending actions store
 */
export function registerPermissionExecutor(): void {
  const store = getPendingActionsStore();
  store.registerExecutor('permission', executePermissionAction);
  logger.debug('Permission executor registered');
}
