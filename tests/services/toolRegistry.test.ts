import { describe, expect, it } from 'vitest';
import { createToolRegistry, ToolRegistry, type ToolMetadata } from '@orientbot/agents';

describe('ToolRegistry', () => {
  const sampleTool: ToolMetadata = {
    tool: {
      name: 'sample_tool',
      description: 'Sample tool for tests',
      inputSchema: {
        type: 'object',
        properties: {},
      },
    },
    category: 'apps',
    keywords: ['sample', 'test'],
    useCases: ['Use sample tool'],
  };

  it('registers and retrieves tools by name', () => {
    const registry = new ToolRegistry();
    registry.registerTool(sampleTool);

    const fetched = registry.getTool('sample_tool');
    expect(fetched).toBeDefined();
    expect(fetched?.tool.name).toBe('sample_tool');
    expect(fetched?.category).toBe('apps');
  });

  it('indexes tools by category', () => {
    const registry = new ToolRegistry();
    registry.registerTool(sampleTool);

    const tools = registry.getToolsByCategory('apps');
    expect(tools).toHaveLength(1);
    expect(tools[0]?.tool.name).toBe('sample_tool');

    const names = registry.getToolNamesByCategory('apps');
    expect(names).toContain('sample_tool');
  });

  it('returns category metadata with tool counts', () => {
    const registry = new ToolRegistry();
    registry.registerTool(sampleTool);

    const categories = registry.getCategories();
    const appsCategory = categories.find((category) => category.name === 'apps');
    expect(appsCategory).toBeDefined();
    expect(appsCategory?.toolCount).toBe(1);
    expect(appsCategory?.keywords.length).toBeGreaterThan(0);
  });

  it('returns all tools and definitions', () => {
    const registry = new ToolRegistry();
    registry.registerTool(sampleTool);

    const allTools = registry.getAllTools();
    expect(allTools).toHaveLength(1);

    const definitions = registry.getAllToolDefinitions();
    expect(definitions).toHaveLength(1);
    expect(definitions[0]?.name).toBe('sample_tool');
  });

  it('tracks initialization state', () => {
    const registry = new ToolRegistry();
    expect(registry.isInitialized()).toBe(false);

    registry.markInitialized();
    expect(registry.isInitialized()).toBe(true);
  });
});

describe('createToolRegistry', () => {
  it('registers built-in tools and marks initialized', () => {
    const registry = createToolRegistry();

    expect(registry.isInitialized()).toBe(true);
    expect(registry.size).toBeGreaterThan(0);

    const systemTool = registry.getTool('system_health_check');
    expect(systemTool).toBeDefined();
    expect(systemTool?.category).toBe('system');
  });
});
