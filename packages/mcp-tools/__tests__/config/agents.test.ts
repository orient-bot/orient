import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ToolContext } from '../../src/types.js';
import {
  configGetAgent,
  configListAgents,
  configUpdateAgent,
} from '../../src/tools/config/agents.js';
import {
  getPendingActionsStore,
  resetPendingActionsStore,
} from '../../src/tools/config/pending-store.js';

const context = { config: {}, correlationId: 'test' } as ToolContext;

const agentsTable = { id: 'id', enabled: 'enabled' };
const agentSkillsTable = { agentId: 'agentId' };
const agentToolsTable = { agentId: 'agentId' };

const agentRow = {
  id: 'pm-assistant',
  name: 'PM Assistant',
  description: 'Primary agent',
  mode: 'primary',
  enabled: true,
  modelDefault: 'openai/gpt-4o-mini',
  modelFallback: 'anthropic/claude-sonnet-4',
  basePrompt: 'Be helpful',
  updatedAt: new Date('2025-01-01T00:00:00Z'),
};

const skillsRows = [{ skillName: 'personal-jira-project-management', enabled: true }];
const toolsRows = [{ pattern: 'jira.*', type: 'allow' }];

const allAgents = [agentRow, { ...agentRow, id: 'communicator', enabled: false }];

vi.mock('@orient-bot/database', () => ({
  getDatabase: () => ({
    select: () => ({
      from: (table: unknown) => {
        const result =
          table === agentsTable
            ? allAgents
            : table === agentSkillsTable
              ? skillsRows
              : table === agentToolsTable
                ? toolsRows
                : [];

        return {
          where: () => Promise.resolve(result),
          then: (resolve: (value: unknown) => void) => Promise.resolve(result).then(resolve),
        };
      },
    }),
  }),
  agents: agentsTable,
  agentSkills: agentSkillsTable,
  agentTools: agentToolsTable,
  eq: vi.fn(() => 'eq'),
}));

describe('config agents tools', () => {
  beforeEach(() => {
    resetPendingActionsStore();
  });

  it('returns agent details', async () => {
    const result = await configGetAgent.execute({ agent_id: 'pm-assistant' }, context);

    expect(result.exists).toBe(true);
    expect(result.id).toBe('pm-assistant');
    expect(result.skills).toHaveLength(1);
    expect(result.tools).toHaveLength(1);
  });

  it('lists all agents', async () => {
    const result = await configListAgents.execute({}, context);

    expect(result.count).toBe(2);
    expect(result.agents[0]?.id).toBe('pm-assistant');
  });

  it('creates pending action when updating agent', async () => {
    const result = await configUpdateAgent.execute(
      { agent_id: 'pm-assistant', enabled: false, model_default: 'opencode/grok' },
      context
    );

    expect(result.status).toBe('pending');
    const store = getPendingActionsStore();
    const action = store.getAction(result.action_id);
    expect(action?.type).toBe('agent');
  });

  it('rejects updates with no changes', async () => {
    const result = await configUpdateAgent.execute({ agent_id: 'pm-assistant' }, context);

    expect(result.success).toBe(false);
    expect(result.message).toContain('No changes specified');
  });
});
