import { describe, expect, it, vi, beforeEach } from 'vitest';

// TODO: Re-enable when agent tools are migrated to @orient-bot/mcp-tools
// These tools are currently stubs - see packages/mcp-tools/src/tools/agents/index.ts
// import type { ToolContext } from '@orient-bot/mcp-tools';
// import { handoffToAgentTool } from '@orient-bot/mcp-tools';

const context = { config: {}, correlationId: 'test' } as any;

let getAgentSpy: ReturnType<typeof vi.fn>;

vi.mock('@orient-bot/agents', () => ({
  getAgentRegistry: () => ({
    getAgent: getAgentSpy,
  }),
}));

describe.skip('handoffToAgentTool (pending migration)', () => {
  beforeEach(() => {
    getAgentSpy = vi.fn();
  });

  it('returns error when agent not found', async () => {
    getAgentSpy.mockResolvedValue(null);

    const result = await handoffToAgentTool.execute(
      { agent: 'missing', task: 'Do something' },
      context
    );

    expect(result.success).toBe(false);
    expect(result.error).toContain('not found');
  });

  it('returns error when agent is disabled', async () => {
    getAgentSpy.mockResolvedValue({ id: 'explorer', enabled: false, description: 'desc' });

    const result = await handoffToAgentTool.execute(
      { agent: 'explorer', task: 'Explore code' },
      context
    );

    expect(result.success).toBe(false);
    expect(result.error).toContain('disabled');
  });

  it('creates session and returns immediately when waitForCompletion is false', async () => {
    getAgentSpy.mockResolvedValue({ id: 'explorer', enabled: true, description: 'desc' });

    const fetchSpy = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ id: 'session-1' }),
    });
    (globalThis as any).fetch = fetchSpy;

    const result = await handoffToAgentTool.execute(
      { agent: 'explorer', task: 'Explore code', waitForCompletion: false },
      context
    );

    expect(result.success).toBe(true);
    expect(result.sessionId).toBe('session-1');
  });

  it('includes parent session id when provided', async () => {
    getAgentSpy.mockResolvedValue({ id: 'explorer', enabled: true, description: 'desc' });

    const fetchSpy = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ id: 'session-2' }),
    });
    (globalThis as any).fetch = fetchSpy;

    await handoffToAgentTool.execute(
      {
        agent: 'explorer',
        task: 'Explore code',
        parent_session_id: 'parent-123',
        waitForCompletion: false,
      },
      context
    );

    const [, options] = fetchSpy.mock.calls[0];
    const body = JSON.parse(options.body as string);

    expect(body.parentSessionId).toBe('parent-123');
  });
});
