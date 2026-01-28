/**
 * Secret Configuration Tools
 *
 * Tools for managing API keys and tokens:
 * - config_set_secret: Set a secret value (with confirmation)
 * - config_list_secrets: List all secret keys (not values)
 * - config_delete_secret: Delete a secret (with confirmation)
 */

import { z } from 'zod';
import { createTool, MCPTool } from '../base.js';
import type { ToolContext } from '../../types.js';
import { getPendingActionsStore } from './pending-store.js';
import type { SecretMetadata } from '@orientbot/database-services';

// Register the executor when the module loads
import { registerSecretExecutor } from './executors/secret-executor.js';
registerSecretExecutor();

/**
 * Set a secret value (creates pending action)
 */
export const configSetSecret: MCPTool = createTool({
  name: 'config_set_secret',
  description:
    'Set a secret value (API key, token, password). Creates a pending action that requires user confirmation. Secrets are stored encrypted in the database and used by integrations.',
  category: 'system',
  inputSchema: z.object({
    key: z
      .string()
      .describe(
        'Secret key name (e.g., JIRA_API_TOKEN, SLACK_BOT_TOKEN, OPENAI_API_KEY). Use UPPERCASE_WITH_UNDERSCORES convention.'
      ),
    value: z.string().describe('The secret value to store (will be encrypted)'),
    category: z
      .string()
      .optional()
      .describe('Category for organization (e.g., jira, slack, openai, google)'),
    description: z.string().optional().describe('Human-readable description of this secret'),
  }),
  keywords: ['secret', 'api', 'key', 'token', 'password', 'credential', 'configure'],
  useCases: [
    'Store JIRA API token for integration',
    'Configure Slack bot token',
    'Add OpenAI API key',
    'Store Google OAuth credentials',
    'Update an existing secret value',
  ],
  examples: [
    {
      description: 'Store JIRA API token',
      input: {
        key: 'JIRA_API_TOKEN',
        value: 'ATATT3xF...secretvalue',
        category: 'jira',
        description: 'Atlassian API token for JIRA integration',
      },
    },
    {
      description: 'Store Slack bot token',
      input: {
        key: 'SLACK_BOT_TOKEN',
        value: 'xoxb-123456789...',
        category: 'slack',
        description: 'Bot User OAuth Token',
      },
    },
  ],
  execute: async (
    input: { key: string; value: string; category?: string; description?: string },
    _context: ToolContext
  ) => {
    const store = getPendingActionsStore();

    // Check if secret already exists
    let existingSecret = false;
    try {
      const result = await getSecretMetadata(input.key);
      if (result.exists) {
        existingSecret = true;
      }
    } catch {
      // Secret doesn't exist, that's fine
    }

    const operation = existingSecret ? 'update' : 'create';
    const summary = existingSecret
      ? `Update secret "${input.key}" (category: ${input.category || 'none'})`
      : `Create new secret "${input.key}" (category: ${input.category || 'none'})`;

    const result = store.createPendingAction(
      'secret',
      operation,
      input.key,
      {
        value: input.value,
        category: input.category,
        description: input.description,
      },
      {
        targetDisplay: input.key,
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
      note: 'The secret value will be encrypted before storage.',
    };
  },
});

/**
 * List all secret keys (not values)
 */
export const configListSecrets: MCPTool = createTool({
  name: 'config_list_secrets',
  description:
    'List all configured secret keys. Shows secret names, categories, and descriptions but NOT the actual secret values for security.',
  category: 'system',
  inputSchema: z
    .object({
      category_filter: z
        .string()
        .optional()
        .describe('Optional filter: only show secrets in this category'),
    })
    .describe('Optional filters for secret list'),
  keywords: ['secret', 'list', 'keys', 'api', 'token', 'configured'],
  useCases: [
    'See what secrets are configured',
    'Check if a secret key exists',
    'Review secrets by category',
    'Find which API keys are stored',
  ],
  examples: [
    {
      description: 'List all JIRA secrets',
      input: { category_filter: 'jira' },
    },
    {
      description: 'List all secrets',
      input: {},
    },
  ],
  execute: async (input: { category_filter?: string }, _context: ToolContext) => {
    return await listAllSecrets(input.category_filter);
  },
});

/**
 * Delete a secret (creates pending action)
 */
export const configDeleteSecret: MCPTool = createTool({
  name: 'config_delete_secret',
  description:
    'Delete a secret from storage. Creates a pending action that requires user confirmation. Use this to remove old or unused API keys.',
  category: 'system',
  inputSchema: z.object({
    key: z.string().describe('Secret key name to delete (e.g., JIRA_API_TOKEN)'),
  }),
  keywords: ['secret', 'delete', 'remove', 'api', 'key', 'revoke'],
  useCases: [
    'Remove an old API key',
    'Delete unused secrets',
    'Clean up revoked tokens',
    'Remove expired credentials',
  ],
  examples: [
    {
      description: 'Delete an API token',
      input: { key: 'OLD_JIRA_API_TOKEN' },
    },
  ],
  execute: async (input: { key: string }, _context: ToolContext) => {
    const store = getPendingActionsStore();

    // Check if secret exists
    const metadata = await getSecretMetadata(input.key);
    if (!metadata.exists) {
      return {
        success: false,
        message: `Secret "${input.key}" not found. Cannot delete a non-existent secret.`,
      };
    }

    const summary = `Delete secret "${input.key}" (category: ${metadata.category || 'none'})`;

    const result = store.createPendingAction(
      'secret',
      'delete',
      input.key,
      {},
      {
        targetDisplay: input.key,
        previousValues: {
          category: metadata.category,
          description: metadata.description,
        },
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
 * Helper: Get secret metadata (not the actual value)
 */
async function getSecretMetadata(key: string) {
  const { createSecretsService } = await import('@orientbot/database-services');
  const secretsService = createSecretsService();

  const secrets = await secretsService.listSecrets();
  const secret = secrets.find((s) => s.key === key);

  if (!secret) {
    return {
      key,
      exists: false,
    };
  }

  return {
    key: secret.key,
    exists: true,
    category: secret.category || undefined,
    description: secret.description || undefined,
    updated_at: secret.updatedAt,
  };
}

/**
 * Helper: List all secrets (metadata only)
 */
async function listAllSecrets(categoryFilter?: string) {
  const { createSecretsService } = await import('@orientbot/database-services');
  const secretsService = createSecretsService();

  let secrets = (await secretsService.listSecrets()) as SecretMetadata[];

  // Apply filter
  if (categoryFilter) {
    secrets = secrets.filter((s) => s.category === categoryFilter);
  }

  return {
    count: secrets.length,
    secrets: secrets.map((s) => ({
      key: s.key,
      category: s.category || undefined,
      description: s.description || undefined,
      updated_at: s.updatedAt,
    })),
    note: 'Secret values are not shown for security. Use config_get_secret if you need to verify a value.',
  };
}

/**
 * All secret tools
 */
export const secretTools: MCPTool[] = [configSetSecret, configListSecrets, configDeleteSecret];
