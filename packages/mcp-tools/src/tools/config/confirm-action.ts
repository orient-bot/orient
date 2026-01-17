/**
 * Configuration Confirmation Tools
 *
 * Tools for managing pending configuration actions:
 * - config_confirm_action: Execute a pending action
 * - config_list_pending: List all pending actions
 * - config_cancel_action: Cancel a pending action
 */

import { z } from 'zod';
import { createTool, MCPTool } from '../base.js';
import type { ToolContext } from '../../types.js';
import { getPendingActionsStore } from './pending-store.js';

/**
 * Confirm and execute a pending configuration action
 */
export const configConfirmAction: MCPTool = createTool({
  name: 'config_confirm_action',
  description:
    'Confirm and execute a pending configuration action. Use this after the user has reviewed and approved the proposed change.',
  category: 'system',
  inputSchema: z.object({
    action_id: z.string().describe('The ID of the pending action to confirm (starts with cfg_)'),
  }),
  keywords: ['confirm', 'approve', 'execute', 'apply', 'configuration', 'pending'],
  useCases: [
    'Execute a configuration change after user approval',
    'Apply a pending permission change',
    'Complete a configuration workflow',
  ],
  examples: [
    {
      description: 'Confirm a permission change',
      input: { action_id: 'cfg_abc123_xyz789' },
    },
  ],
  execute: async (input: { action_id: string }, _context: ToolContext) => {
    const store = getPendingActionsStore();
    const result = await store.confirmAction(input.action_id);

    return {
      success: result.success,
      message: result.message,
      data: result.data,
    };
  },
});

/**
 * List all pending configuration actions
 */
export const configListPending: MCPTool = createTool({
  name: 'config_list_pending',
  description:
    'List all pending configuration actions awaiting confirmation. Shows what changes are queued and when they expire.',
  category: 'system',
  inputSchema: z.object({}).describe('No input required'),
  keywords: ['list', 'pending', 'queue', 'configuration', 'waiting'],
  useCases: [
    'See what configuration changes are waiting for approval',
    'Check if there are any pending actions before making new changes',
    'Review all queued changes',
  ],
  execute: async (_input: unknown, _context: ToolContext) => {
    const store = getPendingActionsStore();
    const actions = store.listPendingActions();

    if (actions.length === 0) {
      return {
        pending_count: 0,
        message: 'No pending configuration actions.',
        actions: [],
      };
    }

    const now = Date.now();
    const formattedActions = actions.map((action) => ({
      action_id: action.id,
      type: action.type,
      operation: action.operation,
      target: action.targetDisplay || action.target,
      summary: action.summary,
      expires_in_seconds: Math.round((action.expiresAt - now) / 1000),
      changes: action.changes,
    }));

    return {
      pending_count: actions.length,
      message: `${actions.length} pending action(s) awaiting confirmation.`,
      actions: formattedActions,
    };
  },
});

/**
 * Cancel a pending configuration action
 */
export const configCancelAction: MCPTool = createTool({
  name: 'config_cancel_action',
  description:
    'Cancel a pending configuration action. Use this if the user decides not to proceed with a proposed change.',
  category: 'system',
  inputSchema: z.object({
    action_id: z.string().describe('The ID of the pending action to cancel (starts with cfg_)'),
  }),
  keywords: ['cancel', 'abort', 'discard', 'reject', 'configuration', 'pending'],
  useCases: [
    'Cancel a configuration change the user no longer wants',
    'Abort a pending permission change',
    'Discard a proposed setting change',
  ],
  examples: [
    {
      description: 'Cancel a pending action',
      input: { action_id: 'cfg_abc123_xyz789' },
    },
  ],
  execute: async (input: { action_id: string }, _context: ToolContext) => {
    const store = getPendingActionsStore();
    const result = store.cancelAction(input.action_id);

    return {
      success: result.success,
      message: result.message,
    };
  },
});

/**
 * All confirmation tools
 */
export const confirmationTools: MCPTool[] = [
  configConfirmAction,
  configListPending,
  configCancelAction,
];
