/**
 * Eval API Routes
 *
 * Express routes for the eval HTTP API.
 */

import { Router, Request, Response } from 'express';
import { createServiceLogger } from '@orientbot/core';
import {
  getAgentRegistry,
  getToolRegistry,
  createOpenCodeClient,
  OpenCodeClient,
  OpenCodeMessage,
} from '@orientbot/agents';
import { createMockRegistry, MockServiceRegistry } from '../mocks/index.js';
import {
  AgentInvokeRequest,
  AgentInvokeResponse,
  ToolExecuteRequest,
  ToolExecuteResponse,
  AgentListItem,
  ToolListItem,
  HealthResponse,
} from './types.js';
import { ExecutionTrace, ToolCall } from '../types.js';
import { v4 as uuidv4 } from 'uuid';

// OpenCode server configuration
const OPENCODE_BASE_URL = process.env.OPENCODE_URL || 'http://localhost:4099';
const OPENCODE_DEFAULT_MODEL = process.env.OPENCODE_MODEL || 'anthropic/claude-haiku-4-5-20251001';

const logger = createServiceLogger('eval-routes');

/**
 * Routes configuration
 */
interface RoutesConfig {
  /** OpenCode server password for authentication */
  openCodePassword?: string;
}

/**
 * Create eval API routes
 */
