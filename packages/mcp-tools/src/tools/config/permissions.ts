/**
 * Permission Configuration Tools
 *
 * Tools for managing WhatsApp chat permissions:
 * - config_set_permission: Set chat permission (with confirmation)
 * - config_get_permission: Get current permission for a chat
 * - config_list_permissions: List all configured permissions
 */

import { z } from 'zod';
import { createTool, MCPTool } from '../base.js';
import type { ToolContext } from '../../types.js';
import { getPendingActionsStore } from './pending-store.js';
import type { ChatPermission, ChatPermissionRecord, ChatType } from '@orient/database-services';

// Register the executor when the module loads
import { registerPermissionExecutor } from './executors/permission-executor.js';
registerPermissionExecutor();

const chatPermissionSchema = z.enum(['read_write', 'read_only', 'ignored']);
const chatTypeSchema = z.enum(['group', 'individual']);

/**
 * Set permission for a chat (creates pending action)
 */
export const configSetPermission: MCPTool = createTool({
  name: 'config_set_permission',
  description:
    'Set permission for a WhatsApp chat or group. Creates a pending action that requires user confirmation. Permissions: read_write (bot can respond), read_only (messages stored only), ignored (messages not stored).',
  category: 'system',
  inputSchema: z.object({
    chat_id: z
      .string()
      .describe(
        'WhatsApp chat ID (e.g., 1234567890@s.whatsapp.net for private chat, 120363123456789@g.us for group)'
      ),
    permission: chatPermissionSchema.describe(
      'Permission level: read_write, read_only, or ignored'
    ),
    chat_type: chatTypeSchema
      .optional()
      .describe('Chat type: group or individual (auto-detected if not provided)'),
    display_name: z.string().optional().describe('Human-readable name for the chat'),
    notes: z.string().optional().describe('Optional notes about this permission setting'),
  }),
  keywords: ['permission', 'access', 'whatsapp', 'chat', 'group', 'configure', 'allow'],
  useCases: [
    'Allow the bot to respond in a WhatsApp group',
    'Set a chat to read-only mode',
    'Ignore messages from a specific chat',
    'Configure permissions for discovered chats',
  ],
  examples: [
    {
      description: 'Allow bot to respond in a group',
      input: {
        chat_id: '120363123456789@g.us',
        permission: 'read_write',
        chat_type: 'group',
        display_name: 'Team Discussion',
      },
    },
    {
      description: 'Set a chat to read-only',
      input: {
        chat_id: '1234567890@s.whatsapp.net',
        permission: 'read_only',
      },
    },
  ],
  execute: async (
    input: {
      chat_id: string;
      permission: ChatPermission;
      chat_type?: ChatType;
      display_name?: string;
      notes?: string;
    },
    _context: ToolContext
  ) => {
    const store = getPendingActionsStore();

    // Detect chat type if not provided
    const chatType = input.chat_type || (input.chat_id.includes('@g.us') ? 'group' : 'individual');

    // Get current permission to show in summary
    let currentPermission = 'default (read_only)';
    try {
      const result = await getPermissionForChat(input.chat_id);
      if (result.permission) {
        currentPermission = result.permission;
      }
    } catch {
      // Ignore errors, use default
    }

    const summary = `Change permission for ${input.display_name || input.chat_id.substring(0, 20)} from "${currentPermission}" to "${input.permission}"`;

    const result = store.createPendingAction(
      'permission',
      'update',
      input.chat_id,
      {
        permission: input.permission,
        chatType,
        displayName: input.display_name,
        notes: input.notes,
      },
      {
        targetDisplay: input.display_name || `${chatType} chat`,
        previousValues: { permission: currentPermission },
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
 * Get current permission for a chat
 */
export const configGetPermission: MCPTool = createTool({
  name: 'config_get_permission',
  description:
    'Get the current permission setting for a WhatsApp chat. Shows whether the bot can respond, and any configured notes.',
  category: 'system',
  inputSchema: z.object({
    chat_id: z
      .string()
      .describe('WhatsApp chat ID (e.g., 1234567890@s.whatsapp.net or 120363123456789@g.us)'),
  }),
  keywords: ['permission', 'check', 'get', 'status', 'whatsapp', 'chat'],
  useCases: [
    'Check if bot can respond in a chat',
    'Verify current permission settings',
    'Get permission status before making changes',
  ],
  examples: [
    {
      description: 'Check permission for a group',
      input: { chat_id: '120363123456789@g.us' },
    },
  ],
  execute: async (input: { chat_id: string }, _context: ToolContext) => {
    return await getPermissionForChat(input.chat_id);
  },
});

/**
 * List all configured permissions
 */
export const configListPermissions: MCPTool = createTool({
  name: 'config_list_permissions',
  description:
    'List all explicitly configured chat permissions. Shows which chats have custom permission settings.',
  category: 'system',
  inputSchema: z
    .object({
      permission_filter: chatPermissionSchema
        .optional()
        .describe('Optional filter: only show chats with this permission level'),
      limit: z.number().optional().describe('Maximum number of results (default: 50)'),
    })
    .describe('Optional filters for permission list'),
  keywords: ['permission', 'list', 'all', 'configured', 'whatsapp', 'chats'],
  useCases: [
    'See all chats where bot can respond',
    'List all read-only chats',
    'Review permission configuration',
  ],
  examples: [
    {
      description: 'List all chats with read_write permission',
      input: { permission_filter: 'read_write' },
    },
    {
      description: 'List first 20 configured permissions',
      input: { limit: 20 },
    },
  ],
  execute: async (
    input: { permission_filter?: ChatPermission; limit?: number },
    _context: ToolContext
  ) => {
    return await listAllPermissions(input.permission_filter, input.limit);
  },
});

/**
 * Helper: Get permission for a specific chat
 */
async function getPermissionForChat(chatId: string) {
  const { createMessageDatabase } = await import('@orient/database-services');
  const db = createMessageDatabase();

  const record = await db.getChatPermission(chatId);

  if (!record) {
    return {
      chat_id: chatId,
      permission: null,
      source: 'default',
      message: 'No explicit permission configured. Using default behavior.',
    };
  }

  return {
    chat_id: chatId,
    permission: record.permission,
    chat_type: record.chatType,
    display_name: record.displayName,
    notes: record.notes,
    updated_at: record.updatedAt,
    source: 'database',
  };
}

/**
 * Helper: List all configured permissions
 */
async function listAllPermissions(filter?: ChatPermission, limit?: number) {
  const { createMessageDatabase } = await import('@orient/database-services');
  const db = createMessageDatabase();

  let permissions: ChatPermissionRecord[] = await db.getAllChatPermissions();

  // Apply filter
  if (filter) {
    permissions = permissions.filter((p) => p.permission === filter);
  }

  // Apply limit
  const maxLimit = limit || 50;
  if (permissions.length > maxLimit) {
    permissions = permissions.slice(0, maxLimit);
  }

  return {
    count: permissions.length,
    permissions: permissions.map((p) => ({
      chat_id: p.chatId,
      permission: p.permission,
      chat_type: p.chatType,
      display_name: p.displayName || undefined,
      notes: p.notes || undefined,
      updated_at: p.updatedAt,
    })),
  };
}

/**
 * All permission tools
 */
export const permissionTools: MCPTool[] = [
  configSetPermission,
  configGetPermission,
  configListPermissions,
];
