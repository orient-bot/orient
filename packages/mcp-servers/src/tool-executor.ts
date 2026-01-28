/**
 * Tool Executor
 *
 * Bridges the new multi-server architecture with the existing tool execution logic.
 * This module provides a unified way to execute tools regardless of which server
 * is making the request.
 *
 * Execution Priority:
 * 1. ToolExecutorRegistry (modern, handler-based) - PREFERRED
 * 2. Built-in handlers (discover_tools, etc.)
 *
 * Related Files:
 * - packages/agents/src/services/toolRegistry.ts - Tool executor registry
 * - packages/mcp-tools/src/ - Modular tool implementations
 */

import { getToolExecutorRegistry } from '@orient/agents';
import { ToolDiscoveryService, formatDiscoveryResult, type DiscoveryInput } from '@orient/agents';
import { createServiceLogger } from '@orient/core';

const logger = createServiceLogger('tool-executor');
const discoveryLogger = createServiceLogger('tool-discovery');

/**
 * Executes a tool call using the registry
 *
 * This is the main entry point for tool execution. It tries multiple sources
 * in priority order to find and execute the requested tool.
 *
 * Execution Priority:
 * 1. ToolExecutorRegistry (modern, handler-based) - PREFERRED ✅
 * 2. Built-in handlers (discover_tools, etc.) - CURRENT
 *
 * @param name - Tool name to execute (e.g., "get_issue", "send_message")
 * @param args - Tool arguments as key-value pairs
 * @returns Tool execution result with content array
 *
 * @example
 * ```typescript
 * const result = await executeToolCallFromRegistry('jira_get_issue', {
 *   issueKey: 'PROJ-123'
 * });
 * ```
 */
export async function executeToolCallFromRegistry(
  name: string,
  args: Record<string, unknown>
): Promise<{ content: Array<{ type: string; text: string }>; isError?: boolean }> {
  // Priority 1: Try the executor registry first (modern tools)
  const executorRegistry = getToolExecutorRegistry();
  const registeredResult = await executorRegistry.execute(name, args);

  if (registeredResult !== null) {
    return registeredResult as {
      content: Array<{ type: string; text: string }>;
      isError?: boolean;
    };
  }

  // Priority 2: Handle built-in tools
  if (name === 'discover_tools') {
    return handleDiscoverTools(args);
  }

  // Tool not found in any executor
  logger.warn('Tool not found in any executor', { name });
  return {
    content: [{ type: 'text', text: JSON.stringify({ error: `Unknown tool: ${name}` }) }],
    isError: true,
  };
}

/**
 * Handles discover_tools requests
 */
function handleDiscoverTools(args: Record<string, unknown>): {
  content: Array<{ type: string; text: string }>;
} {
  const op = discoveryLogger.startOperation('discover', args);

  try {
    const toolDiscoveryService = new ToolDiscoveryService();
    const input = args as unknown as DiscoveryInput;
    const result = toolDiscoveryService.discover(input);
    const formattedResult = formatDiscoveryResult(result);

    op.success('Discovery completed', {
      mode: input.mode,
      toolsFound: result.tools?.length || result.categories?.length || 0,
    });

    return {
      content: [{ type: 'text', text: formattedResult }],
    };
  } catch (error) {
    op.failure(error instanceof Error ? error : String(error));

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            error: error instanceof Error ? error.message : String(error),
          }),
        },
      ],
    };
  }
}

/**
 * Dynamically imports and executes a tool handler
 * This is used for tools that have been migrated to the modular pattern
 */
export async function executeModularTool(
  name: string,
  args: Record<string, unknown>,
  toolPath: string
): Promise<{ content: Array<{ type: string; text: string }>; isError?: boolean }> {
  try {
    const toolModule = await import(toolPath);
    const handler = toolModule.default || toolModule[name];

    if (typeof handler === 'function') {
      return await handler(args);
    }

    throw new Error(`Tool ${name} not found in module ${toolPath}`);
  } catch (error) {
    logger.error('Failed to execute modular tool', { name, toolPath, error });
    throw error;
  }
}