export function createEvalRoutes(config?: RoutesConfig): Router {
  const router = Router();
  const mockRegistry = createMockRegistry();
  const startTime = Date.now();
  // Get password from config or fall back to environment variable
  const openCodePassword = config?.openCodePassword || process.env.OPENCODE_SERVER_PASSWORD;

  // Health check
  router.get('/health', (_req: Request, res: Response) => {
    const response: HealthResponse = {
      status: 'ok',
      service: 'eval-api',
      uptime: Date.now() - startTime,
      checks: {
        mockRegistry: mockRegistry.listServices().length > 0,
      },
    };
    res.json(response);
  });

  // List agents
  router.get('/agents', async (_req: Request, res: Response) => {
    try {
      const registry = getAgentRegistry();
      const agents = await registry.listAgents();

      const response: AgentListItem[] = await Promise.all(
        agents.map(
          async (agent: {
            id: string;
            name: string;
            description?: string | null;
            mode?: string | null;
            enabled?: boolean | null;
          }) => {
            const details = await registry.getAgentWithDetails(agent.id);
            return {
              id: agent.id,
              name: agent.name,
              description: agent.description || undefined,
              mode: agent.mode || undefined,
              enabled: agent.enabled ?? true,
              skills: details?.skills.map((s: { skillName: string }) => s.skillName),
              allowedTools: details?.tools
                .filter((t: { type: string }) => t.type === 'allow')
                .map((t: { pattern: string }) => t.pattern),
              deniedTools: details?.tools
                .filter((t: { type: string }) => t.type === 'deny')
                .map((t: { pattern: string }) => t.pattern),
            };
          }
        )
      );

      res.json({ agents: response });
    } catch (error) {
      logger.error('Failed to list agents', { error });
      res.status(500).json({ error: 'Failed to list agents' });
    }
  });

  // Get agent details
  router.get('/agents/:id', async (req: Request, res: Response) => {
    try {
      const registry = getAgentRegistry();
      const details = await registry.getAgentWithDetails(req.params.id);

      if (!details) {
        res.status(404).json({ error: 'Agent not found' });
        return;
      }

      const response: AgentListItem = {
        id: details.id,
        name: details.name,
        description: details.description || undefined,
        mode: details.mode || undefined,
        enabled: details.enabled ?? true,
        skills: details.skills.map((s: { skillName: string }) => s.skillName),
        allowedTools: details.tools
          .filter((t: { type: string }) => t.type === 'allow')
          .map((t: { pattern: string }) => t.pattern),
        deniedTools: details.tools
          .filter((t: { type: string }) => t.type === 'deny')
          .map((t: { pattern: string }) => t.pattern),
      };

      res.json(response);
    } catch (error) {
      logger.error('Failed to get agent', { error, agentId: req.params.id });
      res.status(500).json({ error: 'Failed to get agent' });
    }
  });

  // List tools
  router.get('/tools', (_req: Request, res: Response) => {
    try {
      const registry = getToolRegistry();
      const tools = registry.getAllToolDefinitions();

      const response: ToolListItem[] = tools.map((tool: { name: string; description?: string }) => {
        const metadata = registry.getTool(tool.name);
        return {
          name: tool.name,
          description: tool.description || '',
          category: metadata?.category || 'unknown',
          keywords: metadata?.keywords || [],
        };
      });

      res.json({ tools: response, total: response.length });
    } catch (error) {
      logger.error('Failed to list tools', { error });
      res.status(500).json({ error: 'Failed to list tools' });
    }
  });

  // Invoke agent
  router.post('/agent/invoke', async (req: Request, res: Response) => {
    const request = req.body as AgentInvokeRequest;
    const requestId = uuidv4();

    logger.info('Agent invoke request', {
      requestId,
      agentId: request.agentId,
      promptLength: request.prompt?.length,
    });

    try {
      // Validate request
      if (!request.agentId || !request.prompt) {
        res.status(400).json({ error: 'agentId and prompt are required' });
        return;
      }

      // Configure mocks if provided
      mockRegistry.reset();
      if (request.mocks) {
        mockRegistry.configure(request.mocks);
      }

      // Execute agent invocation
      const trace = await executeAgentInvocation(request, mockRegistry, openCodePassword);

      const response: AgentInvokeResponse = {
        requestId,
        agentId: request.agentId,
        model: request.model || 'default',
        success: true,
        trace,
      };

      res.json(response);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      logger.error('Agent invoke failed', { requestId, error: errorMessage });

      const response: AgentInvokeResponse = {
        requestId,
        agentId: request.agentId,
        model: request.model || 'default',
        success: false,
        error: errorMessage,
        trace: {
          toolCalls: [],
          skillActivations: [],
          responseText: '',
          tokens: { input: 0, output: 0 },
          latencyMs: 0,
        },
      };

      res.status(500).json(response);
    }
  });

  // Execute single tool
  router.post('/tools/execute', async (req: Request, res: Response) => {
    const request = req.body as ToolExecuteRequest;
    const startTime = Date.now();

    logger.info('Tool execute request', { toolName: request.toolName });

    try {
      // Validate request
      if (!request.toolName) {
        res.status(400).json({ error: 'toolName is required' });
        return;
      }

      // Configure mocks if provided
      mockRegistry.reset();
      if (request.mocks) {
        mockRegistry.configure(request.mocks);
      }

      // Check for mock response first
      const mockResponse = mockRegistry.getResponse(request.toolName);
      if (mockResponse) {
        const response: ToolExecuteResponse = {
          success: !mockResponse.error,
          result: mockResponse.response,
          error: mockResponse.error,
          durationMs: Date.now() - startTime,
        };
        res.json(response);
        return;
      }

      // Execute real tool
      const result = await executeToolCall(request.toolName, request.arguments);

      const response: ToolExecuteResponse = {
        success: true,
        result,
        durationMs: Date.now() - startTime,
      };

      res.json(response);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      logger.error('Tool execute failed', { toolName: request.toolName, error: errorMessage });

      const response: ToolExecuteResponse = {
        success: false,
        error: errorMessage,
        durationMs: Date.now() - startTime,
      };

      res.status(500).json(response);
    }
  });

  // Reset mocks
  router.post('/mocks/reset', (_req: Request, res: Response) => {
    mockRegistry.reset();
    res.json({ success: true });
  });

  // Configure mocks
  router.post('/mocks/configure', (req: Request, res: Response) => {
    try {
      mockRegistry.configure(req.body);
      res.json({ success: true, services: mockRegistry.listServices() });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      res.status(400).json({ error: errorMessage });
    }
  });

  return router;
}

