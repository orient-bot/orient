/**
 * Tests for MCP Tools Entry Point
 *
 * Verifies the main.ts module structure and tool registry.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock dependencies before imports
vi.mock('@orientbot/core', () => ({
  createServiceLogger: () => ({
    info: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    warn: vi.fn(),
    startOperation: () => ({
      success: vi.fn(),
      failure: vi.fn(),
    }),
  }),
  loadConfig: vi.fn().mockResolvedValue(undefined),
  getConfig: vi.fn().mockReturnValue({
    integrations: {
      jira: { host: 'test.atlassian.net', email: 'test@test.com', apiToken: 'token' },
    },
    organization: {
      name: 'Test Org',
      jiraProjectKey: 'TEST',
    },
  }),
}));

vi.mock('jira.js', () => {
  return {
    Version3Client: class MockVersion3Client {
      issues = {
        searchForIssuesUsingJql: vi.fn().mockResolvedValue({ issues: [] }),
      };
    },
  };
});

import { resetToolRegistry } from '../src/registry/index.js';

describe('MCP Tools Entry Point', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetToolRegistry();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    resetToolRegistry();
  });

  describe('Module Structure', () => {
    it('should export ToolRegistry from registry', async () => {
      const { ToolRegistry } = await import('../src/registry/index.js');
      expect(ToolRegistry).toBeDefined();
      expect(typeof ToolRegistry).toBe('function');
    });

    it('should export getToolRegistry singleton getter', async () => {
      const { getToolRegistry } = await import('../src/registry/index.js');
      expect(getToolRegistry).toBeDefined();
      expect(typeof getToolRegistry).toBe('function');
    });

    it('should export MCPTool base class', async () => {
      const { MCPTool } = await import('../src/tools/index.js');
      expect(MCPTool).toBeDefined();
      expect(typeof MCPTool).toBe('function');
    });

    it('should export createToolContext factory', async () => {
      const { createToolContext } = await import('../src/tools/context.js');
      expect(createToolContext).toBeDefined();
      expect(typeof createToolContext).toBe('function');
    });
  });

  describe('ToolRegistry', () => {
    it('should register and retrieve tools', async () => {
      const { getToolRegistry } = await import('../src/registry/index.js');

      const registry = getToolRegistry();

      registry.registerTool({
        tool: {
          name: 'test_tool',
          description: 'A test tool',
          inputSchema: { type: 'object', properties: {} },
        },
        category: 'system',
        keywords: ['test'],
        useCases: ['testing'],
      });

      const tool = registry.getTool('test_tool');
      expect(tool).toBeDefined();
      expect(tool?.tool.name).toBe('test_tool');
    });

    it('should search tools by keyword', async () => {
      const { getToolRegistry } = await import('../src/registry/index.js');

      const registry = getToolRegistry();

      registry.registerTool({
        tool: {
          name: 'jira_get_issues',
          description: 'Get JIRA issues',
          inputSchema: { type: 'object', properties: {} },
        },
        category: 'jira',
        keywords: ['jira', 'issues', 'tickets'],
        useCases: ['list issues', 'get tickets'],
      });

      const results = registry.searchTools('jira issues');
      expect(results.length).toBeGreaterThan(0);
      expect(results[0].tool.tool.name).toBe('jira_get_issues');
    });

    it('should get tools by category', async () => {
      const { getToolRegistry } = await import('../src/registry/index.js');

      const registry = getToolRegistry();

      registry.registerTool({
        tool: {
          name: 'slack_send_dm',
          description: 'Send a Slack DM',
          inputSchema: { type: 'object', properties: {} },
        },
        category: 'messaging',
        keywords: ['slack', 'dm', 'message'],
        useCases: ['send direct message'],
      });

      const messagingTools = registry.getToolsByCategory('messaging');
      expect(messagingTools.length).toBe(1);
      expect(messagingTools[0].tool.name).toBe('slack_send_dm');
    });

    it('should return all categories', async () => {
      const { getToolRegistry } = await import('../src/registry/index.js');

      const registry = getToolRegistry();
      const categories = registry.getAllCategories();

      expect(categories.length).toBeGreaterThan(0);
      expect(categories.map((c) => c.name)).toContain('jira');
      expect(categories.map((c) => c.name)).toContain('messaging');
      expect(categories.map((c) => c.name)).toContain('system');
    });
  });

  describe('ToolContext', () => {
    it('should create context with config', async () => {
      const { createToolContext } = await import('../src/tools/context.js');
      const { getConfig } = await import('@orientbot/core');

      const config = getConfig();
      const context = createToolContext(config);

      expect(context).toBeDefined();
      expect(context.config).toBe(config);
      expect(context.correlationId).toBeDefined();
      expect(context.jiraClient).toBeDefined();
    });

    it('should accept custom correlation ID', async () => {
      const { createToolContext } = await import('../src/tools/context.js');
      const { getConfig } = await import('@orientbot/core');

      const config = getConfig();
      const context = createToolContext(config, {
        correlationId: 'custom-123',
      });

      expect(context.correlationId).toBe('custom-123');
    });
  });

  describe('Tool Execution', () => {
    it('should register handler and execute', async () => {
      const { getToolRegistry } = await import('../src/registry/index.js');
      const { createToolContext } = await import('../src/tools/context.js');
      const { getConfig } = await import('@orientbot/core');

      const registry = getToolRegistry();

      const mockHandler = vi.fn().mockResolvedValue({ success: true, data: 'result' });

      registry.registerTool(
        {
          tool: {
            name: 'executable_tool',
            description: 'An executable tool',
            inputSchema: { type: 'object', properties: {} },
          },
          category: 'system',
          keywords: ['test'],
          useCases: ['testing'],
        },
        mockHandler
      );

      const handler = registry.getHandler('executable_tool');
      expect(handler).toBeDefined();

      const config = getConfig();
      const context = createToolContext(config);
      const result = await handler!({}, context);

      expect(mockHandler).toHaveBeenCalledWith({}, context);
      expect(result).toEqual({ success: true, data: 'result' });
    });
  });
});
