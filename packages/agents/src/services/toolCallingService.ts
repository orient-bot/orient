/**
 * Tool Calling Service - Shared Claude tool execution logic
 *
 * Provides reusable tool-calling loop with guardrails for
 * both Slack (AgentService) and WhatsApp (WhatsAppAgentService).
 *
 * Features:
 * - Configurable iteration limits
 * - Duplicate tool call detection
 * - Extensible tool execution via executor function
 * - Comprehensive logging
 */

import Anthropic from '@anthropic-ai/sdk';
import { createServiceLogger } from '@orient/core';

const logger = createServiceLogger('tool-calling');

/**
 * Configuration for tool calling behavior
 */
export interface ToolCallingConfig {
  /** Maximum tool iterations before breaking (default: 15) */
  maxIterations?: number;
  /** Maximum duplicate tool calls before error (default: 3) */
  maxDuplicateCalls?: number;
  /** Maximum tokens for response (default: 4096) */
  maxTokens?: number;
  /** Claude model to use */
  model?: string;
  /** System prompt for Claude */
  systemPrompt: string;
  /** Permission guardrails */
  permission?: {
    engine: ToolPermissionEngine;
    context: PermissionContext;
    agentId: string;
  };
}

/**
 * Result from a tool execution
 */
export interface ToolResult {
  success: boolean;
  data?: unknown;
  error?: string;
}

/**
 * Function type for tool execution
 * Receives tool name, input, and optional context
 * Returns a ToolResult with success/failure and data
 */
export type ToolExecutor = (
  toolName: string,
  input: Record<string, unknown>,
  context?: unknown
) => Promise<ToolResult>;

/**
 * Result from the tool-calling loop
 */
export interface ToolCallingResult {
  /** The final text response from Claude */
  response: string;
  /** Number of tool iterations performed */
  toolIterations: number;
  /** Names of all tools that were called */
  toolsUsed: string[];
  /** Whether the loop exceeded limits */
  exceededLimits: boolean;
}

export interface PermissionContext {
  platform: string;
  userId: string;
  sessionId: string;
  channelId?: string;
  threadId?: string;
  chatId?: string;
  metadata?: Record<string, unknown>;
}

export interface ToolPermissionEngine {
  evaluateToolCall(
    tool: { name: string; input: Record<string, unknown> },
    context: PermissionContext,
    agentId: string
  ): Promise<{ action: 'allow' | 'deny' | 'ask'; policy?: { id: string } }>;
  requestApproval(input: {
    tool: { name: string; input: Record<string, unknown> };
    context: PermissionContext;
    agentId: string;
    policy: { id: string };
  }): Promise<{ status: 'pending' | 'approved' | 'denied' | 'expired' }>;
}

/**
 * Default configuration values
 */
const DEFAULT_CONFIG = {
  maxIterations: 15,
  maxDuplicateCalls: 3,
  maxTokens: 4096,
  model: 'claude-sonnet-4-20250514',
} as const;

/**
 * Execute the tool-calling loop with Claude
 *
 * This function handles the iterative process of:
 * 1. Sending messages to Claude with available tools
 * 2. Executing tool calls when Claude requests them
 * 3. Returning results to Claude
 * 4. Continuing until Claude provides a final text response
 *
 * Includes guardrails for:
 * - Maximum iteration limits
 * - Duplicate tool call detection
 * - Graceful error handling
 *
 * @param anthropic - The Anthropic client instance
 * @param messages - Conversation messages in Anthropic format
 * @param tools - Available tool definitions
 * @param executor - Function to execute individual tools
 * @param config - Configuration options
 * @param context - Optional context passed to the executor
 * @returns The final response and metadata about the tool-calling process
 */