/**
 * Execute an agent invocation with tracing
 *
 * Connects to the real OpenCode server to invoke agents with actual LLM reasoning.
 * The OpenCode server handles:
 * 1. Loading agent config via agentContextLoader
 * 2. Building the system prompt with skills
 * 3. Calling the LLM with the prompt
 * 4. Executing tool calls via MCP
 * 5. Returning the response with tool usage
 */
async function executeAgentInvocation(
  request: AgentInvokeRequest,
  _mockRegistry: MockServiceRegistry,
  openCodePassword?: string
): Promise<ExecutionTrace> {
  const startTime = Date.now();

  // Try to load agent config from database to get skill activations
  // Note: Agent might be defined in opencode.local.json instead of DB
  let skillActivations: string[] = [];
  try {
    const agentRegistry = getAgentRegistry();
    const agentDetails = await agentRegistry.getAgentWithDetails(request.agentId);
    if (agentDetails) {
      skillActivations = agentDetails.skills.map((s: { skillName: string }) => s.skillName);
    } else {
      logger.info('Agent not in database, may be defined in OpenCode config', {
        agentId: request.agentId,
      });
    }
  } catch (dbError) {
    // Agent not in database - this is OK, OpenCode may have it in config
    logger.info('Agent lookup failed (may be in OpenCode config)', {
      agentId: request.agentId,
      error: dbError instanceof Error ? dbError.message : String(dbError),
    });
  }

  // Create OpenCode client with longer timeout for evals (agent may do multiple MCP calls)
  const client = createOpenCodeClient(
    OPENCODE_BASE_URL,
    request.model || OPENCODE_DEFAULT_MODEL,
    openCodePassword
  );

  logger.info('Invoking real OpenCode agent', {
    agentId: request.agentId,
    model: request.model || OPENCODE_DEFAULT_MODEL,
    promptLength: request.prompt.length,
  });

  try {
    // Always create a FRESH session for each eval to prevent context bleed
    // (getOrCreateSession reuses sessions by title, which contaminates eval results)
    const session = await client.createSession(`Eval: ${request.agentId} ${uuidv4().slice(0, 8)}`);

    const result = await client.sendMessage(session.id, request.prompt, {
      model: request.model,
    });

    // Extract response text and tools used
    const responseText = client.extractTextResponse(result);

    // Get full tool history from session messages
    let toolsUsed: string[] = [];
    try {
      const messages = await client.getSessionMessages(session.id);
      toolsUsed = client.extractAllToolsUsed(messages);
    } catch {
      toolsUsed = client.extractToolsUsed(result);
    }

    // Convert tools used to ToolCall format
    const toolCalls: ToolCall[] = toolsUsed.map((toolName: string) => ({
      name: toolName,
      arguments: {}, // OpenCode doesn't return arguments in the summary
      result: { success: true }, // Simplified - we don't have the actual result
      durationMs: 0, // Not available from OpenCode response
    }));

    logger.info('OpenCode agent response received', {
      agentId: request.agentId,
      responseLength: responseText.length,
      toolsUsed,
      tokens: result.info.tokens,
      cost: result.info.cost,
    });

    return {
      toolCalls,
      skillActivations,
      responseText,
      tokens: {
        input: result.info.tokens.input,
        output: result.info.tokens.output,
      },
      latencyMs: Date.now() - startTime,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error('OpenCode agent invocation failed', {
      agentId: request.agentId,
      error: errorMessage,
    });
    throw new Error(`Agent invocation failed: ${errorMessage}`);
  }
}

/**
 * Execute a tool call directly
 *
 * Note: This is a placeholder - in production, this would call the actual
 * tool executor. For evals, we rely on mocks configured via the mock registry.
 */
async function executeToolCall(toolName: string, _args: Record<string, unknown>): Promise<unknown> {
  const registry = getToolRegistry();
  const tool = registry.getTool(toolName);

  if (!tool) {
    throw new Error(`Tool not found: ${toolName}`);
  }

  // For evals, we expect mocks to be configured
  // This is a fallback that returns a simple success response
  return { success: true, message: `Tool ${toolName} executed (no mock configured)` };
}
