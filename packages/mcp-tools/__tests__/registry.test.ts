/**
 * Tool Registry Tests
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// Mock logger before imports
vi.mock('@orient/core', () => ({
  createServiceLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    startOperation: () => ({
      success: vi.fn(),
      failure: vi.fn(),
    }),
  }),
}));

describe('ToolRegistry', () => {
  beforeEach(async () => {
    // Reset registry before each test
    const { resetToolRegistry } = await import('../src/registry/index.js');
    resetToolRegistry();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('Basic Operations', () => {
    it('should register a tool', async () => {
      const { getToolRegistry } = await import('../src/registry/index.js');
      const registry = getToolRegistry();

      const metadata = {
        tool: {
          name: 'test_tool',
          description: 'A test tool',
          inputSchema: { type: 'object' as const, properties: {} },
        },
        category: 'jira' as const,
        keywords: ['test'],
        useCases: ['Testing'],
      };

      registry.registerTool(metadata);

      expect(registry.getTool('test_tool')).toEqual(metadata);
    });

    it('should get all tools', async () => {
      const { getToolRegistry } = await import('../src/registry/index.js');
      const registry = getToolRegistry();

      registry.registerTool({
        tool: { name: 'tool1', description: 'Tool 1', inputSchema: { type: 'object' as const, properties: {} } },
        category: 'jira',
        keywords: [],
        useCases: [],
      });

      registry.registerTool({
        tool: { name: 'tool2', description: 'Tool 2', inputSchema: { type: 'object' as const, properties: {} } },
        category: 'messaging',
        keywords: [],
        useCases: [],
      });

      expect(registry.getAllTools()).toHaveLength(2);
    });

    it('should get tools by category', async () => {
      const { getToolRegistry } = await import('../src/registry/index.js');
      const registry = getToolRegistry();

      registry.registerTool({
        tool: { name: 'jira_tool', description: 'JIRA Tool', inputSchema: { type: 'object' as const, properties: {} } },
        category: 'jira',
        keywords: [],
        useCases: [],
      });

      registry.registerTool({
        tool: { name: 'slack_tool', description: 'Slack Tool', inputSchema: { type: 'object' as const, properties: {} } },
        category: 'messaging',
        keywords: [],
        useCases: [],
      });

      const jiraTools = registry.getToolsByCategory('jira');
      expect(jiraTools).toHaveLength(1);
      expect(jiraTools[0].tool.name).toBe('jira_tool');
    });
  });

  describe('Search', () => {
    it('should search tools by keyword', async () => {
      const { getToolRegistry } = await import('../src/registry/index.js');
      const registry = getToolRegistry();

      registry.registerTool({
        tool: { name: 'get_issues', description: 'Get JIRA issues', inputSchema: { type: 'object' as const, properties: {} } },
        category: 'jira',
        keywords: ['issue', 'ticket', 'jira'],
        useCases: ['Find issues'],
      });

      registry.registerTool({
        tool: { name: 'send_message', description: 'Send a Slack message', inputSchema: { type: 'object' as const, properties: {} } },
        category: 'messaging',
        keywords: ['message', 'slack', 'send'],
        useCases: ['Send notifications'],
      });

      const results = registry.searchTools('issue');
      expect(results.length).toBeGreaterThan(0);
      expect(results[0].tool.tool.name).toBe('get_issues');
    });

    it('should return empty results for no match', async () => {
      const { getToolRegistry } = await import('../src/registry/index.js');
      const registry = getToolRegistry();

      registry.registerTool({
        tool: { name: 'test_tool', description: 'Test', inputSchema: { type: 'object' as const, properties: {} } },
        category: 'jira',
        keywords: ['test'],
        useCases: ['Testing'],
      });

      const results = registry.searchTools('nonexistent_keyword_xyz');
      expect(results).toHaveLength(0);
    });
  });

  describe('Categories', () => {
    it('should get category info', async () => {
      const { getToolRegistry } = await import('../src/registry/index.js');
      const registry = getToolRegistry();

      const info = registry.getCategoryInfo('jira');
      expect(info.name).toBe('jira');
      expect(info.description).toContain('JIRA');
      expect(info.keywords.length).toBeGreaterThan(0);
    });

    it('should get all categories', async () => {
      const { getToolRegistry } = await import('../src/registry/index.js');
      const registry = getToolRegistry();

      const categories = registry.getAllCategories();
      expect(categories).toHaveLength(7);  // jira, messaging, whatsapp, docs, google, system, media
      expect(categories.map(c => c.name)).toContain('jira');
      expect(categories.map(c => c.name)).toContain('messaging');
      expect(categories.map(c => c.name)).toContain('media');
    });
  });

  describe('Singleton', () => {
    it('should return same instance', async () => {
      const { getToolRegistry } = await import('../src/registry/index.js');
      const registry1 = getToolRegistry();
      const registry2 = getToolRegistry();

      expect(registry1).toBe(registry2);
    });

    it('should reset registry', async () => {
      const { getToolRegistry, resetToolRegistry } = await import('../src/registry/index.js');
      const registry1 = getToolRegistry();
      registry1.registerTool({
        tool: { name: 'test', description: 'Test', inputSchema: { type: 'object' as const, properties: {} } },
        category: 'jira',
        keywords: [],
        useCases: [],
      });

      resetToolRegistry();
      const registry2 = getToolRegistry();

      expect(registry2.getAllTools()).toHaveLength(0);
    });
  });

  describe('Statistics', () => {
    it('should return correct stats', async () => {
      const { getToolRegistry } = await import('../src/registry/index.js');
      const registry = getToolRegistry();

      registry.registerTool({
        tool: { name: 'jira1', description: 'J1', inputSchema: { type: 'object' as const, properties: {} } },
        category: 'jira',
        keywords: [],
        useCases: [],
      });
      registry.registerTool({
        tool: { name: 'jira2', description: 'J2', inputSchema: { type: 'object' as const, properties: {} } },
        category: 'jira',
        keywords: [],
        useCases: [],
      });
      registry.registerTool({
        tool: { name: 'slack1', description: 'S1', inputSchema: { type: 'object' as const, properties: {} } },
        category: 'messaging',
        keywords: [],
        useCases: [],
      });

      registry.markInitialized();
      const stats = registry.getStats();

      expect(stats.totalTools).toBe(3);
      expect(stats.byCategory.jira).toBe(2);
      expect(stats.byCategory.messaging).toBe(1);
      expect(stats.initialized).toBe(true);
    });
  });
});
