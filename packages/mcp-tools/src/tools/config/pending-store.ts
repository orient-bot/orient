/**
 * Pending Actions Store
 *
 * In-memory store for configuration actions awaiting user confirmation.
 * Actions expire after a configurable TTL (default: 5 minutes).
 */

import { createServiceLogger } from '@orient-bot/core';

const logger = createServiceLogger('pending-store');

/**
 * Types of configuration actions
 */
export type ConfigActionType = 'permission' | 'prompt' | 'secret' | 'agent' | 'schedule';

/**
 * Configuration operation types
 */
export type ConfigOperation = 'create' | 'update' | 'delete';

/**
 * A pending configuration action awaiting confirmation
 */
export interface PendingAction {
  /** Unique action ID */
  id: string;
  /** Type of configuration being changed */
  type: ConfigActionType;
  /** Operation being performed */
  operation: ConfigOperation;
  /** Target identifier (chat ID, secret key, agent ID, etc.) */
  target: string;
  /** Human-readable description of the target */
  targetDisplay?: string;
  /** The changes to be applied */
  changes: Record<string, unknown>;
  /** Previous values (for update/delete operations) */
  previousValues?: Record<string, unknown>;
  /** Human-readable summary of what will change */
  summary: string;
  /** Timestamp when action was created */
  createdAt: number;
  /** Timestamp when action expires */
  expiresAt: number;
}

/**
 * Result of creating a pending action
 */
export interface PendingActionResult {
  /** The pending action ID */
  actionId: string;
  /** Human-readable summary */
  summary: string;
  /** When the action expires */
  expiresAt: number;
  /** Instructions for confirming */
  confirmationInstructions: string;
}

/**
 * Result of executing a confirmed action
 */
export interface ActionExecutionResult {
  success: boolean;
  message: string;
  data?: unknown;
}

/**
 * Function type for action executors
 */
export type ActionExecutor = (action: PendingAction) => Promise<ActionExecutionResult>;

/**
 * Pending Actions Store Configuration
 */
export interface PendingStoreConfig {
  /** Time-to-live for pending actions in milliseconds (default: 5 minutes) */
  ttlMs?: number;
  /** Cleanup interval in milliseconds (default: 1 minute) */
  cleanupIntervalMs?: number;
}

const DEFAULT_TTL_MS = 5 * 60 * 1000; // 5 minutes
const DEFAULT_CLEANUP_INTERVAL_MS = 60 * 1000; // 1 minute

/**
 * Generate a unique action ID
 */
function generateActionId(): string {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).substring(2, 8);
  return `cfg_${timestamp}_${random}`;
}

/**
 * Pending Actions Store
 *
 * Manages configuration actions that require user confirmation before execution.
 */
class PendingActionsStore {
  private actions: Map<string, PendingAction> = new Map();
  private executors: Map<ConfigActionType, ActionExecutor> = new Map();
  private ttlMs: number;
  private cleanupInterval: NodeJS.Timeout | null = null;

  constructor(config: PendingStoreConfig = {}) {
    this.ttlMs = config.ttlMs ?? DEFAULT_TTL_MS;

    // Start cleanup interval
    const cleanupIntervalMs = config.cleanupIntervalMs ?? DEFAULT_CLEANUP_INTERVAL_MS;
    this.cleanupInterval = setInterval(() => this.cleanup(), cleanupIntervalMs);

    logger.info('Pending actions store initialized', { ttlMs: this.ttlMs });
  }

  /**
   * Register an executor for a configuration type
   */
  registerExecutor(type: ConfigActionType, executor: ActionExecutor): void {
    this.executors.set(type, executor);
    logger.debug('Executor registered', { type });
  }

