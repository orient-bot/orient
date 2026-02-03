/**
 * Prompt Executor
 *
 * Executes confirmed prompt configuration actions.
 *
 * IMPORTANT: This executor uses @orient-bot/database-services directly instead of
 * @orient-bot/agents to avoid ESM/CJS circular import issues. The PromptService
 * in @orient-bot/agents is a higher-level wrapper, but for the executor we can
 * work directly with the database layer.
 */

import { createServiceLogger } from '@orient-bot/core';
import { getPendingActionsStore } from '../pending-store.js';
import type { PendingAction, ActionExecutionResult } from '../pending-store.js';

const logger = createServiceLogger('prompt-executor');

/**
 * Execute a prompt configuration action
 *
 * Uses MessageDatabase directly from @orient-bot/database-services to avoid
 * circular import issues with @orient-bot/agents when called from CJS contexts.
 */
async function executePromptAction(action: PendingAction): Promise<ActionExecutionResult> {
  logger.info('Executing prompt action', {
    actionId: action.id,
    operation: action.operation,
    target: action.target,
  });

  try {
    // Import database-services directly - this package has no cycle issues
    const { createMessageDatabase } = await import('@orient-bot/database-services');
    const messageDb = createMessageDatabase();

    const { targetType, promptText, displayName, platform } = action.changes as {
      targetType: 'chat' | 'platform';
      promptText: string;
      displayName?: string;
      platform?: 'whatsapp' | 'slack';
    };

    if (targetType === 'platform') {
      // Platform default uses chatId = '*'
      const targetPlatform = action.target as 'whatsapp' | 'slack';
      await messageDb.setSystemPrompt(targetPlatform, '*', promptText);

      logger.info('Updated platform default prompt', {
        platform: targetPlatform,
        promptLength: promptText.length,
      });

      return {
        success: true,
        message: `Successfully updated ${targetPlatform} platform default prompt.`,
        data: {
          platform: targetPlatform,
          prompt_length: promptText.length,
        },
      };
    } else {
      // Chat-specific prompt
      const resolvedPlatform = platform || (action.target.includes('@') ? 'whatsapp' : 'slack');
      await messageDb.setSystemPrompt(resolvedPlatform, action.target, promptText);

      const displayTarget = displayName || action.target.substring(0, 30);

      logger.info('Set custom chat prompt', {
        platform: resolvedPlatform,
        chatId: action.target,
        promptLength: promptText.length,
      });

      return {
        success: true,
        message: `Successfully set custom prompt for ${displayTarget}.`,
        data: {
          chat_id: action.target,
          platform: resolvedPlatform,
          prompt_length: promptText.length,
        },
      };
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error('Prompt action execution failed', {
      actionId: action.id,
      error: errorMessage,
    });

    return {
      success: false,
      message: `Failed to set prompt: ${errorMessage}`,
    };
  }
}

/**
 * Register the prompt executor with the pending actions store
 */
export function registerPromptExecutor(): void {
  const store = getPendingActionsStore();
  store.registerExecutor('prompt', executePromptAction);
  logger.debug('Prompt executor registered');
}
