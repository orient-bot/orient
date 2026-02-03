#!/usr/bin/env node
/**
 * Base MCP Server Factory
 *
 * Creates MCP servers with filtered tools based on configuration.
 * This allows different server types (coding, assistant, core) to expose
 * only the tools relevant to their use case.
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

import {
  createServiceLogger,
  generateCorrelationId,
  mcpToolLogger,
  clearCorrelationId,
} from '@orient-bot/core';
import { setSecretOverrides } from '@orient-bot/core';
import { createSecretsService } from '@orient-bot/database-services';
import { McpServerConfig, McpServerType, SERVER_CONFIGS } from './types.js';
import { filterTools, filterToolsByConnection, isToolAvailable } from './tool-filter.js';

// Import the executeToolCall function from the main server
// This keeps all tool execution logic in one place
import { executeToolCallFromRegistry } from './tool-executor.js';

const serverLogger = createServiceLogger('mcp-server');
const secretsService = createSecretsService();
const DEFAULT_MAX_CONTENT_CHARS = 200_000;

function getMaxContentChars(): number {
  const raw = process.env.ORIENT_MCP_MAX_CONTENT_CHARS;
  if (!raw) return DEFAULT_MAX_CONTENT_CHARS;
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_MAX_CONTENT_CHARS;
}

function truncateToolResult(result: {
  content: Array<{ type: string; text?: string }>;
  isError?: boolean;
  truncated?: boolean;
}): {
  content: Array<{ type: string; text?: string }>;
  isError?: boolean;
  truncated?: boolean;
} {
  if (!result?.content?.length) return result;

  const maxChars = getMaxContentChars();
  let truncated = false;

  const content = result.content.map((item) => {
    if (item?.type !== 'text' || typeof item.text !== 'string') return item;
    if (item.text.length <= maxChars) return item;

    truncated = true;
    const trimmed = item.text.slice(0, maxChars);
    return {
      ...item,
      text: `${trimmed}\n\n[truncated ${item.text.length - maxChars} chars]`,
    };
  });

  if (!truncated) return result;
  return { ...result, content, truncated: true };
}

/**
 * Creates an MCP server with the specified configuration
 */
export function createMcpServer(config: McpServerConfig): Server {
  const server = new Server(
    {
      name: config.name,
      version: config.version,
    },
    {
      capabilities: {
        tools: {},
      },
    }
  );

  serverLogger.info('MCP Server created', {
    type: config.type,
    name: config.name,
    version: config.version,
  });

  const configuredTools = filterTools(config.tools);

  serverLogger.info('Tools configured', {
    serverType: config.type,
    toolCount: configuredTools.length,
    tools: configuredTools.map((t) => t.name),
  });

  // Handle list tools request - return only filtered tools
  server.setRequestHandler(ListToolsRequestSchema, async () => {
    const availableTools = await filterToolsByConnection(config.tools);
    serverLogger.debug('ListTools request received', {
      serverType: config.type,
      toolCount: availableTools.length,
    });
    return { tools: availableTools };
  });

  // Handle tool calls
  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;
    const correlationId = generateCorrelationId();
    const startTime = Date.now();

    // Check if tool is available for this server
    if (!isToolAvailable(name, config.tools)) {
      serverLogger.warn('Tool not available for this server', {
        tool: name,
        serverType: config.type,
      });
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              error: `Tool '${name}' is not available on ${config.name}. Use a different MCP server or discover_tools to find the right server.`,
            }),
          },
        ],
        isError: true,
      };
    }

    // Log tool invocation
    mcpToolLogger.toolStart(name, (args as Record<string, unknown>) || {}, correlationId);

    try {
      const result = await executeToolCallFromRegistry(name, args as Record<string, unknown>);
      const duration = Date.now() - startTime;

      // Log successful completion
      mcpToolLogger.toolSuccess(name, result, duration);
      clearCorrelationId();

      return truncateToolResult(result);
    } catch (error) {
      const duration = Date.now() - startTime;

      // Log error
      mcpToolLogger.toolError(name, error instanceof Error ? error : String(error), duration);
      clearCorrelationId();

      const errorMessage = error instanceof Error ? error.message : String(error);
      return {
        content: [{ type: 'text', text: JSON.stringify({ error: errorMessage }) }],
        isError: true,
      };
    }
  });

  return server;
}

/**
 * Load secrets from database and set as environment overrides
 * This enables Google OAuth and other services that need credentials
 */
async function loadSecretsFromDatabase(): Promise<void> {
  try {
    const secrets = await secretsService.getAllSecrets();
    if (Object.keys(secrets).length > 0) {
      setSecretOverrides(secrets);
      serverLogger.info('Loaded secrets from database', {
        count: Object.keys(secrets).length,
        keys: Object.keys(secrets),
      });
    } else {
      serverLogger.debug('No secrets found in database');
    }
  } catch (error) {
    serverLogger.warn('Failed to load secrets from database', {
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

/**
 * Creates and starts an MCP server of the specified type
 */
export async function startMcpServer(type: McpServerType): Promise<void> {
  const config = SERVER_CONFIGS[type];
  if (!config) {
    throw new Error(`Unknown server type: ${type}`);
  }

  serverLogger.info('Starting MCP server...', { type });

  // Load secrets from database before starting (for Google OAuth, etc.)
  await loadSecretsFromDatabase();

  const server = createMcpServer(config);
  const transport = new StdioServerTransport();
  await server.connect(transport);

  serverLogger.info('MCP server running on stdio', {
    type: config.type,
    name: config.name,
    tools: (await filterToolsByConnection(config.tools)).map((t) => t.name),
  });
}

/**
 * Main entry point - can be called with server type as argument
 */
export async function main(serverType: McpServerType = 'coding'): Promise<void> {
  try {
    await startMcpServer(serverType);
  } catch (error) {
    serverLogger.error('Failed to start MCP server', {
      error: error instanceof Error ? error.message : String(error),
    });
    process.exit(1);
  }
}

// Export for testing
export { SERVER_CONFIGS } from './types.js';
