/**
 * Context Tools
 *
 * Tools for reading and updating agent context.
 *
 * Migration Note:
 * These tools are being migrated from src/tools/context/:
 * - read-context.ts
 * - update-context.ts
 */

export const CONTEXT_TOOLS_MIGRATION_STATUS = {
  status: 'pending',
  sourceLocation: 'src/tools/context/',
} as const;

interface ToolResult {
  success: boolean;
  data?: unknown;
  error?: string;
}

// Stub tool objects with run method until migration is complete
export const readContextTool = {
  async run(_params: unknown, _context: unknown): Promise<ToolResult> {
    return {
      success: false,
      error: 'Read context tool not yet migrated',
    };
  },
};

export const updateContextTool = {
  async run(_params: unknown, _context: unknown): Promise<ToolResult> {
    return {
      success: false,
      error: 'Update context tool not yet migrated',
    };
  },
};
