/**
 * Secret Executor
 *
 * Executes confirmed secret configuration actions.
 */

import { createServiceLogger } from '@orientbot/core';
import { getPendingActionsStore } from '../pending-store.js';
import type { PendingAction, ActionExecutionResult } from '../pending-store.js';

const logger = createServiceLogger('secret-executor');

/**
 * Execute a secret configuration action
 */
async function executeSecretAction(action: PendingAction): Promise<ActionExecutionResult> {
  logger.info('Executing secret action', {
    actionId: action.id,
    operation: action.operation,
    target: action.target,
  });

  try {
    const { createSecretsService } = await import('@orientbot/database-services');
    const secretsService = createSecretsService();

    const secretKey = action.target;

    if (action.operation === 'delete') {
      await secretsService.deleteSecret(secretKey);

      return {
        success: true,
        message: `Successfully deleted secret "${secretKey}".`,
        data: {
          key: secretKey,
          operation: 'deleted',
        },
      };
    } else {
      // create or update
      const { value, category, description } = action.changes as {
        value: string;
        category?: string;
        description?: string;
      };

      await secretsService.setSecret(secretKey, value, {
        category,
        description,
        changedBy: 'onboarder-agent',
      });

      return {
        success: true,
        message: `Successfully ${action.operation === 'create' ? 'created' : 'updated'} secret "${secretKey}".`,
        data: {
          key: secretKey,
          category: category || undefined,
          operation: action.operation,
        },
      };
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error('Secret action execution failed', {
      actionId: action.id,
      error: errorMessage,
    });

    return {
      success: false,
      message: `Failed to ${action.operation} secret: ${errorMessage}`,
    };
  }
}

/**
 * Register the secret executor with the pending actions store
 */
export function registerSecretExecutor(): void {
  const store = getPendingActionsStore();
  store.registerExecutor('secret', executeSecretAction);
  logger.debug('Secret executor registered');
}
