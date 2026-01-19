/**
 * Prompt Configuration Tools
 *
 * Tools for managing system prompts for chats:
 * - config_set_prompt: Set custom prompt for a chat or platform
 * - config_get_prompt: Get current prompt for a chat
 * - config_list_prompts: List all custom prompts
 *
 * IMPORTANT: This file uses @orient/database-services directly instead of
 * @orient/agents to avoid ESM/CJS circular import issues. The MessageDatabase
 * in database-services provides all the prompt methods we need.
 */

import { z } from 'zod';
import { createTool, MCPTool } from '../base.js';
import type { ToolContext } from '../../types.js';
import { getPendingActionsStore } from './pending-store.js';
import { EMBEDDED_DEFAULT_PROMPTS } from '@orient/database-services';

// Register the executor when the module loads
import { registerPromptExecutor } from './executors/prompt-executor.js';
registerPromptExecutor();

const platformSchema = z.enum(['whatsapp', 'slack']);

function resolvePromptPlatform(targetId: string): 'whatsapp' | 'slack' {
  return targetId.includes('@') ? 'whatsapp' : 'slack';
}

/**
 * Set custom prompt for a chat or platform (creates pending action)
 */
export const configSetPrompt: MCPTool = createTool({
  name: 'config_set_prompt',
  description:
    'Set a custom system prompt for a WhatsApp chat/group, Slack channel, or platform default (whatsapp/slack). Creates a pending action that requires user confirmation. The prompt defines how the AI assistant behaves in that context.',
  category: 'system',
  inputSchema: z.object({
    target_type: z
      .enum(['chat', 'platform'])
      .describe(
        'What to configure: "chat" for specific chat/channel, "platform" for platform-wide default (whatsapp or slack)'
      ),
    target_id: z
      .string()
      .describe(
        'Target identifier: chat/channel ID for "chat" type, platform name (whatsapp/slack) for "platform" type'
      ),
    prompt_text: z.string().describe('The custom system prompt text'),
    display_name: z.string().optional().describe('Human-readable name for this prompt'),
  }),
  keywords: [
    'prompt',
    'system',
    'instruction',
    'behavior',
    'ai',
    'customize',
    'configure',
    'slack',
    'whatsapp',
  ],
  useCases: [
    'Set a custom prompt for a specific WhatsApp group',
    'Set a custom prompt for a Slack channel',
    'Configure how the bot behaves in a particular chat',
    'Update the default Slack platform prompt',
    'Update the default WhatsApp platform prompt',
    'Customize AI behavior for different contexts',
  ],
  examples: [
    {
      description: 'Set custom prompt for a WhatsApp group',
      input: {
        target_type: 'chat',
        target_id: '120363123456789@g.us',
        prompt_text:
          'You are a helpful assistant for the engineering team. Keep responses technical and concise.',
        display_name: 'Engineering Team',
      },
    },
    {
      description: 'Update Slack platform default',
      input: {
        target_type: 'platform',
        target_id: 'slack',
        prompt_text:
          'You are a helpful assistant in Slack. The user you are talking to is named Tom. Be friendly and professional.',
      },
    },
    {
      description: 'Update WhatsApp platform default',
      input: {
        target_type: 'platform',
        target_id: 'whatsapp',
        prompt_text: 'You are a friendly AI assistant. Be helpful and conversational.',
      },
    },
  ],
  execute: async (
    input: {
      target_type: 'chat' | 'platform';
      target_id: string;
      prompt_text: string;
      display_name?: string;
    },
    _context: ToolContext
  ) => {
    const store = getPendingActionsStore();

    // Get current prompt to show in summary
    let currentPrompt = 'default prompt';
    try {
      const result = await getPromptForTarget(input.target_type, input.target_id);
      if (result.prompt) {
        currentPrompt = `"${result.prompt.substring(0, 50)}..."`;
      }
    } catch {
      // Ignore errors, use default
    }

    const targetDisplay =
      input.display_name ||
      (input.target_type === 'platform'
        ? `${input.target_id} platform`
        : input.target_id.substring(0, 20));

    const summary = `Change prompt for ${targetDisplay} (previously: ${currentPrompt})`;

    const result = store.createPendingAction(
      'prompt',
      'update',
      input.target_id,
      {
        targetType: input.target_type,
        platform:
          input.target_type === 'platform'
            ? (input.target_id as 'whatsapp' | 'slack')
            : resolvePromptPlatform(input.target_id),
        promptText: input.prompt_text,
        displayName: input.display_name,
      },
      {
        targetDisplay,
        previousValues: { prompt: currentPrompt },
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
 * Get current prompt for a chat or platform
 */
export const configGetPrompt: MCPTool = createTool({
  name: 'config_get_prompt',
  description:
    'Get the current system prompt for a WhatsApp chat, Slack channel, or platform default. Shows what instructions the AI follows in that context.',
  category: 'system',
  inputSchema: z.object({
    target_type: z
      .enum(['chat', 'platform'])
      .describe('"chat" for specific chat/channel, "platform" for platform default'),
    target_id: z
      .string()
      .describe(
        'Chat/channel ID for "chat" type, platform name (whatsapp/slack) for "platform" type'
      ),
  }),
  keywords: ['prompt', 'get', 'check', 'system', 'instruction', 'slack', 'whatsapp'],
  useCases: [
    'Check what prompt is configured for a chat or channel',
    'View the current Slack platform default prompt',
    'View the current WhatsApp platform default prompt',
    'Verify prompt settings before making changes',
  ],
  examples: [
    {
      description: 'Get prompt for a specific WhatsApp chat',
      input: {
        target_type: 'chat',
        target_id: '120363123456789@g.us',
      },
    },
    {
      description: 'Get Slack platform default',
      input: {
        target_type: 'platform',
        target_id: 'slack',
      },
    },
    {
      description: 'Get WhatsApp platform default',
      input: {
        target_type: 'platform',
        target_id: 'whatsapp',
      },
    },
  ],
  execute: async (
    input: { target_type: 'chat' | 'platform'; target_id: string },
    _context: ToolContext
  ) => {
    return await getPromptForTarget(input.target_type, input.target_id);
  },
});

/**
 * List all custom prompts
 */
export const configListPrompts: MCPTool = createTool({
  name: 'config_list_prompts',
  description:
    'List all custom system prompts that have been configured. Shows chat-specific and platform-wide prompts.',
  category: 'system',
  inputSchema: z
    .object({
      platform_filter: platformSchema
        .optional()
        .describe('Optional filter: only show prompts for this platform'),
    })
    .describe('Optional filters for prompt list'),
  keywords: ['prompt', 'list', 'all', 'configured', 'custom'],
  useCases: [
    'See all custom prompts configured',
    'Review prompt settings across chats',
    'Find which chats have custom prompts',
  ],
  examples: [
    {
      description: 'List all WhatsApp prompts',
      input: { platform_filter: 'whatsapp' },
    },
  ],
  execute: async (input: { platform_filter?: 'whatsapp' | 'slack' }, _context: ToolContext) => {
    return await listAllPrompts(input.platform_filter);
  },
});

/**
 * Helper: Get prompt for a specific target using database-services directly
 */
async function getPromptForTarget(targetType: 'chat' | 'platform', targetId: string) {
  const { createMessageDatabase } = await import('@orient/database-services');
  const messageDb = createMessageDatabase();

  if (targetType === 'platform') {
    const platform = targetId as 'whatsapp' | 'slack';
    const dbPrompt = await messageDb.getDefaultPrompt(platform);
    const prompt = dbPrompt?.promptText ?? EMBEDDED_DEFAULT_PROMPTS[platform];
    const source = dbPrompt ? 'database' : 'embedded_default';

    return {
      target_type: 'platform',
      platform,
      prompt,
      source,
      message:
        source === 'database'
          ? 'Custom platform default configured'
          : 'Using embedded default prompt',
    };
  }

  const platform = resolvePromptPlatform(targetId);

  // First check for chat-specific prompt
  const chatPrompt = await messageDb.getSystemPrompt(platform, targetId);

  if (chatPrompt && chatPrompt.chatId !== '*') {
    // Has custom chat prompt
    return {
      target_type: 'chat',
      target_id: targetId,
      platform,
      prompt: chatPrompt.promptText,
      source: 'database',
      message: 'Custom chat prompt configured',
    };
  }

  // Fall back to platform default or embedded default
  const defaultPrompt = await messageDb.getDefaultPrompt(platform);
  const prompt = defaultPrompt?.promptText ?? EMBEDDED_DEFAULT_PROMPTS[platform];

  return {
    target_type: 'chat',
    target_id: targetId,
    platform,
    prompt,
    source: defaultPrompt ? 'platform_default' : 'embedded_default',
    message: defaultPrompt ? 'Using platform default prompt' : 'Using embedded default prompt',
  };
}

/**
 * Helper: List all configured prompts using database-services directly
 */
async function listAllPrompts(platformFilter?: 'whatsapp' | 'slack') {
  const { createMessageDatabase } = await import('@orient/database-services');
  const messageDb = createMessageDatabase();

  const prompts = await messageDb.listSystemPrompts(platformFilter);

  return {
    count: prompts.length,
    prompts: prompts.map((p) => ({
      target_id: p.chatId === '*' ? p.platform : p.chatId,
      target_type: p.chatId === '*' ? 'platform' : 'chat',
      platform: p.platform,
      prompt_preview: p.promptText.substring(0, 100) + (p.promptText.length > 100 ? '...' : ''),
      updated_at: p.updatedAt,
    })),
  };
}

/**
 * All prompt tools
 */
export const promptTools: MCPTool[] = [configSetPrompt, configGetPrompt, configListPrompts];
