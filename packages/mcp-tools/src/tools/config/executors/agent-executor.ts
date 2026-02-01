/**
 * Agent Executor
 *
 * Executes confirmed agent configuration actions.
 */

import { createServiceLogger } from '@orient-bot/core';
import { getPendingActionsStore } from '../pending-store.js';
import type { PendingAction, ActionExecutionResult } from '../pending-store.js';

const logger = createServiceLogger('agent-executor');

/**
 * Execute an agent configuration action
 */
async function executeAgentAction(action: PendingAction): Promise<ActionExecutionResult> {
  logger.info('Executing agent action', {
    actionId: action.id,
    operation: action.operation,
    target: action.target,
  });

  try {
    const { getDatabase, agents, eq } = await import('@orient-bot/database');
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const db = (await getDatabase()) as any;

    const agentId = action.target;
    const changes = action.changes;

    // Build update object
    const updateData: Record<string, unknown> = {
      updatedAt: new Date(),
    };

    if ('enabled' in changes) {
      updateData.enabled = changes.enabled;
    }
    if ('basePrompt' in changes) {
      updateData.basePrompt = changes.basePrompt;
    }
    if ('modelDefault' in changes) {
      updateData.modelDefault = changes.modelDefault;
    }
    if ('modelFallback' in changes) {
      updateData.modelFallback = changes.modelFallback;
    }

    // Update agent
    await db.update(agents).set(updateData).where(eq(agents.id, agentId));

    const changedFields = Object.keys(changes).join(', ');

    return {
      success: true,
      message: `Successfully updated agent "${agentId}". Changed: ${changedFields}`,
      data: {
        agent_id: agentId,
        updated_fields: Object.keys(changes),
      },
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error('Agent action execution failed', {
      actionId: action.id,
      error: errorMessage,
    });

    return {
      success: false,
      message: `Failed to update agent: ${errorMessage}`,
    };
  }
}

/**
 * Register the agent executor with the pending actions store
 */
export function registerAgentExecutor(): void {
  const store = getPendingActionsStore();
  store.registerExecutor('agent', executeAgentAction);
  logger.debug('Agent executor registered');
}
