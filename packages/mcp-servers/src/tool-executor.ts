/**
 * Tool Executor
 *
 * Bridges the new multi-server architecture with the existing tool execution logic.
 * This module provides a unified way to execute tools regardless of which server
 * is making the request.
 *
 * ============================================================================
 * GRADUAL MIGRATION PATTERN: Legacy Executor Fallback
 * ============================================================================
 *
 * This module implements a gradual migration from a monolithic switch statement
 * (in mcp-server.ts) to a modular registry-based tool execution system.
 *
 * Migration Strategy:
 * 1. New tools register via ToolExecutorRegistry (@orientbot/agents)
 * 2. Old tools fall back to legacyExecutor (monolithic switch statement)
 * 3. Tools are migrated one at a time to the registry
 * 4. Once all tools migrated, remove legacyExecutor fallback
 *
 * Execution Priority:
 * 1. ToolExecutorRegistry (modern, handler-based) - PREFERRED
 * 2. Built-in handlers (discover_tools, etc.)
 * 3. Legacy executor fallback - DEPRECATED
 *
 * Benefits:
 * - Zero disruption during migration
 * - Clear separation between old and new patterns
 * - Easy to track migration progress
 * - Can migrate incrementally
 *
 * Migration Progress:
 * - See docs/migration/LEGACY-CONFIG-REFERENCES.md for tracking
 * - Target: Complete migration by Q2 2026
 * - Then remove this fallback entirely
 *
 * Related Files:
 * - packages/agents/src/registry/tool-executor-registry.ts - Modern system
 * - packages/mcp-servers/src/mcp-server.ts - Legacy switch statement
 * - packages/mcp-tools/src/ - Modular tool implementations
 */

import { getToolExecutorRegistry } from '@orientbot/agents';
import {
  ToolDiscoveryService,
  formatDiscoveryResult,
  type DiscoveryInput,
} from '@orientbot/agents';
import { createServiceLogger } from '@orientbot/core';

const logger = createServiceLogger('tool-executor');
const discoveryLogger = createServiceLogger('tool-discovery');

// ============================================================================
// Legacy Executor Fallback (Intentional - Gradual Migration Pattern)
// ============================================================================

/**
 * Legacy executor function from monolithic mcp-server.ts
 *
 * This is lazily loaded and serves as a fallback for tools that haven't
 * been migrated to the ToolExecutorRegistry yet.
 *
 * @internal Do not use directly - accessed via executeToolCallFromRegistry
 */
let legacyExecutor: ((name: string, args: Record<string, unknown>) => Promise<unknown>) | null =
  null;

/**
 * Sets the legacy executor function
 *
 * Called during server initialization to inject the switch-statement based executor.
 * This allows old tools to continue working while we gradually migrate to the
 * registry pattern.
 *
 * @param executor - Function that executes tools using the legacy switch statement
 * @internal Only called from mcp-server.ts initialization
 */
export function setLegacyExecutor(
  executor: (name: string, args: Record<string, unknown>) => Promise<unknown>
): void {
  legacyExecutor = executor;
}

/**
 * Executes a tool call using the registry with fallback to legacy executor
 *
 * This is the main entry point for tool execution. It tries multiple sources
 * in priority order to find and execute the requested tool.
 *
 * Execution Priority:
 * 1. ToolExecutorRegistry (modern, handler-based) - PREFERRED ✅
 * 2. Built-in handlers (discover_tools, etc.) - CURRENT
 * 3. Legacy switch statement executor - DEPRECATED ⚠️
 *
 * @param name - Tool name to execute (e.g., "get_issue", "send_message")
 * @param args - Tool arguments as key-value pairs
 * @returns Tool execution result with content array
 *
 * @example
 * ```typescript
 * const result = await executeToolCallFromRegistry('get_issue', {
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

  // Priority 3: Fall back to legacy executor if available (gradual migration)
  if (legacyExecutor) {
    try {
      const result = await legacyExecutor(name, args);
      return result as { content: Array<{ type: string; text: string }>; isError?: boolean };
    } catch (error) {
      logger.error('Legacy executor failed', { name, error });
      throw error;
    }
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
