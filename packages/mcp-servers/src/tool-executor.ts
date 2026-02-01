/**
 * Tool Executor
 *
 * Routes tool calls through the ToolExecutorRegistry and handles
 * built-in tools like discover_tools.
 */

import {
  getToolExecutorRegistry,
  ToolDiscoveryService,
  formatDiscoveryResult,
  type DiscoveryInput,
} from '@orient-bot/agents';
import { createServiceLogger } from '@orient-bot/core';

const logger = createServiceLogger('tool-executor');
const discoveryLogger = createServiceLogger('tool-discovery');

/**
 * Executes a tool call using the registry
 *
 * Tries the ToolExecutorRegistry first, then falls back to built-in
 * handlers (discover_tools).
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
  // Try the executor registry first (modern tools)
  const executorRegistry = getToolExecutorRegistry();
  const registeredResult = await executorRegistry.execute(name, args);

  if (registeredResult !== null) {
    return registeredResult as {
      content: Array<{ type: string; text: string }>;
      isError?: boolean;
    };
  }

  // Handle built-in tools
  if (name === 'discover_tools') {
    return await handleDiscoverTools(args);
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
async function handleDiscoverTools(args: Record<string, unknown>): Promise<{
  content: Array<{ type: string; text: string }>;
}> {
  const op = discoveryLogger.startOperation('discover', args);

  try {
    const toolDiscoveryService = new ToolDiscoveryService();
    const input = args as unknown as DiscoveryInput;
    const result = await toolDiscoveryService.discover(input);
    const formattedResult = formatDiscoveryResult(result, {
      includeTools: Boolean(input.includeTools),
    });

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
