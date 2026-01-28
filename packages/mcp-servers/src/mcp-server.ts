#!/usr/bin/env node
/**
 * Orient - MCP Server
 *
 * Exposes the full tool registry via a single MCP server.
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import dotenv from 'dotenv';

// Load environment variables from .env file
dotenv.config();

import {
  clearCorrelationId,
  createServiceLogger,
  generateCorrelationId,
  mcpToolLogger,
} from '@orient/core';
import { ToolDiscoveryService, getToolRegistry } from '@orient/agents';
import { executeToolCallFromRegistry } from './tool-executor.js';

const serverLogger = createServiceLogger('mcp-server');

// Create the MCP server
const server = new Server(
  {
    name: 'orienter',
    version: '1.0.0',
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

serverLogger.info('MCP Server created', { name: 'orienter', version: '1.0.0' });

// Handle list tools request - return all tools so they can be called
server.setRequestHandler(ListToolsRequestSchema, async () => {
  const discoveryTool = ToolDiscoveryService.getDiscoveryToolDefinition();
  const allRegisteredTools = getToolRegistry().getAllToolDefinitions();
  const allTools = [discoveryTool, ...allRegisteredTools];

  serverLogger.debug('ListTools request received', {
    mode: 'all-tools',
    totalToolsAvailable: getToolRegistry().size,
    exposedTools: allTools.length,
  });
  return { tools: allTools };
});

// Handle tool calls with comprehensive logging
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;
  const correlationId = generateCorrelationId();
  const startTime = Date.now();

  // Log tool invocation
  mcpToolLogger.toolStart(name, (args as Record<string, unknown>) || {}, correlationId);

  try {
    const result = await executeToolCallFromRegistry(name, args as Record<string, unknown>);
    const duration = Date.now() - startTime;

    // Log successful completion
    mcpToolLogger.toolSuccess(name, result, duration);
    clearCorrelationId();

    return result;
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

// Start the server
async function main() {
  serverLogger.info('Starting MCP server...');

  const transport = new StdioServerTransport();
  await server.connect(transport);

  serverLogger.info('Orient MCP Server running on stdio', {
    tools: getToolRegistry()
      .getAllToolDefinitions()
      .map((tool) => tool.name),
  });
}

// Main entry point
main().catch((error) => {
  serverLogger.error('Failed to start MCP server', {
    error: error instanceof Error ? error.message : String(error),
  });
  process.exit(1);
});