export async function executeToolLoop(
  anthropic: Anthropic,
  messages: Anthropic.MessageParam[],
  tools: Anthropic.Tool[],
  executor: ToolExecutor,
  config: ToolCallingConfig,
  context?: unknown
): Promise<ToolCallingResult> {
  const op = logger.startOperation('executeToolLoop');

  const maxIterations = config.maxIterations ?? DEFAULT_CONFIG.maxIterations;
  const maxDuplicateCalls = config.maxDuplicateCalls ?? DEFAULT_CONFIG.maxDuplicateCalls;
  const maxTokens = config.maxTokens ?? DEFAULT_CONFIG.maxTokens;
  const model = config.model ?? DEFAULT_CONFIG.model;

  // Make initial Claude request
  let response = await anthropic.messages.create({
    model,
    max_tokens: maxTokens,
    system: config.systemPrompt,
    tools,
    messages,
  });

  logger.debug('Initial Claude response', {
    stopReason: response.stop_reason,
    contentBlocks: response.content.length,
  });

  // Track iterations and duplicate calls
  let iterationCount = 0;
  const toolCallHistory = new Map<string, number>();
  const toolsUsed: string[] = [];
  let exceededLimits = false;

  // Handle tool use in a loop with guardrails
  while (response.stop_reason === 'tool_use') {
    iterationCount++;

    // Guardrail 1: Max iterations limit
    if (iterationCount > maxIterations) {
      logger.warn('Tool loop exceeded max iterations - breaking out', {
        iterations: iterationCount,
        maxAllowed: maxIterations,
      });
      op.failure('Tool loop exceeded max iterations');
      exceededLimits = true;
      return {
        response:
          '⚠️ I tried too many operations without reaching a conclusion. Please try rephrasing your question or breaking it into smaller parts.',
        toolIterations: iterationCount,
        toolsUsed,
        exceededLimits: true,
      };
    }

    // Warn when approaching limit
    if (iterationCount === maxIterations - 2) {
      logger.warn('Approaching max tool iterations', { iterations: iterationCount });
    }

    const toolUseBlocks = response.content.filter(
      (block): block is Anthropic.ToolUseBlock => block.type === 'tool_use'
    );

    const toolResults: Anthropic.ToolResultBlockParam[] = [];

    for (const toolUse of toolUseBlocks) {
      if (config.permission) {
        const toolCall = {
          name: toolUse.name,
          input: toolUse.input as Record<string, unknown>,
        };
        const decision = await config.permission.engine.evaluateToolCall(
          toolCall,
          config.permission.context,
          config.permission.agentId
        );

        if (decision.action === 'deny') {
          toolResults.push({
            type: 'tool_result',
            tool_use_id: toolUse.id,
            content: JSON.stringify({
              success: false,
              error: `PERMISSION DENIED: Tool ${toolUse.name} is not allowed.`,
            }),
            is_error: true,
          });
          continue;
        }

        if (decision.action === 'ask') {
          if (!decision.policy) {
            toolResults.push({
              type: 'tool_result',
              tool_use_id: toolUse.id,
              content: JSON.stringify({
                success: false,
                error: `PERMISSION ERROR: Approval policy missing for ${toolUse.name}.`,
              }),
              is_error: true,
            });
            continue;
          }

          const approval = await config.permission.engine.requestApproval({
            tool: toolCall,
            context: config.permission.context,
            agentId: config.permission.agentId,
            policy: decision.policy,
          });

          if (approval.status !== 'approved') {
            toolResults.push({
              type: 'tool_result',
              tool_use_id: toolUse.id,
              content: JSON.stringify({
                success: false,
                error: `PERMISSION ${approval.status.toUpperCase()}: User did not approve tool ${toolUse.name}.`,
              }),
              is_error: true,
            });
            continue;
          }
        }
      }

      // Guardrail 2: Detect duplicate tool calls
      const toolSignature = `${toolUse.name}:${JSON.stringify(toolUse.input)}`;
      const duplicateCount = (toolCallHistory.get(toolSignature) || 0) + 1;
      toolCallHistory.set(toolSignature, duplicateCount);

      if (duplicateCount > maxDuplicateCalls) {
        logger.warn('Duplicate tool call detected - returning error to Claude', {
          tool: toolUse.name,
          duplicateCount,
          maxAllowed: maxDuplicateCalls,
        });

        toolResults.push({
          type: 'tool_result',
          tool_use_id: toolUse.id,
          content: JSON.stringify({
            success: false,
            error: `LOOP DETECTED: You have already called ${toolUse.name} with the same parameters ${duplicateCount} times. Please provide a final answer based on the information you already have, or try a different approach.`,
          }),
          is_error: true,
        });
        continue;
      }

      // Track tool usage
      if (!toolsUsed.includes(toolUse.name)) {
        toolsUsed.push(toolUse.name);
      }

      logger.debug('Executing tool', {
        tool: toolUse.name,
        input: toolUse.input,
        iteration: iterationCount,
      });

      try {
        const result = await executor(
          toolUse.name,
          toolUse.input as Record<string, unknown>,
          context
        );

        toolResults.push({
          type: 'tool_result',
          tool_use_id: toolUse.id,
          content: JSON.stringify(result),
        });
      } catch (error) {
        logger.error('Tool executor threw an error', {
          tool: toolUse.name,
          error: error instanceof Error ? error.message : String(error),
        });

        toolResults.push({
          type: 'tool_result',
          tool_use_id: toolUse.id,
          content: JSON.stringify({
            success: false,
            error: error instanceof Error ? error.message : String(error),
          }),
          is_error: true,
        });
      }
    }

    // Continue the conversation with tool results
    response = await anthropic.messages.create({
      model,
      max_tokens: maxTokens,
      system: config.systemPrompt,
      tools,
      messages: [
        ...messages,
        { role: 'assistant', content: response.content },
        { role: 'user', content: toolResults },
      ],
    });

    logger.debug('Claude response after tool use', {
      stopReason: response.stop_reason,
      iteration: iterationCount,
    });
  }

  // Log successful completion with iteration count
  if (iterationCount > 0) {
    logger.info('Tool loop completed successfully', { totalIterations: iterationCount });
  }

  // Extract text response
  const textBlocks = response.content.filter(
    (block): block is Anthropic.TextBlock => block.type === 'text'
  );

  const finalResponse = textBlocks.map((b) => b.text).join('\n');
  op.success('Claude conversation complete', {
    responseLength: finalResponse.length,
    toolIterations: iterationCount,
    toolsUsed,
  });

  return {
    response: finalResponse,
    toolIterations: iterationCount,
    toolsUsed,
    exceededLimits,
  };
}

/**
 * Create a standardized tool result for success
 */
export function successResult(data: unknown): ToolResult {
  return { success: true, data };
}

/**
 * Create a standardized tool result for failure
 */
export function failureResult(error: string): ToolResult {
  return { success: false, error };
}
