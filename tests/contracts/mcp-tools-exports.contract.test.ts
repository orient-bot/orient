/**
 * Contract Tests for @orientbot/mcp-tools
 *
 * These tests verify that the public API of @orientbot/mcp-tools remains stable.
 */

import { describe, it, expect, vi, beforeAll } from 'vitest';

// Mock logger for registry
vi.mock('@orientbot/core', () => ({
  createServiceLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    startOperation: () => ({ success: vi.fn(), failure: vi.fn() }),
  }),
}));

let mcpToolsModule: typeof import('../../packages/mcp-tools/src/index.ts');

beforeAll(async () => {
  mcpToolsModule = await import('../../packages/mcp-tools/src/index.ts');
}, 60000);

describe('@orientbot/mcp-tools Public API Contract', () => {
  describe('Tool Base Class Exports', () => {
    it('should export MCPTool class', async () => {
      const { MCPTool } = mcpToolsModule;
      expect(MCPTool).toBeDefined();
      expect(typeof MCPTool).toBe('function');
    }, 30000); // Extended timeout for initial module load

    it('should export createTool function', async () => {
      const { createTool } = mcpToolsModule;
      expect(typeof createTool).toBe('function');
    });
  });

  describe('Context Exports', () => {
    it('should export createToolContext function', async () => {
      const { createToolContext } = mcpToolsModule;
      expect(typeof createToolContext).toBe('function');
    });

    it('should export clearContextCache function', async () => {
      const { clearContextCache } = mcpToolsModule;
      expect(typeof clearContextCache).toBe('function');
    });

    it('should export requireJiraClient function', async () => {
      const { requireJiraClient } = mcpToolsModule;
      expect(typeof requireJiraClient).toBe('function');
    });
  });

  describe('Registry Exports', () => {
    it('should export ToolRegistry class', async () => {
      const { ToolRegistry } = mcpToolsModule;
      expect(ToolRegistry).toBeDefined();
      expect(typeof ToolRegistry).toBe('function');
    });

    it('should export getToolRegistry function', async () => {
      const { getToolRegistry } = mcpToolsModule;
      expect(typeof getToolRegistry).toBe('function');

      const registry = getToolRegistry();
      expect(typeof registry.registerTool).toBe('function');
      expect(typeof registry.getTool).toBe('function');
      expect(typeof registry.searchTools).toBe('function');
    });

    it('should export resetToolRegistry function', async () => {
      const { resetToolRegistry } = mcpToolsModule;
      expect(typeof resetToolRegistry).toBe('function');
    });
  });

  describe('Registry Functionality', () => {
    it('should register and retrieve tools', async () => {
      const { getToolRegistry, resetToolRegistry } = mcpToolsModule;

      resetToolRegistry();
      const registry = getToolRegistry();

      const metadata = {
        tool: {
          name: 'test_tool',
          description: 'Test',
          inputSchema: { type: 'object' as const, properties: {} },
        },
        category: 'jira' as const,
        keywords: ['test'],
        useCases: ['Testing'],
      };

      registry.registerTool(metadata);

      const retrieved = registry.getTool('test_tool');
      expect(retrieved).toEqual(metadata);

      resetToolRegistry();
    });
  });
});
