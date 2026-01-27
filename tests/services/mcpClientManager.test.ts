import { describe, expect, it, vi } from 'vitest';
import { MCPClientManager } from '@orientbot/agents';

describe('MCPClientManager', () => {
  it('returns tools only from connected servers', () => {
    const manager = new MCPClientManager({});

    const servers = new Map<string, any>();
    servers.set('alpha', {
      status: { status: 'connected' },
      tools: [{ name: 'toolA', description: 'A', inputSchema: {} }],
      client: {},
    });
    servers.set('beta', {
      status: { status: 'failed', error: 'boom' },
      tools: [{ name: 'toolB', description: 'B', inputSchema: {} }],
      client: {},
    });

    (manager as any).servers = servers;

    const tools = manager.getAllTools();
    expect(tools).toHaveLength(1);
    expect(tools[0]?.prefixedName).toBe('mcp_alpha_toolA');
  });

  it('returns errors for missing or disconnected servers', async () => {
    const manager = new MCPClientManager({});
    const servers = new Map<string, any>();
    servers.set('alpha', {
      status: { status: 'failed', error: 'down' },
      tools: [],
      client: { callTool: vi.fn() },
    });
    (manager as any).servers = servers;

    const missing = await manager.callTool('missing', 'tool', {});
    expect(missing.success).toBe(false);

    const disconnected = await manager.callTool('alpha', 'tool', {});
    expect(disconnected.success).toBe(false);
  });

  it('calls tools on connected servers', async () => {
    const manager = new MCPClientManager({});
    const callToolSpy = vi.fn().mockResolvedValue({ content: 'ok' });

    (manager as any).servers = new Map([
      [
        'alpha',
        {
          status: { status: 'connected' },
          tools: [],
          client: { callTool: callToolSpy },
        },
      ],
    ]);

    const result = await manager.callTool('alpha', 'do_thing', { a: 1 });
    expect(result.success).toBe(true);
    expect(callToolSpy).toHaveBeenCalledWith({ name: 'do_thing', arguments: { a: 1 } });
  });

  it('parses prefixed tool names', async () => {
    const manager = new MCPClientManager({});
    const callToolSpy = vi.fn().mockResolvedValue({ content: 'ok' });
    (manager as any).servers = new Map([
      [
        'alpha',
        {
          status: { status: 'connected' },
          tools: [],
          client: { callTool: callToolSpy },
        },
      ],
    ]);

    const result = await manager.callToolByPrefixedName('mcp_alpha_echo', { text: 'hi' });
    expect(result.success).toBe(true);
    expect(callToolSpy).toHaveBeenCalledWith({ name: 'echo', arguments: { text: 'hi' } });

    const invalid = await manager.callToolByPrefixedName('not_mcp_name', {});
    expect(invalid.success).toBe(false);
  });
});
