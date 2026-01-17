/**
 * Agent Tools
 *
 * Tools for agent management and context retrieval.
 *
 * Migration Note:
 * These tools are being migrated from src/tools/agents/:
 * - get-agent-context.ts
 * - handoff-to-agent.ts
 * - list-agents.ts
 */

export const AGENTS_TOOLS_MIGRATION_STATUS = {
  status: 'pending',
  sourceLocation: 'src/tools/agents/',
} as const;

interface ToolResult {
  success: boolean;
  data?: unknown;
  error?: string;
}

// Stub tool objects with run method until migration is complete
export const getAgentContextTool = {
  async run(_params: unknown, _context: unknown): Promise<ToolResult> {
    return {
      success: false,
      error: 'Agent context tool not yet migrated',
    };
  },
};

export const listAgentsTool = {
  async run(_params: unknown, _context: unknown): Promise<ToolResult> {
    return {
      success: false,
      error: 'List agents tool not yet migrated',
    };
  },
};

export const handoffToAgentTool = {
  async run(_params: unknown, _context: unknown): Promise<ToolResult> {
    return {
      success: false,
      error: 'Handoff to agent tool not yet migrated',
    };
  },
};
