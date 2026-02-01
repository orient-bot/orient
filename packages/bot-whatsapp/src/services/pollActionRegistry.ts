/**
 * Poll Action Registry
 *
 * Manages structured action handlers for poll responses.
 * When a poll is created with an actionId, the corresponding handler
 * will be called when a vote is received.
 *
 * This allows defining specific operations that should happen
 *
 * Exported via @orient-bot/agents package.
 * when users select certain poll options (e.g., 'prepare-examples',
 * 'select-priority', 'choose-format').
 */

import type { PollActionHandler, PollActionContext, WhatsAppPoll, PollVote } from '../types.js';
import { createDedicatedServiceLogger } from '@orient-bot/core';

const logger = createDedicatedServiceLogger('whatsapp', {
  maxSize: '20m',
  maxDays: '14d',
  compress: true,
});

/**
 * Poll Action Registry
 *
 * Register action handlers that will be invoked when polls with
 * matching actionId receive votes.
 */
export class PollActionRegistry {
  private handlers: Map<string, PollActionHandler> = new Map();

  /**
   * Register an action handler for a specific actionId
   *
   * @param actionId - Unique identifier for this action (e.g., 'prepare-examples')
   * @param handler - Async function that processes the vote and returns a response
   */
  register(actionId: string, handler: PollActionHandler): void {
    if (this.handlers.has(actionId)) {
      logger.warn('Overwriting existing action handler', { actionId });
    }
    this.handlers.set(actionId, handler);
    logger.info('Registered poll action handler', { actionId });
  }

  /**
   * Unregister an action handler
   */
  unregister(actionId: string): boolean {
    const existed = this.handlers.delete(actionId);
    if (existed) {
      logger.info('Unregistered poll action handler', { actionId });
    }
    return existed;
  }

  /**
   * Check if an action handler is registered
   */
  hasHandler(actionId: string): boolean {
    return this.handlers.has(actionId);
  }

  /**
   * Get all registered action IDs
   */
  getRegisteredActions(): string[] {
    return Array.from(this.handlers.keys());
  }

  /**
   * Execute the action handler for a poll vote
   *
   * @param poll - The poll that received a vote
   * @param vote - The vote details
   * @returns Response text if action handled, null if no handler or action declined
   */
  async executeAction(poll: WhatsAppPoll, vote: PollVote): Promise<string | null> {
    const actionId = poll.context?.actionId;

    if (!actionId) {
      logger.debug('Poll has no actionId, skipping action execution', { pollId: poll.id });
      return null;
    }

    const handler = this.handlers.get(actionId);

    if (!handler) {
      logger.warn('No handler registered for action', { actionId, pollId: poll.id });
      return null;
    }

    const context: PollActionContext = {
      vote,
      poll,
      sessionId: poll.context?.sessionId,
      actionPayload: poll.context?.actionPayload,
    };

    logger.info('Executing poll action', {
      actionId,
      pollId: poll.id,
      selectedOptions: vote.selectedOptions,
      hasSessionId: !!context.sessionId,
      hasPayload: !!context.actionPayload,
    });

    try {
      const result = await handler(context);

      if (result) {
        logger.info('Poll action completed', {
          actionId,
          pollId: poll.id,
          responseLength: result.length,
        });
      } else {
        logger.info('Poll action declined to handle (returned null)', {
          actionId,
          pollId: poll.id,
        });
      }

      return result;
    } catch (error) {
      logger.error('Poll action handler failed', {
        actionId,
        pollId: poll.id,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * Clear all registered handlers
   */
  clear(): void {
    this.handlers.clear();
    logger.info('Cleared all poll action handlers');
  }
}

// Singleton instance for global access
let registryInstance: PollActionRegistry | null = null;

/**
 * Get the global poll action registry instance
 */
export function getPollActionRegistry(): PollActionRegistry {
  if (!registryInstance) {
    registryInstance = new PollActionRegistry();
  }
  return registryInstance;
}

/**
 * Create a new poll action registry instance
 * Useful for testing or isolated use cases
 */
export function createPollActionRegistry(): PollActionRegistry {
  return new PollActionRegistry();
}
