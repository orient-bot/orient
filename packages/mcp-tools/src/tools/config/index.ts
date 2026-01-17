/**
 * Configuration Tools
 *
 * Tools for managing Orient configuration with confirmation workflow.
 * Exports all config tools and executors.
 */

export { getPendingActionsStore, resetPendingActionsStore } from './pending-store.js';
export type {
  PendingAction,
  PendingActionResult,
  ActionExecutionResult,
  ConfigActionType,
  ConfigOperation,
} from './pending-store.js';

export { confirmationTools } from './confirm-action.js';
export { permissionTools } from './permissions.js';
export { promptTools } from './prompts.js';
export { secretTools } from './secrets.js';
export { agentTools } from './agents.js';
export { scheduleTools } from './schedules.js';

// Import all tools for easy export
import { confirmationTools } from './confirm-action.js';
import { permissionTools } from './permissions.js';
import { promptTools } from './prompts.js';
import { secretTools } from './secrets.js';
import { agentTools } from './agents.js';
import { scheduleTools } from './schedules.js';

/**
 * All configuration tools combined
 */
export const allConfigTools = [
  ...confirmationTools,
  ...permissionTools,
  ...promptTools,
  ...secretTools,
  ...agentTools,
  ...scheduleTools,
];
