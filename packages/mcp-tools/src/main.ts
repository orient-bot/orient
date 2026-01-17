#!/usr/bin/env node
/**
 * MCP Tools Server Entry Point
 *
 * This is the main entry point for running the MCP tools server.
 * It's used as a sidecar with OpenCode to provide JIRA, Slack, and other tools.
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { getToolRegistry, createToolContext } from './index.js';
import {
  createServiceLogger,
  loadConfig,
  getConfig,
  setSecretOverrides,
  startConfigPoller,
} from '@orient/core';
import { createSecretsService } from '@orient/database-services';

const logger = createServiceLogger('mcp-server');
const secretsService = createSecretsService();

async function loadSecretOverrides(): Promise<void> {
  try {
    const secrets = await secretsService.getAllSecrets();
    if (Object.keys(secrets).length > 0) {
      setSecretOverrides(secrets);
    }
  } catch (error) {
    logger.warn('Failed to load secrets from database', { error: String(error) });
  }
}

async function main(): Promise<void> {
  const op = logger.startOperation('startup');

  logger.info('Starting MCP Tools Server...');

  try {
    await loadSecretOverrides();
    const pollUrl = process.env.ORIENT_CONFIG_POLL_URL;
    if (pollUrl) {
      startConfigPoller({
        url: pollUrl,
        intervalMs: parseInt(process.env.ORIENT_CONFIG_POLL_INTERVAL_MS || '30000', 10),
      });
    }

    // Load configuration
    await loadConfig();
    const config = getConfig();

    // Get the tool registry
    const registry = getToolRegistry();

    // Create the MCP server
    const server = new Server(
      {
        name: 'orienter-mcp-tools',
        version: '1.0.0',
      },
      {
        capabilities: {
          tools: {},
        },
      }
    );

    // Handler for listing tools
    server.setRequestHandler(ListToolsRequestSchema, async () => {
      const tools = registry.getAllTools();
      return {
        tools: tools.map((metadata) => ({
          name: metadata.tool.name,
          description: metadata.tool.description,
          inputSchema: metadata.tool.inputSchema,
        })),
      };
    });

    // Handler for calling tools
    server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;

      logger.info('Tool call received', { name, args });

      try {
        // Create a tool context with the loaded config
        const context = createToolContext(config);

        // Get the tool handler
        const handler = registry.getHandler(name);
        if (!handler) {
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify({ error: `Unknown tool: ${name}` }),
              },
            ],
          };
        }

        // Execute the tool handler
        const result = await handler(args || {}, context);

        return {
          content: [
            {
              type: 'text',
              text: typeof result === 'string' ? result : JSON.stringify(result, null, 2),
            },
          ],
        };
      } catch (error) {
        logger.error('Tool execution failed', { name, error: String(error) });
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({ error: String(error) }),
            },
          ],
          isError: true,
        };
      }
    });

    // Create stdio transport
    const transport = new StdioServerTransport();

    // Connect and run
    await server.connect(transport);

    op.success('MCP Tools Server started successfully');

    logger.info('MCP Tools Server running on stdio');
  } catch (error) {
    op.failure(error as Error);
    logger.error('Failed to start MCP Tools Server', { error: String(error) });
    process.exit(1);
  }
}

main().catch((error) => {
  logger.error('Unhandled error in main', { error: String(error) });
  process.exit(1);
});
