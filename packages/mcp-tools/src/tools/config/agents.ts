/**
 * Agent Configuration Tools
 *
 * Tools for managing agent settings:
 * - config_update_agent: Update agent settings (with confirmation)
 * - config_list_agents: List all agents and their status
 * - config_get_agent: Get detailed agent configuration
 */

import { z } from 'zod';
import { createTool, MCPTool } from '../base.js';
import type { ToolContext } from '../../types.js';
import { getPendingActionsStore } from './pending-store.js';

// Register the executor when the module loads
import { registerAgentExecutor } from './executors/agent-executor.js';
registerAgentExecutor();

const agentModeSchema = z.enum(['primary', 'specialized']);

/**
 * Update agent configuration (creates pending action)
 */
export const configUpdateAgent: MCPTool = createTool({
  name: 'config_update_agent',
  description:
    'Update agent configuration settings (enabled status, base prompt, model selection). Creates a pending action that requires user confirmation.',
  category: 'system',
  inputSchema: z.object({
    agent_id: z
      .string()
      .describe('Agent ID (e.g., ori, communicator, scheduler, explorer, app-builder)'),
    enabled: z.boolean().optional().describe('Enable or disable the agent'),
    base_prompt: z.string().optional().describe('Update the base system prompt for the agent'),
    model_default: z
      .string()
      .optional()
      .describe('Default model ID (e.g., openai/gpt-4o-mini, anthropic/claude-sonnet-4)'),
    model_fallback: z.string().optional().describe('Fallback model if default fails'),
  }),
  keywords: ['agent', 'configure', 'update', 'enable', 'disable', 'model', 'prompt'],
  useCases: [
    'Enable or disable an agent',
    'Update an agent base prompt',
    'Change which AI model an agent uses',
    'Configure agent behavior',
  ],
  examples: [
    {
      description: 'Disable the scheduler agent',
      input: {
        agent_id: 'scheduler',
        enabled: false,
      },
    },
    {
      description: 'Update onboarder prompt',
      input: {
        agent_id: 'onboarder',
        base_prompt: 'You are Ori, a helpful guide. Be extra friendly!',
      },
    },
  ],
  execute: async (
    input: {
      agent_id: string;
      enabled?: boolean;
      base_prompt?: string;
      model_default?: string;
      model_fallback?: string;
    },
    _context: ToolContext
  ) => {
    const store = getPendingActionsStore();

    // Get current agent config
    const current = await getAgentConfig(input.agent_id);
    if (!current.exists) {
      return {
        success: false,
        message: `Agent "${input.agent_id}" not found. Available agents: ori, communicator, scheduler, explorer, app-builder.`,
      };
    }

    // Build changes object with only provided fields
    const changes: Record<string, unknown> = {};
    const changedFields: string[] = [];

    if (input.enabled !== undefined) {
      changes.enabled = input.enabled;
      changedFields.push(`enabled: ${current.enabled} → ${input.enabled}`);
    }
    if (input.base_prompt !== undefined) {
      changes.basePrompt = input.base_prompt;
      changedFields.push(`base_prompt: updated`);
    }
    if (input.model_default !== undefined) {
      changes.modelDefault = input.model_default;
      changedFields.push(`model: ${current.model_default} → ${input.model_default}`);
    }
    if (input.model_fallback !== undefined) {
      changes.modelFallback = input.model_fallback;
      changedFields.push(`fallback: ${current.model_fallback} → ${input.model_fallback}`);
    }

    if (changedFields.length === 0) {
      return {
        success: false,
        message: 'No changes specified. Provide at least one field to update.',
      };
    }

    const summary = `Update agent "${current.name}" (${current.id}): ${changedFields.join(', ')}`;

    const result = store.createPendingAction('agent', 'update', input.agent_id, changes, {
      targetDisplay: current.name,
      previousValues: {
        enabled: current.enabled,
        model_default: current.model_default,
      },
      summary,
    });

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
 * Get detailed agent configuration
 */
export const configGetAgent: MCPTool = createTool({
  name: 'config_get_agent',
  description:
    'Get detailed configuration for a specific agent. Shows enabled status, prompt, models, skills, and tool permissions.',
  category: 'system',
  inputSchema: z.object({
    agent_id: z
      .string()
      .describe('Agent ID (e.g., ori, communicator, scheduler, explorer, app-builder)'),
  }),
  keywords: ['agent', 'get', 'check', 'config', 'details'],
  useCases: [
    'View agent configuration details',
    'Check which skills an agent has',
    'See what tools an agent can use',
    'Verify agent settings',
  ],
  examples: [
    {
      description: 'Get onboarder agent config',
      input: { agent_id: 'onboarder' },
    },
  ],
  execute: async (input: { agent_id: string }, _context: ToolContext) => {
    return await getAgentConfig(input.agent_id);
  },
});

/**
 * List all agents
 */
export const configListAgents: MCPTool = createTool({
  name: 'config_list_agents',
  description:
    'List all configured agents. Shows agent names, modes, enabled status, and brief descriptions.',
  category: 'system',
  inputSchema: z
    .object({
      enabled_only: z
        .boolean()
        .optional()
        .describe('If true, only show enabled agents (default: false)'),
    })
    .describe('Optional filters for agent list'),
  keywords: ['agent', 'list', 'all', 'configured', 'available'],
  useCases: [
    'See all available agents',
    'Check which agents are enabled',
    'Review agent configuration',
  ],
  examples: [
    {
      description: 'List all agents',
      input: {},
    },
    {
      description: 'List only enabled agents',
      input: { enabled_only: true },
    },
  ],
  execute: async (input: { enabled_only?: boolean }, _context: ToolContext) => {
    return await listAllAgents(input.enabled_only);
  },
});

/**
 * Helper: Get agent configuration
 */
async function getAgentConfig(agentId: string) {
  const { getDatabase, agents, agentSkills, agentTools, eq } = await import('@orientbot/database');
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = (await getDatabase()) as any;

  const [agent] = await db.select().from(agents).where(eq(agents.id, agentId));

  if (!agent) {
    return {
      exists: false,
      agent_id: agentId,
      message: `Agent "${agentId}" not found.`,
    };
  }

  // Get skills
  const skills = await db.select().from(agentSkills).where(eq(agentSkills.agentId, agentId));

  // Get tools
  const tools = await db.select().from(agentTools).where(eq(agentTools.agentId, agentId));

  return {
    exists: true,
    id: agent.id,
    name: agent.name,
    description: agent.description,
    mode: agent.mode,
    enabled: agent.enabled,
    model_default: agent.modelDefault,
    model_fallback: agent.modelFallback,
    base_prompt: agent.basePrompt,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    skills: skills.map((s: any) => ({
      name: s.skillName,
      enabled: s.enabled,
    })),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    tools: tools.map((t: any) => ({
      pattern: t.pattern,
      type: t.type,
    })),
    updated_at: agent.updatedAt,
  };
}

/**
 * Helper: List all agents
 */
async function listAllAgents(enabledOnly?: boolean) {
  const { getDatabase, agents, eq } = await import('@orientbot/database');
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = (await getDatabase()) as any;

  const agentList = enabledOnly
    ? await db.select().from(agents).where(eq(agents.enabled, true))
    : await db.select().from(agents);

  return {
    count: agentList.length,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    agents: agentList.map((a: any) => ({
      id: a.id,
      name: a.name,
      description: a.description,
      mode: a.mode,
      enabled: a.enabled,
      model_default: a.modelDefault,
    })),
  };
}

/**
 * All agent tools
 */
export const agentTools: MCPTool[] = [configUpdateAgent, configGetAgent, configListAgents];