  /**
   * Create a new pending action
   */
  createPendingAction(
    type: ConfigActionType,
    operation: ConfigOperation,
    target: string,
    changes: Record<string, unknown>,
    options: {
      targetDisplay?: string;
      previousValues?: Record<string, unknown>;
      summary?: string;
    } = {}
  ): PendingActionResult {
    const now = Date.now();
    const id = generateActionId();

    // Generate summary if not provided
    const summary =
      options.summary ??
      `${operation.charAt(0).toUpperCase() + operation.slice(1)} ${type} for ${options.targetDisplay || target}`;

    const action: PendingAction = {
      id,
      type,
      operation,
      target,
      targetDisplay: options.targetDisplay,
      changes,
      previousValues: options.previousValues,
      summary,
      createdAt: now,
      expiresAt: now + this.ttlMs,
    };

    this.actions.set(id, action);

    logger.info('Pending action created', {
      actionId: id,
      type,
      operation,
      target: target.substring(0, 30),
      expiresIn: this.ttlMs,
    });

    return {
      actionId: id,
      summary,
      expiresAt: action.expiresAt,
      confirmationInstructions: `To apply this change, confirm the action. The action will expire in ${Math.round(this.ttlMs / 60000)} minutes.`,
    };
  }

  /**
   * Get a pending action by ID
   */
  getAction(actionId: string): PendingAction | null {
    const action = this.actions.get(actionId);
    if (!action) {
      return null;
    }

    // Check if expired
    if (Date.now() > action.expiresAt) {
      this.actions.delete(actionId);
      return null;
    }

    return action;
  }

  /**
   * List all pending actions
   */
  listPendingActions(): PendingAction[] {
    const now = Date.now();
    const pending: PendingAction[] = [];

    for (const [id, action] of this.actions) {
      if (now > action.expiresAt) {
        this.actions.delete(id);
      } else {
        pending.push(action);
      }
    }

    return pending;
  }

  /**
   * Confirm and execute a pending action
   */
  async confirmAction(actionId: string): Promise<ActionExecutionResult> {
    const action = this.getAction(actionId);

    if (!action) {
      return {
        success: false,
        message: `Action ${actionId} not found or has expired. Please try the operation again.`,
      };
    }

    const executor = this.executors.get(action.type);
    if (!executor) {
      logger.error('No executor registered for action type', { type: action.type });
      return {
        success: false,
        message: `No executor registered for ${action.type} actions. This is a configuration error.`,
      };
    }

    try {
      const result = await executor(action);

      // Remove the action after execution
      this.actions.delete(actionId);

      logger.info('Action confirmed and executed', {
        actionId,
        type: action.type,
        operation: action.operation,
        success: result.success,
      });

      return result;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error('Action execution failed', { actionId, error: errorMessage });

      return {
        success: false,
        message: `Failed to execute action: ${errorMessage}`,
      };
    }
  }

  /**
   * Cancel a pending action
   */
  cancelAction(actionId: string): { success: boolean; message: string } {
    const action = this.actions.get(actionId);

    if (!action) {
      return {
        success: false,
        message: `Action ${actionId} not found or has already expired.`,
      };
    }

    this.actions.delete(actionId);

    logger.info('Action cancelled', { actionId, type: action.type });

    return {
      success: true,
      message: `Action cancelled: ${action.summary}`,
    };
  }

  /**
   * Clean up expired actions
   */
  private cleanup(): void {
    const now = Date.now();
    let cleaned = 0;

    for (const [id, action] of this.actions) {
      if (now > action.expiresAt) {
        this.actions.delete(id);
        cleaned++;
      }
    }

    if (cleaned > 0) {
      logger.debug('Cleaned up expired actions', { count: cleaned });
    }
  }

  /**
   * Stop the cleanup interval (for testing/shutdown)
   */
  shutdown(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
  }

  /**
   * Get the number of pending actions (for testing)
   */
  get pendingCount(): number {
    return this.actions.size;
  }
}

// Singleton instance
let storeInstance: PendingActionsStore | null = null;

/**
 * Get the pending actions store singleton
 */
export function getPendingActionsStore(): PendingActionsStore {
  if (!storeInstance) {
    storeInstance = new PendingActionsStore();
  }
  return storeInstance;
}

/**
 * Reset the store (for testing)
 */
export function resetPendingActionsStore(): void {
  if (storeInstance) {
    storeInstance.shutdown();
    storeInstance = null;
  }
}
